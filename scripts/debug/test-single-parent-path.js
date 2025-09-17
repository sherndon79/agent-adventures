#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testSingleParentPath() {
  let client;
  try {
    console.log('🧪 Testing single element with custom parent_path...');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // Test 1: Add element with custom parent_path
    console.log('\n1️⃣ Adding element to custom parent path /World/TestFolder...');
    const result = await client.addElement(
      'cube',
      'test_cube',
      [0, 0, 1],
      [1, 0, 0],
      [1, 1, 1],
      '/World/TestFolder'  // Custom parent path
    );
    console.log('Result:', JSON.stringify(result, null, 2));

    // Test 2: Add element to default parent path
    console.log('\n2️⃣ Adding element to default parent path /World...');
    const result2 = await client.addElement(
      'sphere',
      'test_sphere',
      [2, 0, 1],
      [0, 1, 0],
      [0.5, 0.5, 0.5]
      // No parent_path specified - should default to /World
    );
    console.log('Result2:', JSON.stringify(result2, null, 2));

    // Check scene structure
    console.log('\n3️⃣ Checking scene structure...');
    const scene = await client.getScene();
    console.log('Scene:', JSON.stringify(scene, null, 2));

    console.log('\n🎉 Test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testSingleParentPath();