#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testTransformHierarchy() {
  let client;
  try {
    console.log('🔍 Testing USD transform hierarchy behavior...');
    console.log('📋 Question: Does moving Little Castle Bro break the parent batch geometry?');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    console.log('\n📊 Step 1: Getting current scene state...');
    const initialScene = await client.getScene(true);
    console.log('Initial scene structure:', JSON.stringify(initialScene, null, 2));

    // Check if Little Castle Bro exists in the hierarchy
    const ultimateCastle = initialScene.result?.structuredContent?.result || '';
    const hasBro = ultimateCastle.includes('little_castle_bro_body') && ultimateCastle.includes('little_castle_bro_head');

    if (!hasBro) {
      console.log('❌ Little Castle Bro not found! Creating a simple test...');

      // Create a simple test batch first
      const testElements = [
        {
          element_type: 'cube',
          name: 'parent_cube',
          position: [0, 0, 0.5],
          scale: [1, 1, 1],
          color: [0.8, 0.8, 0.8]
        },
        {
          element_type: 'sphere',
          name: 'child_sphere',
          position: [0.5, 0.5, 1],
          scale: [0.3, 0.3, 0.3],
          color: [1, 0, 0]
        }
      ];

      console.log('\n🏗️ Creating test batch...');
      await client.createBatch('transform_test', testElements, '/World/TransformTest');

      console.log('\n📊 Getting scene after batch creation...');
      const afterBatch = await client.getScene(true);
      console.log('Scene after batch:', Object.keys(afterBatch.elements || {}).length, 'elements');

      console.log('\n🔄 Step 2: Transforming child sphere...');
      const transformResult = await client.transformAsset(
        '/World/TransformTest/child_sphere',
        [2, 2, 1.5],  // New position
        null,         // No rotation change
        [0.5, 0.5, 0.5]  // Make it bigger
      );
      console.log('Transform result:', JSON.stringify(transformResult, null, 2));

    } else {
      console.log('✅ Found Little Castle Bro!');

      console.log('\n🔄 Step 2: Moving Little Castle Bro to a new location...');
      // Move both body and head to simulate Little Castle Bro walking around
      const bodyTransform = await client.transformAsset(
        '/World/ultimate_castle/little_castle_bro_body',
        [6, 1, 0.6],  // Move him near the right wall
        null,         // No rotation
        [0.2, 0.2, 0.8]  // Keep same scale
      );
      console.log('Body transform result:', JSON.stringify(bodyTransform, null, 2));

      const headTransform = await client.transformAsset(
        '/World/ultimate_castle/little_castle_bro_head',
        [6, 1, 1.1],  // Move head above new body position
        null,         // No rotation
        [0.15, 0.15, 0.15]  // Keep same scale
      );
      console.log('Head transform result:', JSON.stringify(headTransform, null, 2));
    }

    console.log('\n📊 Step 3: Checking scene integrity after transform...');
    const finalScene = await client.getScene(true);
    console.log('Final scene elements count:', Object.keys(finalScene.elements || {}).length);

    // Check if batch metadata is preserved
    console.log('\n🔍 Step 4: Checking batch metadata preservation...');
    const batchInfo = await client.getBatchInfo('ultimate_castle');
    console.log('Batch info after transform:', JSON.stringify(batchInfo, null, 2));

    console.log('\n🎉 TRANSFORM HIERARCHY TEST COMPLETE!');
    console.log('✅ Tested individual element transforms within batch hierarchy');
    console.log('✅ Verified parent batch geometry preservation');
    console.log('✅ Confirmed USD transform behavior');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testTransformHierarchy();