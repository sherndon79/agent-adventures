#!/usr/bin/env node

/**
 * Test all models and show their raw responses
 */

import { config } from '../src/config/environment.js';

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    message: {
      type: 'string',
      description: 'A friendly greeting message'
    },
    timestamp: {
      type: 'string',
      description: 'ISO 8601 timestamp'
    },
    status: {
      type: 'string',
      enum: ['success', 'error'],
      description: 'Status of the response'
    }
  },
  required: ['message', 'status']
};

const SYSTEM_PROMPT = 'You are a helpful assistant that responds in JSON format.';
const USER_PROMPT = 'Please respond with a greeting message and current timestamp.';

function printHeader(text) {
  console.log('\n' + '='.repeat(80));
  console.log(`  ${text}`);
  console.log('='.repeat(80) + '\n');
}

// Helper to convert schema for Gemini
function convertJsonSchemaToGemini(schema) {
  if (!schema || typeof schema !== 'object') {
    return null;
  }

  const typeValue = typeof schema.type === 'string' ? schema.type.toLowerCase() : null;

  switch (typeValue) {
    case 'object': {
      const properties = {};
      const inputProps = schema.properties || {};
      for (const [key, value] of Object.entries(inputProps)) {
        const convertedChild = convertJsonSchemaToGemini(value);
        if (convertedChild) {
          properties[key] = convertedChild;
        }
      }

      const result = {
        type: 'OBJECT',
        properties
      };

      if (Array.isArray(schema.required) && schema.required.length > 0) {
        result.required = [...schema.required];
      }

      return result;
    }
    case 'string': {
      const result = { type: 'STRING' };
      if (schema.enum) {
        result.enum = schema.enum;
      }
      if (schema.description) {
        result.description = schema.description;
      }
      return result;
    }
    default:
      return null;
  }
}

// Helper to add additionalProperties: false for OpenAI
function addAdditionalPropertiesFalse(schema) {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const enhanced = { ...schema };

  if (enhanced.type === 'object' && !('additionalProperties' in enhanced)) {
    enhanced.additionalProperties = false;
  }

  if (enhanced.properties) {
    enhanced.properties = Object.fromEntries(
      Object.entries(enhanced.properties).map(([key, value]) => [
        key,
        addAdditionalPropertiesFalse(value)
      ])
    );
  }

  if (enhanced.items) {
    enhanced.items = addAdditionalPropertiesFalse(enhanced.items);
  }

  return enhanced;
}

async function testClaude() {
  printHeader('CLAUDE (Anthropic)');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('❌ API key not set\n');
    return;
  }

  const requestBody = {
    model: config.llm.anthropic.model,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: USER_PROMPT }
    ]
  };

  console.log('Request Body:');
  console.log(JSON.stringify(requestBody, null, 2));

  console.log('\n⏳ Making API call...\n');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    console.log('❌ Error:', error);
    return;
  }

  const responseData = await response.json();

  console.log('✅ Raw Response:');
  console.log(JSON.stringify(responseData, null, 2));

  console.log('\n--- Analysis ---');
  console.log('Model:', responseData.model);
  console.log('Stop Reason:', responseData.stop_reason);

  if (responseData.usage) {
    console.log('Usage:', responseData.usage);
  }

  if (responseData.content && responseData.content.length > 0) {
    console.log('\nContent Blocks:');
    responseData.content.forEach((block, i) => {
      console.log(`\nBlock ${i}:`);
      console.log('  Type:', block.type);
      if (block.text) {
        console.log('  Text:', block.text.substring(0, 200));
      }
      if (block.json) {
        console.log('  JSON:', JSON.stringify(block.json, null, 2));
      }
    });
  }
}

async function testGPT() {
  printHeader('GPT (OpenAI)');

  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ API key not set\n');
    return;
  }

  // Fix the schema for OpenAI strict mode
  const enhancedSchema = addAdditionalPropertiesFalse({
    ...TEST_SCHEMA,
    required: ['message', 'status', 'timestamp']  // Include all properties
  });

  const requestBody = {
    model: config.llm.openai.model,
    max_completion_tokens: 500,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: USER_PROMPT }
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'GreetingResponse',
        schema: enhancedSchema,
        strict: true
      }
    }
  };

  console.log('Request Body:');
  console.log(JSON.stringify(requestBody, null, 2));

  console.log('\n⏳ Making API call...\n');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    console.log('❌ Error:', error);
    return;
  }

  const responseData = await response.json();

  console.log('✅ Raw Response:');
  console.log(JSON.stringify(responseData, null, 2));

  console.log('\n--- Analysis ---');
  console.log('Model:', responseData.model);

  if (responseData.usage) {
    console.log('Usage:', responseData.usage);
  }

  if (responseData.choices && responseData.choices.length > 0) {
    const choice = responseData.choices[0];
    console.log('\nChoice 0:');
    console.log('  Finish Reason:', choice.finish_reason);
    console.log('  Message Role:', choice.message.role);
    console.log('  Content Type:', typeof choice.message.content);
    console.log('  Content:', choice.message.content);

    if (choice.message.refusal) {
      console.log('  Refusal:', choice.message.refusal);
    }
  }
}

async function testGemini() {
  printHeader('GEMINI (Google)');

  if (!process.env.GOOGLE_API_KEY) {
    console.log('❌ API key not set\n');
    return;
  }

  const geminiSchema = convertJsonSchemaToGemini(TEST_SCHEMA);
  const combinedPrompt = `${SYSTEM_PROMPT}\n\nUser: ${USER_PROMPT}`;

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: combinedPrompt }]
      }
    ],
    generationConfig: {
      maxOutputTokens: 500,
      temperature: 0.7,
      responseMimeType: 'application/json',
      responseSchema: geminiSchema
      // Note: gemini-2.5-flash-lite has thinking OFF by default, no need to set thinkingBudget
    }
  };

  console.log('Request Body:');
  console.log(JSON.stringify(requestBody, null, 2));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.google.model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;

  console.log('\n⏳ Making API call...\n');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    console.log('❌ Error:', error);
    return;
  }

  const responseData = await response.json();

  console.log('✅ Raw Response:');
  console.log(JSON.stringify(responseData, null, 2));

  console.log('\n--- Analysis ---');

  if (responseData.candidates && responseData.candidates.length > 0) {
    const candidate = responseData.candidates[0];
    console.log('Finish Reason:', candidate.finishReason);
    console.log('Safety Ratings:', candidate.safetyRatings?.length || 0, 'ratings');

    if (candidate.content) {
      console.log('\nContent:');
      console.log('  Role:', candidate.content.role);
      console.log('  Parts:', candidate.content.parts?.length || 0);

      if (candidate.content.parts) {
        candidate.content.parts.forEach((part, i) => {
          console.log(`\nPart ${i}:`, Object.keys(part));
          if (part.text) {
            console.log('  Text:', part.text.substring(0, 200));
          }
          if (part.json) {
            console.log('  JSON:', JSON.stringify(part.json, null, 2));
          }
        });
      }
    }
  }

  if (responseData.usageMetadata) {
    console.log('\nUsage Metadata:', responseData.usageMetadata);
  }

  if (responseData.promptFeedback) {
    console.log('\nPrompt Feedback:', responseData.promptFeedback);
  }
}

async function main() {
  console.log('🔍 Testing All Models - Raw Response Analysis');
  console.log(`Date: ${new Date().toISOString()}`);

  await testClaude();
  await testGPT();
  await testGemini();

  console.log('\n' + '='.repeat(80));
  console.log('✅ All tests complete');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
