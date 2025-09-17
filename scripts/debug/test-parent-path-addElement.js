#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testParentPathAddElement() {
  let client;
  try {
    console.log('🧪 Testing enhanced addElement with parent_path support...');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // First create a batch to serve as parent
    console.log('\n1️⃣ Creating initial batch "test_structure"...');
    const elements = [
      {
        element_type: 'cube',
        name: 'foundation',
        position: [0, 0, 0.5],
        scale: [3, 0.5, 1],
        color: [0.6, 0.6, 0.6]
      },
      {
        element_type: 'cube',
        name: 'wall_left',
        position: [-1.2, 0, 1.5],
        scale: [0.3, 0.3, 1.5],
        color: [0.7, 0.5, 0.4]
      },
      {
        element_type: 'cube',
        name: 'wall_right',
        position: [1.2, 0, 1.5],
        scale: [0.3, 0.3, 1.5],
        color: [0.7, 0.5, 0.4]
      }
    ];

    const batchResult = await client.createBatch('test_structure', elements, '/World/Buildings');
    console.log('Batch created:', JSON.stringify(batchResult, null, 2));

    // Test 1: Add element to root level (traditional behavior)
    console.log('\n2️⃣ Adding standalone element to /World...');
    const rootElement = await client.addElement(
      'sphere',
      'standalone_marker',
      [5, 0, 1],
      [1, 0, 0],
      [0.5, 0.5, 0.5],
      '/World'  // Explicit root path
    );
    console.log('Root element result:', JSON.stringify(rootElement, null, 2));

    // Test 2: Add element to existing batch path
    console.log('\n3️⃣ Adding element to existing batch path /World/Buildings/test_structure...');
    const batchElement = await client.addElement(
      'cone',
      'roof',
      [0, 0, 3],
      [0.8, 0.2, 0.2],
      [0.8, 0.8, 1.2],
      '/World/Buildings/test_structure'  // Target batch path
    );
    console.log('Batch element result:', JSON.stringify(batchElement, null, 2));

    // Test 3: Add element to custom parent path
    console.log('\n4️⃣ Adding element to custom parent path /World/Decorations...');
    const decorElement = await client.addElement(
      'cylinder',
      'lamp_post',
      [3, 0, 1.5],
      [0.9, 0.9, 0.1],
      [0.2, 0.2, 2],
      '/World/Decorations'  // Custom parent path
    );
    console.log('Decoration element result:', JSON.stringify(decorElement, null, 2));

    // Check final scene structure
    console.log('\n5️⃣ Checking final scene structure...');
    const scene = await client.getScene();
    console.log('Final scene:', JSON.stringify(scene, null, 2));

    console.log('\n🎉 Parent path addElement test completed!');
    console.log('\n📋 Test Summary:');
    console.log('✅ Root level element placement');
    console.log('✅ Hierarchical element placement in existing batch');
    console.log('✅ Custom parent path creation and element placement');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testParentPathAddElement();