#!/usr/bin/env node
/**
 * Debug OpenAI API Key Issues
 */

import { config } from '../src/config/environment.js';

console.log('🔍 Debugging OpenAI API Key');
console.log('===========================');

// Check key format
const apiKey = config.llm.openai.apiKey;
console.log('API Key Length:', apiKey ? apiKey.length : 'undefined');
console.log('API Key Starts With:', apiKey ? apiKey.substring(0, 7) : 'undefined');
console.log('API Key Ends With:', apiKey ? '...' + apiKey.substring(apiKey.length - 4) : 'undefined');

// Test with curl equivalent using fetch
console.log('\n🧪 Testing API Key with Models Endpoint...');

try {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('Response Status:', response.status);
  console.log('Response Headers:', Object.fromEntries(response.headers.entries()));

  if (response.ok) {
    const data = await response.json();
    console.log('✅ API Key is valid!');
    console.log('Available Models:', data.data?.slice(0, 5).map(m => m.id) || 'None found');
  } else {
    const errorData = await response.text();
    console.log('❌ API Error:');
    console.log('Status:', response.status);
    console.log('Response:', errorData);
  }

} catch (error) {
  console.error('❌ Network Error:', error.message);
}

// Test with a simple completion
console.log('\n🧪 Testing with Simple Completion...');

try {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo', // Use a basic model for testing
      messages: [
        { role: 'user', content: 'Say "test successful"' }
      ],
      max_tokens: 10
    })
  });

  console.log('Completion Response Status:', response.status);

  if (response.ok) {
    const data = await response.json();
    console.log('✅ Completion successful!');
    console.log('Response:', data.choices[0].message.content);
  } else {
    const errorData = await response.text();
    console.log('❌ Completion Error:');
    console.log('Status:', response.status);
    console.log('Response:', errorData);
  }

} catch (error) {
  console.error('❌ Completion Network Error:', error.message);
}

console.log('\n✨ Debug completed!');