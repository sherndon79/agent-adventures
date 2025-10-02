#!/usr/bin/env node

/**
 * Test WorldSurveyor Group Creation Issue
 * Isolates the validation error
 */

import { config } from '../../src/config/environment.js';
import { WorldSurveyorClient } from '../../src/services/mcp-clients/worldsurveyor-client.js';

async function testGroupCreation() {
  console.log('🧪 Testing WorldSurveyor Group Creation\n');

  let client;
  try {
    // Initialize client
    console.log('📡 Connecting to WorldSurveyor MCP...');
    client = new WorldSurveyorClient({ enableLogging: true });
    await client.initialize();
    console.log('✅ Connected successfully\n');

    // Test 1: Simple group creation without color (should work)
    console.log('📋 Test 1: Create group without color...');
    try {
      const result1 = await client.executeCommand('worldsurveyor_create_group', {
        name: 'TestGroup1',
        description: 'Test group without color'
      });
      console.log('Result 1:', JSON.stringify(result1, null, 2));
      console.log('✅ Test 1 passed\n');
    } catch (error) {
      console.log('❌ Test 1 failed:', error.message, '\n');
    }

    // Test 2: Group creation with proper RGB array
    console.log('📋 Test 2: Create group with RGB array...');
    try {
      const result2 = await client.executeCommand('worldsurveyor_create_group', {
        name: 'TestGroup2',
        description: 'Test group with RGB color',
        color: [1.0, 0.4, 0.4]  // Red-ish color as float array
      });
      console.log('Result 2:', JSON.stringify(result2, null, 2));
      console.log('✅ Test 2 passed\n');
    } catch (error) {
      console.log('❌ Test 2 failed:', error.message, '\n');
    }

    // Test 3: Group creation with hex string (this should fail)
    console.log('📋 Test 3: Create group with hex string (should fail)...');
    try {
      const result3 = await client.executeCommand('worldsurveyor_create_group', {
        name: 'TestGroup3',
        description: 'Test group with hex color',
        color: '#FF6B6B'  // This should fail validation
      });
      console.log('Result 3:', JSON.stringify(result3, null, 2));
      console.log('✅ Test 3 passed (unexpected!)\n');
    } catch (error) {
      console.log('❌ Test 3 failed (expected):', error.message, '\n');
    }

    // Test 4: List groups to see what was created
    console.log('📋 Test 4: List groups...');
    try {
      const result4 = await client.executeCommand('worldsurveyor_list_groups');
      console.log('Groups:', JSON.stringify(result4, null, 2));
      console.log('✅ Test 4 passed\n');
    } catch (error) {
      console.log('❌ Test 4 failed:', error.message, '\n');
    }

  } catch (error) {
    console.log('💥 Fatal error:', error.message);
  } finally {
    if (client) {
      await client.disconnect();
      console.log('📡 Disconnected from WorldSurveyor MCP');
    }
  }
}

// Run the test
testGroupCreation().catch(console.error);