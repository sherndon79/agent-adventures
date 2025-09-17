#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testBatchDebug() {
  let client;
  try {
    console.log('🧪 Testing batch creation with different approaches...');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // Clean first
    console.log('\n🧹 Cleaning scene...');
    await client.clearScene('/World', true);

    // Test 1: Try with default parent path
    console.log('\n1️⃣ Testing batch with default parent path...');
    const elements1 = [
      {
        element_type: 'cube',
        name: 'batch_cube1',
        position: [-3, 0, 0.5],
        scale: [0.5, 0.5, 0.5],
        color: [1, 0, 0]
      }
    ];

    try {
      await client.createBatch('test_batch_1', elements1);
      console.log('✅ Batch 1 created successfully');
    } catch (error) {
      console.log('❌ Batch 1 failed:', error.message);
    }

    // Check scene
    const scene1 = await client.listElements();
    console.log('Scene after batch 1:', scene1.result.structuredContent.result);

    // Test 2: Try with explicit /World parent path
    console.log('\n2️⃣ Testing batch with /World parent path...');
    const elements2 = [
      {
        element_type: 'sphere',
        name: 'batch_sphere2',
        position: [-6, 0, 0.5],
        scale: [0.5, 0.5, 0.5],
        color: [0, 1, 0]
      }
    ];

    try {
      await client.createBatch('test_batch_2', elements2, '/World');
      console.log('✅ Batch 2 created successfully');
    } catch (error) {
      console.log('❌ Batch 2 failed:', error.message);
    }

    // Check scene
    const scene2 = await client.listElements();
    console.log('Scene after batch 2:', scene2.result.structuredContent.result);

    // Test 3: Compare with individual element
    console.log('\n3️⃣ Creating individual element for comparison...');
    await client.addElement('cylinder', 'individual_cylinder', [-9, 0, 0.5], [0, 0, 1], [0.5, 0.5, 0.5]);

    // Final scene check
    const sceneFinal = await client.listElements();
    console.log('Final scene:', sceneFinal.result.structuredContent.result);

    // Check batch info for both
    console.log('\n🔍 Checking batch info...');
    try {
      const batch1Info = await client.getBatchInfo('test_batch_1');
      console.log('Batch 1 info:', batch1Info.result.structuredContent.result);
    } catch (error) {
      console.log('Batch 1 info error:', error.message);
    }

    try {
      const batch2Info = await client.getBatchInfo('test_batch_2');
      console.log('Batch 2 info:', batch2Info.result.structuredContent.result);
    } catch (error) {
      console.log('Batch 2 info error:', error.message);
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testBatchDebug();