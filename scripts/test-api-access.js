#!/usr/bin/env node
/**
 * API Access Documentation and Testing Script
 * Tests connectivity to all LLM providers and documents available models
 */

import { createLLMClient, testAllProviders } from '../src/llm/llm-client.js';
import { config } from '../src/config/environment.js';

console.log('🔍 API Access Documentation and Testing');
console.log('======================================');
console.log(`Environment: ${config.nodeEnv}`);
console.log(`Mock LLM Mode: ${config.tokens.mockLLMMode}`);
console.log('');

// Document current configuration
console.log('📋 Current Model Configuration:');
console.log('------------------------------');
console.log(`Claude (Anthropic): ${config.llm.anthropic.model}`);
console.log(`  - Max Tokens: ${config.llm.anthropic.maxTokens}`);
console.log(`  - API Key Set: ${!!config.llm.anthropic.apiKey}`);
console.log('');

console.log(`GPT (OpenAI): ${config.llm.openai.model}`);
console.log(`  - Max Tokens: ${config.llm.openai.maxTokens}`);
console.log(`  - API Key Set: ${!!config.llm.openai.apiKey}`);
console.log('');

console.log(`Gemini (Google): ${config.llm.google.model}`);
console.log(`  - Max Tokens: ${config.llm.google.maxTokens}`);
console.log(`  - API Key Set: ${!!config.llm.google.apiKey}`);
console.log('');

// Test API connectivity
console.log('🧪 Testing API Connectivity:');
console.log('---------------------------');

try {
  const results = await testAllProviders();

  for (const [provider, result] of Object.entries(results)) {
    console.log(`\n${provider.toUpperCase()}:`);

    if (result.success) {
      console.log(`  ✅ Status: Connected`);
      console.log(`  📊 Model: ${result.model}`);
      console.log(`  ⏱️ Response Time: ${result.responseTime}ms`);
      console.log(`  🔤 Token Usage: ${result.usage.totalTokens} tokens`);
      console.log(`  📝 Response: "${result.response.substring(0, 50)}..."`);
    } else {
      console.log(`  ❌ Status: Failed`);
      console.log(`  🚫 Error: ${result.error}`);
    }
  }

  // Summary
  console.log('\n📊 Summary:');
  console.log('-----------');
  const successCount = Object.values(results).filter(r => r.success).length;
  const totalCount = Object.keys(results).length;

  console.log(`Connected APIs: ${successCount}/${totalCount}`);

  if (successCount === totalCount) {
    console.log('🎉 All APIs are working correctly!');
  } else if (successCount > 0) {
    console.log('⚠️ Some APIs are not working. Check API keys and model names.');
  } else {
    console.log('❌ No APIs are working. Check configuration and internet connection.');
  }

} catch (error) {
  console.error('💥 Test failed:', error.message);
  process.exit(1);
}

// Test individual model calls with different prompts
console.log('\n🎯 Testing Model-Specific Responses:');
console.log('----------------------------------');

const testPrompts = [
  {
    task: 'Asset Placement',
    system: 'You are a 3D scene designer. Respond with structured data.',
    user: 'Place a cube at position [2, 0, 1] with scale [1, 1, 1]. Provide reasoning.'
  },
  {
    task: 'Camera Movement',
    system: 'You are a cinematographer. Plan camera movements.',
    user: 'Move camera from [5, 0, 3] to [2, 2, 4] over 3 seconds. Explain the shot.'
  }
];

for (const testPrompt of testPrompts) {
  console.log(`\n🎬 Testing: ${testPrompt.task}`);
  console.log(''.padEnd(30, '-'));

  for (const provider of ['claude', 'gpt', 'gemini']) {
    try {
      const client = createLLMClient(provider);
      const response = await client.generateCompletion(
        testPrompt.system,
        testPrompt.user,
        { maxTokens: 200 }
      );

      console.log(`\n${provider.toUpperCase()}:`);
      console.log(`  📝 Response: ${response.content.substring(0, 100)}...`);
      console.log(`  🔤 Tokens: ${response.usage.totalTokens}`);
      console.log(`  ⏱️ Time: ${response.responseTime}ms`);

    } catch (error) {
      console.log(`\n${provider.toUpperCase()}:`);
      console.log(`  ❌ Error: ${error.message}`);
    }
  }
}

console.log('\n✨ API documentation test completed!');
process.exit(0);