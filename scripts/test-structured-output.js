#!/usr/bin/env node

/**
 * Test Script: Structured Output Parsing
 *
 * Tests the LLM client's ability to handle structured output (JSON)
 * across all three providers: Claude, GPT, and Gemini.
 *
 * This script verifies:
 * 1. Response format configuration
 * 2. JSON parsing from responses
 * 3. Schema validation
 * 4. Content extraction methods
 */

import { LLMClient } from '../src/llm/llm-client.js';
import { config } from '../src/config/environment.js';

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
 * Test structured output with different response format configurations
 */
async function testStructuredOutput(provider) {
  printHeader(`Testing ${provider.toUpperCase()} Structured Output`);

  const tests = [
    {
      name: 'Test 1: Simple JSON (type: "json")',
      responseFormat: { type: 'json' }
    },
    {
      name: 'Test 2: JSON Schema with schema object',
      responseFormat: {
        type: 'json_schema',
        name: 'GreetingResponse',
        schema: TEST_SCHEMA
      }
    },
    {
      name: 'Test 3: JSON Schema with example',
      responseFormat: {
        type: 'json_schema',
        name: 'GreetingResponse',
        schema: TEST_SCHEMA,
        example: {
          message: 'Hello! This is a test response.',
          timestamp: '2025-10-08T12:00:00Z',
          status: 'success'
        }
      }
    }
  ];

  let client;
  try {
    client = new LLMClient(provider);
  } catch (error) {
    console.error(`❌ Failed to create ${provider} client:`, error.message);
    return {
      provider,
      success: false,
      error: error.message,
      tests: []
    };
  }

  // Check configuration
  printSection('Configuration Check');
  const modelInfo = client.getModelInfo();
  printResult('Model', modelInfo.model);
  printResult('API Key Set', modelInfo.apiKeySet ? '✅ Yes' : '❌ No');
  printResult('Max Tokens', modelInfo.maxTokens || 'Not set');
  printResult('Supports Response Format', client.config.supportsResponseFormat ? '✅ Yes' : '❌ No (will use prompt-based fallback)');

  if (!modelInfo.apiKeySet) {
    console.warn(`\n⚠️  Skipping ${provider} tests - API key not configured\n`);
    return {
      provider,
      success: false,
      error: 'API key not configured',
      tests: []
    };
  }

  const results = [];

  for (const test of tests) {
    printSection(test.name);

    try {
      console.log('Request configuration:');
      printResult('  Response Format', test.responseFormat, 1);

      console.log('\n⏳ Making API call...');
      const startTime = Date.now();

      const response = await client.generateCompletion(
        SYSTEM_PROMPT,
        USER_PROMPT,
        {
          maxTokens: 200,
          responseFormat: test.responseFormat
        }
      );

      const elapsed = Date.now() - startTime;

      console.log(`\n✅ Response received (${elapsed}ms)`);

      // Display response details
      printResult('Provider', response.provider);
      printResult('Model', response.model);
      printResult('Response Time', `${response.responseTime}ms`);

      // Token usage
      console.log('\nToken Usage:');
      printResult('  Prompt Tokens', response.usage.promptTokens, 1);
      printResult('  Completion Tokens', response.usage.completionTokens, 1);
      printResult('  Total Tokens', response.usage.totalTokens, 1);

      // Content analysis
      console.log('\nContent Analysis:');
      printResult('  Content Type', typeof response.content, 1);

      let parsedContent;
      let parseError = null;

      if (typeof response.content === 'object') {
        parsedContent = response.content;
        console.log('  ✅ Content is already an object (native JSON response)');
      } else if (typeof response.content === 'string') {
        console.log('  ⚠️  Content is a string, attempting to parse...');
        try {
          parsedContent = JSON.parse(response.content);
          console.log('  ✅ Successfully parsed JSON from string');
        } catch (error) {
          parseError = error.message;
          console.log(`  ❌ Failed to parse JSON: ${error.message}`);
        }
      } else {
        console.log('  ❌ Unexpected content type');
      }

      if (parsedContent) {
        console.log('\nParsed Content:');
        printResult('', parsedContent, 1);

        // Validate against schema
        console.log('\nSchema Validation:');
        const hasMessage = 'message' in parsedContent && typeof parsedContent.message === 'string';
        const hasStatus = 'status' in parsedContent && ['success', 'error'].includes(parsedContent.status);

        printResult('  Has "message" field', hasMessage ? '✅ Yes' : '❌ No', 1);
        printResult('  Has valid "status" field', hasStatus ? '✅ Yes' : '❌ No', 1);

        if (hasMessage && hasStatus) {
          console.log('  ✅ Response matches expected schema');
        } else {
          console.log('  ⚠️  Response does not match expected schema');
        }
      }

      results.push({
        test: test.name,
        success: !!parsedContent,
        responseTime: response.responseTime,
        usage: response.usage,
        contentType: typeof response.content,
        nativeJSON: typeof response.content === 'object',
        parsable: !!parsedContent,
        parseError,
        schemaValid: parsedContent && 'message' in parsedContent && 'status' in parsedContent
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
 * Test raw response extraction to see what the API returns
 */
async function testRawResponse(provider) {
  printHeader(`Testing ${provider.toUpperCase()} Raw Response Structure`);

  try {
    const client = new LLMClient(provider);
    const modelInfo = client.getModelInfo();

    if (!modelInfo.apiKeySet) {
      console.log(`⚠️  Skipping - API key not configured\n`);
      return null;
    }

    console.log('Making test call with JSON schema...\n');

    const response = await client.generateCompletion(
      SYSTEM_PROMPT,
      USER_PROMPT,
      {
        maxTokens: 200,
        responseFormat: {
          type: 'json_schema',
          name: 'GreetingResponse',
          schema: TEST_SCHEMA
        }
      }
    );

    console.log('Raw Response Structure:');
    console.log(JSON.stringify(response.raw, null, 2));

    return response.raw;
  } catch (error) {
    console.error(`❌ Failed to get raw response: ${error.message}`);
    return null;
  }
}

/**
 * Generate summary report
 */
function generateReport(results) {
  printHeader('SUMMARY REPORT');

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

    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Successful: ${successfulTests}/${totalTests} ${successfulTests === totalTests ? '✅' : '⚠️'}`);
    console.log(`  Native JSON Response: ${nativeJSONTests}/${totalTests} ${nativeJSONTests > 0 ? '✅' : '❌'}`);
    console.log(`  Schema Valid: ${schemaValidTests}/${totalTests} ${schemaValidTests === totalTests ? '✅' : '⚠️'}`);

    // Show per-test details
    for (const test of result.tests) {
      const icon = test.success ? '✅' : '❌';
      const nativeIcon = test.nativeJSON ? '📦' : '📝';
      console.log(`    ${icon} ${nativeIcon} ${test.test.replace('Test ', '').split(':')[0]}`);
      if (test.parseError) {
        console.log(`       ⚠️  Parse error: ${test.parseError}`);
      }
    }
  }

  console.log('\nLegend:');
  console.log('  ✅ - Test passed');
  console.log('  ❌ - Test failed');
  console.log('  ⚠️  - Partial success');
  console.log('  📦 - Native JSON response (ideal)');
  console.log('  📝 - String response (requires parsing)');
}

/**
 * Main test runner
 */
async function main() {
  console.log('🔍 LLM Client Structured Output Test Suite');
  console.log(`Date: ${new Date().toISOString()}\n`);

  // Check environment configuration
  printSection('Environment Configuration');
  console.log('Models:');
  printResult('  Claude', config.llm.anthropic.model, 1);
  printResult('  GPT', config.llm.openai.model, 1);
  printResult('  Gemini', config.llm.google.model, 1);

  console.log('\nResponse Format Support:');
  printResult('  Anthropic Beta Header', config.llm.anthropic.responseFormatBeta || 'Not set', 1);

  const providers = ['claude', 'gpt', 'gemini'];
  const results = [];

  // Test structured output for each provider
  for (const provider of providers) {
    const result = await testStructuredOutput(provider);
    results.push(result);
  }

  // Optional: Show raw responses for debugging
  const showRawResponses = process.argv.includes('--raw');
  if (showRawResponses) {
    for (const provider of providers) {
      await testRawResponse(provider);
    }
  }

  // Generate summary report
  generateReport(results);

  // Exit code based on results
  const allSuccessful = results.every(r => r.success && r.tests.every(t => t.success));
  const hasNativeJSON = results.some(r => r.tests.some(t => t.nativeJSON));

  console.log('\n' + '='.repeat(80));
  if (allSuccessful && hasNativeJSON) {
    console.log('✅ ALL TESTS PASSED - All providers returning structured output correctly');
    process.exit(0);
  } else if (allSuccessful) {
    console.log('⚠️  PARTIAL SUCCESS - All providers work but some may need string parsing');
    process.exit(0);
  } else {
    console.log('❌ SOME TESTS FAILED - See report above for details');
    process.exit(1);
  }
}

// Run tests
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
