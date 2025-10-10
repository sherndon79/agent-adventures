#!/usr/bin/env node

/**
 * Final Structured Output Test - All Fixes Applied
 *
 * Tests all three providers with comprehensive fixes:
 * 1. Claude: Markdown stripping
 * 2. GPT: Schema validation (additionalProperties fix)
 * 3. Gemini: JSON parsing from text field
 *
 * Run individual tests:
 *   node scripts/test-structured-output-final.js claude
 *   node scripts/test-structured-output-final.js gpt
 *   node scripts/test-structured-output-final.js gemini
 *   node scripts/test-structured-output-final.js all (default)
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

function printSection(text) {
  console.log('\n' + '-'.repeat(80));
  console.log(`  ${text}`);
  console.log('-'.repeat(80));
}

function printResult(label, value, indent = 0) {
  const indentStr = '  '.repeat(indent);
  if (typeof value === 'object' && value !== null) {
    console.log(`${indentStr}${label}:`);
    console.log(JSON.stringify(value, null, 2).split('\n').map(line => `${indentStr}  ${line}`).join('\n'));
  } else {
    console.log(`${indentStr}${label}: ${value}`);
  }
}

/**
 * FIX 1: Add additionalProperties: false for OpenAI strict mode
 */
function addAdditionalPropertiesFalse(schema) {
  if (typeof schema !== 'object' || schema === null) {
    return schema;
  }

  const enhanced = { ...schema };

  // Add to root object
  if (enhanced.type === 'object' && !('additionalProperties' in enhanced)) {
    enhanced.additionalProperties = false;
  }

  // Recursively add to nested objects
  if (enhanced.properties) {
    enhanced.properties = Object.fromEntries(
      Object.entries(enhanced.properties).map(([key, value]) => [
        key,
        addAdditionalPropertiesFalse(value)
      ])
    );
  }

  // Handle arrays
  if (enhanced.items) {
    enhanced.items = addAdditionalPropertiesFalse(enhanced.items);
  }

  return enhanced;
}

/**
 * FIX 2: Convert JSON Schema to Gemini format
 */
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

      if (schema.description) {
        result.description = schema.description;
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
    case 'number': {
      const result = { type: 'NUMBER' };
      if (schema.description) {
        result.description = schema.description;
      }
      return result;
    }
    case 'integer': {
      const result = { type: 'INTEGER' };
      if (schema.description) {
        result.description = schema.description;
      }
      return result;
    }
    case 'boolean': {
      const result = { type: 'BOOLEAN' };
      if (schema.description) {
        result.description = schema.description;
      }
      return result;
    }
    case 'array': {
      const itemSchema = convertJsonSchemaToGemini(schema.items);
      const result = {
        type: 'ARRAY'
      };

      if (itemSchema) {
        result.items = itemSchema;
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

/**
 * FIX 3: Extract content with provider-specific fixes
 */
function extractContent(provider, responseData) {
  switch (provider) {
    case 'claude': {
      if (!responseData?.content || responseData.content.length === 0) {
        return '';
      }

      // Check for native JSON response first (future-proofing for when beta is available)
      for (const item of responseData.content) {
        if (item?.json !== undefined) {
          console.log('  ✅ Native JSON response detected');
          return item.json;
        }
        if (item?.type === 'output_json' && item?.output_json !== undefined) {
          console.log('  ✅ Native output_json detected');
          return item.output_json;
        }
      }

      // Fall back to text content with markdown stripping
      let textContent = responseData.content?.[0]?.text || '';

      if (textContent.includes('```')) {
        console.log('  ⚠️  Markdown-wrapped JSON detected, stripping...');
        // Strip markdown code blocks (```json ... ``` or ``` ... ```)
        textContent = textContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
        console.log('  ✅ Markdown stripped');
      }

      return textContent;
    }

    case 'gpt': {
      if (!responseData?.choices || responseData.choices.length === 0) {
        console.warn('  ⚠️  No choices in GPT response');
        return '';
      }

      const message = responseData.choices[0]?.message;
      if (!message) {
        console.warn('  ⚠️  No message in GPT response');
        return '';
      }

      if (message.refusal) {
        console.warn(`  ⚠️  GPT refused: ${message.refusal}`);
      }

      const content = message.content;

      // Check if it's already a parsed object (some SDKs do this)
      if (typeof content === 'object' && content !== null) {
        console.log('  ✅ Native JSON object response');
        return content;
      }

      return content || '';
    }

    case 'gemini': {
      if (!responseData?.candidates || responseData.candidates.length === 0) {
        console.warn('  ⚠️  No candidates in Gemini response');
        return '';
      }

      const candidate = responseData.candidates[0];

      // Check finish reason
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn(`  ⚠️  Gemini finish reason: ${candidate.finishReason}`);
      }

      const parts = candidate?.content?.parts;

      if (!Array.isArray(parts) || parts.length === 0) {
        console.warn('  ⚠️  No parts in Gemini response');
        return '';
      }

      const first = parts[0];

      // Check for native JSON field (rare but possible)
      if (first?.json !== undefined) {
        console.log('  ✅ Native JSON object response');
        return first.json;
      }

      // Most common: text field with JSON string
      if (typeof first?.text === 'string') {
        console.log('  ✅ Text field response (will parse as JSON)');
        return first.text;
      }

      // Check for function call format
      if (first?.functionCall?.args) {
        console.log('  ✅ Function call args response');
        return first.functionCall.args;
      }

      console.warn('  ⚠️  Unexpected Gemini part structure:', Object.keys(first));
      return '';
    }

    default:
      return '';
  }
}

/**
 * Test Claude with markdown stripping
 */
async function testClaude() {
  printHeader('CLAUDE - Markdown Stripping Fix');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('❌ API key not set\n');
    return { success: false, error: 'API key not set' };
  }

  const requestBody = {
    model: config.llm.anthropic.model,
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      { role: 'user', content: USER_PROMPT }
    ]
  };

  console.log('Testing with simple prompt (no response_format)...\n');

  try {
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
      throw new Error(`API error: ${error}`);
    }

    const responseData = await response.json();

    console.log('Response received:');
    console.log('  Tokens:', responseData.usage?.input_tokens, '+', responseData.usage?.output_tokens, '=', responseData.usage?.input_tokens + responseData.usage?.output_tokens);
    console.log('  Stop reason:', responseData.stop_reason);

    console.log('\nExtracting content with FIX applied:');
    const content = extractContent('claude', responseData);

    console.log('\nExtracted content type:', typeof content);
    console.log('Content preview:', typeof content === 'string' ? content.substring(0, 100) : content);

    // Try to parse
    let parsed;
    let parseError = null;

    if (typeof content === 'object') {
      parsed = content;
      console.log('\n✅ Content is already an object');
    } else if (typeof content === 'string') {
      try {
        parsed = JSON.parse(content);
        console.log('\n✅ Successfully parsed JSON from string');
      } catch (error) {
        parseError = error.message;
        console.log(`\n❌ Failed to parse JSON: ${error.message}`);
      }
    }

    if (parsed) {
      console.log('\nParsed JSON:');
      printResult('', parsed, 1);

      const hasMessage = 'message' in parsed;
      const hasStatus = 'status' in parsed;
      const valid = hasMessage && hasStatus;

      console.log(`\n${valid ? '✅' : '❌'} Schema validation: ${valid ? 'PASSED' : 'FAILED'}`);
      console.log(`  Has "message": ${hasMessage ? '✅' : '❌'}`);
      console.log(`  Has "status": ${hasStatus ? '✅' : '❌'}`);

      return {
        success: true,
        nativeJSON: typeof content === 'object',
        schemaValid: valid,
        tokenUsage: responseData.usage
      };
    } else {
      return {
        success: false,
        error: parseError || 'Failed to extract content'
      };
    }
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test GPT with additionalProperties fix
 */
async function testGPT() {
  printHeader('GPT - additionalProperties Fix');

  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ API key not set\n');
    return { success: false, error: 'API key not set' };
  }

  console.log('Applying FIX: Adding additionalProperties: false to schema...\n');

  // Apply the fix
  const enhancedSchema = addAdditionalPropertiesFalse({
    ...TEST_SCHEMA,
    required: ['message', 'status', 'timestamp']  // Include all properties for strict mode
  });

  console.log('Enhanced schema:');
  printResult('', enhancedSchema, 1);

  const requestBody = {
    model: config.llm.openai.model,
    max_completion_tokens: 1000,  // Increase tokens to avoid hitting limit
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

  console.log('\nMaking API call with fixed schema...\n');

  try {
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
      throw new Error(`API error: ${error}`);
    }

    const responseData = await response.json();

    console.log('Response received:');
    console.log('  Model:', responseData.model);
    console.log('  Tokens:', responseData.usage?.prompt_tokens, '+', responseData.usage?.completion_tokens, '=', responseData.usage?.total_tokens);
    console.log('  Finish reason:', responseData.choices?.[0]?.finish_reason);

    console.log('\nExtracting content with FIX applied:');
    const content = extractContent('gpt', responseData);

    console.log('\nExtracted content type:', typeof content);
    console.log('Content preview:', typeof content === 'string' ? content.substring(0, 100) : content);

    // Try to parse
    let parsed;
    let parseError = null;

    if (typeof content === 'object') {
      parsed = content;
      console.log('\n✅ Content is already an object');
    } else if (typeof content === 'string') {
      try {
        parsed = JSON.parse(content);
        console.log('\n✅ Successfully parsed JSON from string');
      } catch (error) {
        parseError = error.message;
        console.log(`\n❌ Failed to parse JSON: ${error.message}`);
      }
    }

    if (parsed) {
      console.log('\nParsed JSON:');
      printResult('', parsed, 1);

      const hasMessage = 'message' in parsed;
      const hasStatus = 'status' in parsed;
      const valid = hasMessage && hasStatus;

      console.log(`\n${valid ? '✅' : '❌'} Schema validation: ${valid ? 'PASSED' : 'FAILED'}`);
      console.log(`  Has "message": ${hasMessage ? '✅' : '❌'}`);
      console.log(`  Has "status": ${hasStatus ? '✅' : '❌'}`);

      return {
        success: true,
        nativeJSON: typeof content === 'object',
        schemaValid: valid,
        tokenUsage: responseData.usage
      };
    } else {
      return {
        success: false,
        error: parseError || 'Failed to extract content'
      };
    }
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Test Gemini with text field JSON parsing
 */
async function testGemini() {
  printHeader('GEMINI - Text Field JSON Parsing');

  if (!process.env.GOOGLE_API_KEY) {
    console.log('❌ API key not set\n');
    return { success: false, error: 'API key not set' };
  }

  console.log('Converting schema to Gemini format...\n');

  const geminiSchema = convertJsonSchemaToGemini(TEST_SCHEMA);
  console.log('Gemini schema:');
  printResult('', geminiSchema, 1);

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
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.llm.google.model}:generateContent?key=${process.env.GOOGLE_API_KEY}`;

  console.log('\nMaking API call...\n');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API error: ${error}`);
    }

    const responseData = await response.json();

    console.log('Response received:');
    console.log('  Model:', config.llm.google.model);
    if (responseData.usageMetadata) {
      console.log('  Tokens:', responseData.usageMetadata.promptTokenCount, '+', responseData.usageMetadata.candidatesTokenCount, '=', responseData.usageMetadata.totalTokenCount);
      if (responseData.usageMetadata.thoughtsTokenCount) {
        console.log('  Thinking tokens:', responseData.usageMetadata.thoughtsTokenCount);
      }
    }
    console.log('  Finish reason:', responseData.candidates?.[0]?.finishReason);

    console.log('\nExtracting content with FIX applied:');
    const content = extractContent('gemini', responseData);

    console.log('\nExtracted content type:', typeof content);
    console.log('Content preview:', typeof content === 'string' ? content.substring(0, 100) : content);

    // Try to parse
    let parsed;
    let parseError = null;

    if (typeof content === 'object') {
      parsed = content;
      console.log('\n✅ Content is already an object');
    } else if (typeof content === 'string') {
      try {
        parsed = JSON.parse(content);
        console.log('\n✅ Successfully parsed JSON from string');
      } catch (error) {
        parseError = error.message;
        console.log(`\n❌ Failed to parse JSON: ${error.message}`);
      }
    }

    if (parsed) {
      console.log('\nParsed JSON:');
      printResult('', parsed, 1);

      const hasMessage = 'message' in parsed;
      const hasStatus = 'status' in parsed;
      const valid = hasMessage && hasStatus;

      console.log(`\n${valid ? '✅' : '❌'} Schema validation: ${valid ? 'PASSED' : 'FAILED'}`);
      console.log(`  Has "message": ${hasMessage ? '✅' : '❌'}`);
      console.log(`  Has "status": ${hasStatus ? '✅' : '❌'}`);

      return {
        success: true,
        nativeJSON: typeof content === 'object',
        schemaValid: valid,
        tokenUsage: responseData.usageMetadata
      };
    } else {
      return {
        success: false,
        error: parseError || 'Failed to extract content'
      };
    }
  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Main test runner
 */
async function main() {
  const args = process.argv.slice(2);
  const testProvider = args[0] || 'all';

  console.log('🔧 Structured Output - Final Test with All Fixes');
  console.log(`Date: ${new Date().toISOString()}`);
  console.log(`Testing: ${testProvider}\n`);

  const results = {};

  if (testProvider === 'all' || testProvider === 'claude') {
    results.claude = await testClaude();
  }

  if (testProvider === 'all' || testProvider === 'gpt') {
    results.gpt = await testGPT();
  }

  if (testProvider === 'all' || testProvider === 'gemini') {
    results.gemini = await testGemini();
  }

  // Summary
  printHeader('SUMMARY');

  Object.entries(results).forEach(([provider, result]) => {
    console.log(`\n${provider.toUpperCase()}:`);
    if (result.success) {
      console.log(`  ✅ Success`);
      console.log(`  Native JSON: ${result.nativeJSON ? '✅' : '📝 (requires parsing)'}`);
      console.log(`  Schema Valid: ${result.schemaValid ? '✅' : '❌'}`);
    } else {
      console.log(`  ❌ Failed: ${result.error}`);
    }
  });

  const allSuccess = Object.values(results).every(r => r.success && r.schemaValid);

  console.log('\n' + '='.repeat(80));
  if (allSuccess) {
    console.log('✅ ALL TESTS PASSED - Ready to apply fixes to production!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed - review output above');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
