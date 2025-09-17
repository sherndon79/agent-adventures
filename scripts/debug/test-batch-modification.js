#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testBatchModification() {
  let client;
  try {
    console.log('🧪 Testing batch modification with add/remove elements...');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // Create initial batch - simple castle
    console.log('\n1️⃣ Creating initial batch "test_castle"...');
    const elements = [
      {
        element_type: 'cube',
        name: 'castle_wall',
        position: [0, 0, 0.5],
        scale: [2, 0.3, 1],
        color: [0.7, 0.7, 0.6]
      },
      {
        element_type: 'cylinder',
        name: 'tower',
        position: [1, 0, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
      }
    ];

    const batchResult = await client.createBatch('test_castle', elements, '/World/TestCastle');
    console.log('Batch created:', JSON.stringify(batchResult, null, 2));

    // Add element to existing batch path
    console.log('\n2️⃣ Adding flag to existing batch...');
    const addResult = await client.addElement(
      'cube',
      'flag',
      [1.3, 0, 2.8],
      [1, 0.8, 0],
      [0.5, 0.05, 0.3]
    );
    console.log('Add element result:', JSON.stringify(addResult, null, 2));

    // Check scene to see current structure
    console.log('\n3️⃣ Checking scene structure...');
    const scene = await client.getScene();
    console.log('Scene structure:', JSON.stringify(scene, null, 2));

    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove specific element from batch
    console.log('\n4️⃣ Removing flag from batch...');
    const removeResult = await client.removeElement('/World/TestCastle/flag');
    console.log('Remove element result:', JSON.stringify(removeResult, null, 2));

    // Add different element to batch
    console.log('\n5️⃣ Adding roof to existing batch...');
    const roofResult = await client.addElement(
      'cone',
      'roof',
      [1, 0, 2.5],
      [0.8, 0.2, 0.2],
      [0.5, 0.5, 0.6]
    );
    console.log('Add roof result:', JSON.stringify(roofResult, null, 2));

    // Final scene check
    console.log('\n6️⃣ Final scene structure...');
    const finalScene = await client.getScene();
    console.log('Final scene:', JSON.stringify(finalScene, null, 2));

    console.log('\n🎉 Batch modification test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testBatchModification();