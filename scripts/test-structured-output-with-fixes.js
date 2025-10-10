#!/usr/bin/env node

/**
 * Test Script: Structured Output with Proposed Fixes
 *
 * This script implements the proposed fixes for structured output parsing
 * and tests them in isolation without modifying production code.
 *
 * Tests:
 * 1. Claude with beta header
 * 2. Claude with markdown stripping fallback
 * 3. GPT with additionalProperties fix
 * 4. Gemini with improved response extraction
 */

import { config as envConfig } from '../src/config/environment.js';

// Test configuration
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

// Formatting helpers
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
 * Enhanced LLM Client with Fixes
 */
class FixedLLMClient {
  constructor(provider) {
    this.provider = provider;
    this.config = this._getProviderConfig(provider);
  }

  _getProviderConfig(provider) {
    switch (provider) {
      case 'claude': {
        if (!process.env.ANTHROPIC_API_KEY) {
          throw new Error('ANTHROPIC_API_KEY environment variable not set.');
        }

        // FIX 1: Check for beta header
        const responseFormatBeta = process.env.ANTHROPIC_RESPONSE_FORMAT_BETA ||
                                   envConfig.llm.anthropic.responseFormatBeta;

        const headers = {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        };

        // FIX 2: Add beta header if available
        if (responseFormatBeta) {
          headers['anthropic-beta'] = responseFormatBeta;
          console.log(`✅ Claude beta header enabled: ${responseFormatBeta}`);
        } else {
          console.log(`⚠️  Claude beta header not set - will use markdown stripping fallback`);
        }

        return {
          apiKey: process.env.ANTHROPIC_API_KEY,
          baseURL: 'https://api.anthropic.com/v1/messages',
          model: envConfig.llm.anthropic.model,
          supportsResponseFormat: !!responseFormatBeta,  // FIX 3: Set flag
          headers
        };
      }

      case 'gpt': {
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY environment variable not set.');
        }

        return {
          apiKey: process.env.OPENAI_API_KEY,
          baseURL: 'https://api.openai.com/v1/chat/completions',
          model: envConfig.llm.openai.model,
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        };
      }

      case 'gemini': {
        if (!process.env.GOOGLE_API_KEY) {
          throw new Error('GOOGLE_API_KEY environment variable not set.');
        }

        return {
          apiKey: process.env.GOOGLE_API_KEY,
          baseURL: `https://generativelanguage.googleapis.com/v1beta/models/${envConfig.llm.google.model}:generateContent?key=${process.env.GOOGLE_API_KEY}`,
          model: envConfig.llm.google.model,
          headers: {
            'Content-Type': 'application/json'
          }
        };
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async generateCompletion(systemPrompt, userPrompt, options = {}) {
    const maxTokens = options.maxTokens || 200;
    const responseFormat = options.responseFormat;

    try {
      const requestBody = this._buildRequestBody(systemPrompt, userPrompt, maxTokens, responseFormat);
      const startTime = Date.now();

      const response = await fetch(this.config.baseURL, {
        method: 'POST',
        headers: this.config.headers,
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${this.provider} API error (${response.status}): ${errorData}`);
      }

      const responseData = await response.json();
      const endTime = Date.now();

      return {
        content: this._extractContent(responseData),
        usage: this._extractUsage(responseData),
        model: this.config.model,
        provider: this.provider,
        responseTime: endTime - startTime,
        raw: responseData
      };

    } catch (error) {
      console.error(`[${this.provider}] API call failed:`, error.message);
      throw error;
    }
  }

  _buildRequestBody(systemPrompt, userPrompt, maxTokens, responseFormat) {
    switch (this.provider) {
      case 'claude': {
        const body = {
          model: this.config.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [
            { role: 'user', content: userPrompt }
          ]
        };

        // Add response_format if beta header is set
        if (this.config.supportsResponseFormat && responseFormat) {
          if (responseFormat.type === 'json') {
            body.response_format = { type: 'json' };
          } else if (responseFormat.type === 'json_schema' && responseFormat.schema) {
            body.response_format = {
              type: 'json_schema',
              json_schema: {
                name: responseFormat.name || 'StructuredResponse',
                strict: responseFormat.strict !== false,
                schema: responseFormat.schema
              }
            };
          }
        }

        return body;
      }

      case 'gpt': {
        const body = {
          model: this.config.model,
          max_completion_tokens: maxTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ]
        };

        // FIX 4: Add response_format with additionalProperties fix
        if (responseFormat) {
          if (responseFormat.type === 'json') {
            body.response_format = { type: 'json_object' };
          } else if (responseFormat.type === 'json_schema' && responseFormat.schema) {
            const enhancedSchema = this._addAdditionalPropertiesFalse(responseFormat.schema);
            body.response_format = {
              type: 'json_schema',
              json_schema: {
                name: responseFormat.name || 'StructuredResponse',
                schema: enhancedSchema,
                strict: responseFormat.strict !== false
              }
            };
          }
        }

        return body;
      }

      case 'gemini': {
        const combinedPrompt = `${systemPrompt}\n\nUser: ${userPrompt}`;
        const generationConfig = {
          maxOutputTokens: maxTokens,
          temperature: 0.7
        };

        if (responseFormat) {
          generationConfig.responseMimeType = 'application/json';

          if (responseFormat.schema) {
            const converted = this._convertJsonSchemaToGemini(responseFormat.schema);
            if (converted) {
              generationConfig.responseSchema = converted;
            }
          }
        }

        return {
          contents: [
            {
              role: 'user',
              parts: [{ text: combinedPrompt }]
            }
          ],
          generationConfig
        };
      }

      default:
        throw new Error(`Unsupported provider: ${this.provider}`);
    }
  }

  // FIX 5: Add additionalProperties: false helper for GPT
  _addAdditionalPropertiesFalse(schema) {
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
          this._addAdditionalPropertiesFalse(value)
        ])
      );
    }

    // Handle arrays
    if (enhanced.items) {
      enhanced.items = this._addAdditionalPropertiesFalse(enhanced.items);
    }

    return enhanced;
  }

  _convertJsonSchemaToGemini(schema) {
    if (!schema || typeof schema !== 'object') {
      return null;
    }

    const typeValue = typeof schema.type === 'string' ? schema.type.toLowerCase() : null;

    switch (typeValue) {
      case 'object': {
        const properties = {};
        const inputProps = schema.properties || {};
        for (const [key, value] of Object.entries(inputProps)) {
          const convertedChild = this._convertJsonSchemaToGemini(value);
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
      case 'array': {
        const itemSchema = this._convertJsonSchemaToGemini(schema.items);
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
      case 'integer': {
        const result = { type: 'INTEGER' };
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
      case 'boolean': {
        const result = { type: 'BOOLEAN' };
        if (schema.description) {
          result.description = schema.description;
        }
        return result;
      }
      default:
        return null;
    }
  }

  // FIX 6: Improved content extraction with markdown stripping for Claude
  _extractContent(responseData) {
    switch (this.provider) {
      case 'claude': {
        if (!responseData?.content || responseData.content.length === 0) {
          return '';
        }

        // Check for native JSON response first (when beta header is used)
        for (const item of responseData.content) {
          if (item?.json !== undefined) {
            console.log('✅ Claude returned native JSON object');
            return item.json;
          }
          if (item?.type === 'output_json' && item?.output_json !== undefined) {
            console.log('✅ Claude returned output_json');
            return item.output_json;
          }
        }

        // Fall back to text content with markdown stripping
        let textContent = responseData.content?.[0]?.text || '';

        if (textContent.includes('```')) {
          console.log('⚠️  Claude returned markdown-wrapped JSON, stripping...');
          // Strip markdown code blocks
          textContent = textContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
          console.log('✅ Markdown stripped successfully');
        }

        return textContent;
      }

      case 'gpt': {
        if (!responseData?.choices || responseData.choices.length === 0) {
          return '';
        }

        const message = responseData.choices[0]?.message;
        if (!message) {
          return '';
        }

        const content = message.content;

        // Check for structured response
        if (message.refusal) {
          console.warn(`⚠️  GPT refused: ${message.refusal}`);
        }

        return content || '';
      }

      case 'gemini': {
        if (!responseData?.candidates || responseData.candidates.length === 0) {
          console.warn('⚠️  Gemini returned no candidates');
          return '';
        }

        const candidate = responseData.candidates[0];

        // FIX 7: Check finish reason
        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          console.warn(`⚠️  Gemini finish reason: ${candidate.finishReason}`);
        }

        const parts = candidate?.content?.parts;

        if (!Array.isArray(parts) || parts.length === 0) {
          console.warn('⚠️  Gemini returned no parts');
          return '';
        }

        const first = parts[0];

        // Try JSON field first (structured output)
        if (first?.json !== undefined) {
          console.log('✅ Gemini returned native JSON object');
          return first.json;
        }

        // Try text field
        if (typeof first?.text === 'string') {
          console.log('✅ Gemini returned text content');
          return first.text;
        }

        // Check for function call format
        if (first?.functionCall?.args) {
          console.log('✅ Gemini returned function call args');
          return first.functionCall.args;
        }

        console.warn('⚠️  Gemini unexpected part structure:', Object.keys(first));
        return '';
      }

      default:
        return '';
    }
  }

  _extractUsage(responseData) {
    switch (this.provider) {
      case 'claude':
        return {
          promptTokens: responseData.usage?.input_tokens || 0,
          completionTokens: responseData.usage?.output_tokens || 0,
          totalTokens: (responseData.usage?.input_tokens || 0) + (responseData.usage?.output_tokens || 0)
        };

      case 'gpt':
        return {
          promptTokens: responseData.usage?.prompt_tokens || 0,
          completionTokens: responseData.usage?.completion_tokens || 0,
          totalTokens: responseData.usage?.total_tokens || 0
        };

      case 'gemini':
        const usage = responseData.usageMetadata || {};
        return {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0,
          totalTokens: usage.totalTokenCount || 0
        };

      default:
        return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
  }
}

/**
 * Test structured output with fixes
 */
async function testWithFixes(provider) {
  printHeader(`Testing ${provider.toUpperCase()} with Fixes`);

  let client;
  try {
    client = new FixedLLMClient(provider);
  } catch (error) {
    console.error(`❌ Failed to create ${provider} client:`, error.message);
    return { provider, success: false, error: error.message, tests: [] };
  }

  const results = [];

  // Test cases
  const tests = [
    {
      name: 'Simple JSON',
      responseFormat: { type: 'json' }
    },
    {
      name: 'JSON Schema',
      responseFormat: {
        type: 'json_schema',
        name: 'GreetingResponse',
        schema: TEST_SCHEMA
      }
    }
  ];

  for (const test of tests) {
    printSection(test.name);

    try {
      console.log('⏳ Making API call...\n');

      const response = await client.generateCompletion(
        SYSTEM_PROMPT,
        USER_PROMPT,
        {
          maxTokens: 200,
          responseFormat: test.responseFormat
        }
      );

      console.log(`\n✅ Response received (${response.responseTime}ms)\n`);

      // Token usage
      printResult('Token Usage', {
        prompt: response.usage.promptTokens,
        completion: response.usage.completionTokens,
        total: response.usage.totalTokens
      });

      // Content analysis
      let parsedContent;
      let parseError = null;

      if (typeof response.content === 'object') {
        parsedContent = response.content;
        console.log('\n✅ Content is native JSON object (ideal!)');
      } else if (typeof response.content === 'string') {
        try {
          parsedContent = JSON.parse(response.content);
          console.log('\n✅ Successfully parsed JSON from string');
        } catch (error) {
          parseError = error.message;
          console.log(`\n❌ Failed to parse JSON: ${error.message}`);
          console.log('Raw content:', response.content.substring(0, 200));
        }
      }

      if (parsedContent) {
        console.log('\n📦 Parsed Content:');
        printResult('', parsedContent, 1);

        // Validate schema
        const hasMessage = 'message' in parsedContent;
        const hasStatus = 'status' in parsedContent;
        const schemaValid = hasMessage && hasStatus;

        console.log(`\n${schemaValid ? '✅' : '❌'} Schema validation: ${schemaValid ? 'PASSED' : 'FAILED'}`);
      }

      results.push({
        test: test.name,
        success: !!parsedContent,
        nativeJSON: typeof response.content === 'object',
        schemaValid: parsedContent && 'message' in parsedContent && 'status' in parsedContent,
        parseError
      });

    } catch (error) {
      console.error(`\n❌ Test failed: ${error.message}`);
      results.push({
        test: test.name,
        success: false,
        error: error.message
      });
    }
  }

  return {
    provider,
    success: true,
    tests: results
  };
}

/**
 * Generate summary
 */
function generateSummary(results) {
  printHeader('SUMMARY');

  for (const result of results) {
    if (!result.success) {
      console.log(`\n${result.provider.toUpperCase()}: ❌ FAILED`);
      console.log(`  Error: ${result.error}`);
      continue;
    }

    console.log(`\n${result.provider.toUpperCase()}:`);

    const totalTests = result.tests.length;
    const successfulTests = result.tests.filter(t => t.success).length;
    const nativeJSONTests = result.tests.filter(t => t.nativeJSON).length;
    const schemaValidTests = result.tests.filter(t => t.schemaValid).length;

    const allPassed = successfulTests === totalTests;
    const hasNativeJSON = nativeJSONTests > 0;

    console.log(`  Successful: ${successfulTests}/${totalTests} ${allPassed ? '✅' : '❌'}`);
    console.log(`  Native JSON: ${nativeJSONTests}/${totalTests} ${hasNativeJSON ? '✅' : '📝'}`);
    console.log(`  Schema Valid: ${schemaValidTests}/${totalTests} ${schemaValidTests === totalTests ? '✅' : '❌'}`);

    for (const test of result.tests) {
      const icon = test.success ? '✅' : '❌';
      const nativeIcon = test.nativeJSON ? '📦' : '📝';
      console.log(`    ${icon} ${nativeIcon} ${test.test}`);
    }
  }
}

/**
 * Main
 */
async function main() {
  console.log('🔧 LLM Client Structured Output Test (WITH FIXES)');
  console.log(`Date: ${new Date().toISOString()}\n`);

  printSection('Environment Check');
  console.log('API Keys:');
  console.log(`  Claude: ${process.env.ANTHROPIC_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  GPT: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  Gemini: ${process.env.GOOGLE_API_KEY ? '✅ Set' : '❌ Not set'}`);

  console.log('\nBeta Headers:');
  console.log(`  Claude Response Format: ${process.env.ANTHROPIC_RESPONSE_FORMAT_BETA || 'Not set'}`);

  const providers = ['claude', 'gpt', 'gemini'];
  const results = [];

  for (const provider of providers) {
    const result = await testWithFixes(provider);
    results.push(result);
  }

  generateSummary(results);

  // Exit code
  const allSuccessful = results.every(r => r.success && r.tests.every(t => t.success));

  console.log('\n' + '='.repeat(80));
  if (allSuccessful) {
    console.log('✅ ALL TESTS PASSED with fixes applied!');
    process.exit(0);
  } else {
    console.log('❌ Some tests still failing - see details above');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
