#!/usr/bin/env node

import { WorldBuilderClient } from './src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testBatch() {
  let client;
  try {
    console.log('🧪 Testing batch creation step by step...');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // First, create individual elements to confirm they work
    console.log('\n1️⃣ Creating individual sphere...');
    await client.addElement('sphere', 'test_sphere_individual', [-5, -2, 0.5], [0, 1, 0], [0.8, 0.8, 0.8]);

    console.log('\n2️⃣ Creating individual cylinder...');
    await client.addElement('cylinder', 'test_cylinder_individual', [-5, 2, 0.5], [0, 0, 1], [0.8, 0.8, 1.5]);

    // Check what's in the scene now
    console.log('\n📋 Scene after individual elements:');
    const elements1 = await client.listElements();
    console.log(elements1.result.structuredContent.result);

    // Now try batch creation
    console.log('\n3️⃣ Creating batch...');
    const batchElements = [
      {
        element_type: 'sphere',
        name: 'batch_sphere',
        position: [-8, -2, 0.5],
        scale: [0.6, 0.6, 0.6],
        color: [1, 1, 0]
      },
      {
        element_type: 'cylinder',
        name: 'batch_cylinder',
        position: [-8, 2, 0.5],
        scale: [0.6, 0.6, 1.2],
        color: [1, 0, 1]
      }
    ];

    await client.createBatch('test_batch', batchElements, '/World/TestBatch');

    // Check scene again
    console.log('\n📋 Scene after batch creation:');
    const elements2 = await client.listElements();
    console.log(elements2.result.structuredContent.result);

    // Get batch info
    console.log('\n🔍 Batch info:');
    const batchInfo = await client.getBatchInfo('test_batch');
    console.log(batchInfo.result.structuredContent.result);

    // Get full scene
    console.log('\n🏗️ Full scene structure:');
    const scene = await client.getScene(true);
    const sceneText = scene.result.structuredContent.result;
    const hierarchyMatch = sceneText.match(/```json\n([\s\S]*?)\n```/);
    if (hierarchyMatch) {
      const sceneData = JSON.parse(hierarchyMatch[1]);
      console.log('Scene hierarchy:');
      console.log(JSON.stringify(sceneData.hierarchy, null, 2));
    }

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testBatch();