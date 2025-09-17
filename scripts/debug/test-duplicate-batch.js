#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testDuplicateBatch() {
  let client;
  try {
    console.log('🧪 Testing duplicate batch name detection...');

    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // First batch - full castle with flag at original floating position
    const elements1 = [
      // Castle base walls
      {
        element_type: 'cube',
        name: 'castle_wall_front',
        position: [5, -2, 0.5],
        scale: [3, 0.3, 1],
        color: [0.7, 0.7, 0.6]  // Stone gray
      },
      {
        element_type: 'cube',
        name: 'castle_wall_back',
        position: [5, 2, 0.5],
        scale: [3, 0.3, 1],
        color: [0.7, 0.7, 0.6]
      },
      {
        element_type: 'cube',
        name: 'castle_wall_left',
        position: [3.5, 0, 0.5],
        scale: [0.3, 4.3, 1],
        color: [0.7, 0.7, 0.6]
      },
      {
        element_type: 'cube',
        name: 'castle_wall_right',
        position: [6.5, 0, 0.5],
        scale: [0.3, 4.3, 1],
        color: [0.7, 0.7, 0.6]
      },
      // Corner towers
      {
        element_type: 'cylinder',
        name: 'tower_front_left',
        position: [3.5, -2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]  // Darker stone
      },
      {
        element_type: 'cylinder',
        name: 'tower_front_right',
        position: [6.5, -2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
      },
      {
        element_type: 'cylinder',
        name: 'tower_back_left',
        position: [3.5, 2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
      },
      {
        element_type: 'cylinder',
        name: 'tower_back_right',
        position: [6.5, 2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
      },
      // Main keep (central tower)
      {
        element_type: 'cylinder',
        name: 'main_keep',
        position: [5, 0, 1.8],
        scale: [0.8, 0.8, 2.5],
        color: [0.5, 0.5, 0.4]  // Darkest stone
      },
      // Tower roofs
      {
        element_type: 'cone',
        name: 'main_keep_roof',
        position: [5, 0, 3.2],
        scale: [1, 1, 0.8],
        color: [0.3, 0.6, 0.3]  // Green roof
      },
      {
        element_type: 'cone',
        name: 'tower_roof_fl',
        position: [3.5, -2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]  // Red roof
      },
      {
        element_type: 'cone',
        name: 'tower_roof_fr',
        position: [6.5, -2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]
      },
      {
        element_type: 'cone',
        name: 'tower_roof_bl',
        position: [3.5, 2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]  // Red roof
      },
      {
        element_type: 'cone',
        name: 'tower_roof_br',
        position: [6.5, 2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]
      },
      // Flag pole
      {
        element_type: 'cylinder',
        name: 'flag_pole',
        position: [5, 0, 4.5],  // Original floating position (above roof)
        scale: [0.05, 0.05, 1],
        color: [0.4, 0.2, 0.1]  // Brown wood
      },
      // Flag
      {
        element_type: 'cube',
        name: 'flag',
        position: [5.3, 0, 4.8],  // Original floating position
        scale: [0.5, 0.05, 0.3],
        color: [1, 0.8, 0]  // Golden banner
      }
    ];

    // Second batch - full castle with flag at corrected position
    const elements2 = [
      // Castle base walls
      {
        element_type: 'cube',
        name: 'castle_wall_front',
        position: [5, -2, 0.5],
        scale: [3, 0.3, 1],
        color: [0.7, 0.7, 0.6]  // Stone gray
      },
      {
        element_type: 'cube',
        name: 'castle_wall_back',
        position: [5, 2, 0.5],
        scale: [3, 0.3, 1],
        color: [0.7, 0.7, 0.6]
      },
      {
        element_type: 'cube',
        name: 'castle_wall_left',
        position: [3.5, 0, 0.5],
        scale: [0.3, 4.3, 1],
        color: [0.7, 0.7, 0.6]
      },
      {
        element_type: 'cube',
        name: 'castle_wall_right',
        position: [6.5, 0, 0.5],
        scale: [0.3, 4.3, 1],
        color: [0.7, 0.7, 0.6]
      },
      // Corner towers
      {
        element_type: 'cylinder',
        name: 'tower_front_left',
        position: [3.5, -2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]  // Darker stone
      },
      {
        element_type: 'cylinder',
        name: 'tower_front_right',
        position: [6.5, -2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
      },
      {
        element_type: 'cylinder',
        name: 'tower_back_left',
        position: [3.5, 2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
      },
      {
        element_type: 'cylinder',
        name: 'tower_back_right',
        position: [6.5, 2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
      },
      // Main keep (central tower)
      {
        element_type: 'cylinder',
        name: 'main_keep',
        position: [5, 0, 1.8],
        scale: [0.8, 0.8, 2.5],
        color: [0.5, 0.5, 0.4]  // Darkest stone
      },
      // Tower roofs
      {
        element_type: 'cone',
        name: 'main_keep_roof',
        position: [5, 0, 3.2],
        scale: [1, 1, 0.8],
        color: [0.3, 0.6, 0.3]  // Green roof
      },
      {
        element_type: 'cone',
        name: 'tower_roof_fl',
        position: [3.5, -2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]  // Red roof
      },
      {
        element_type: 'cone',
        name: 'tower_roof_fr',
        position: [6.5, -2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]
      },
      {
        element_type: 'cone',
        name: 'tower_roof_bl',
        position: [3.5, 2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]  // Red roof
      },
      {
        element_type: 'cone',
        name: 'tower_roof_br',
        position: [6.5, 2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]
      },
      // Flag pole
      {
        element_type: 'cylinder',
        name: 'flag_pole',
        position: [5, 0, 3.9],  // Corrected position (properly seated on roof)
        scale: [0.05, 0.05, 1],
        color: [0.4, 0.2, 0.1]  // Brown wood
      },
      // Flag
      {
        element_type: 'cube',
        name: 'flag',
        position: [5.3, 0, 4.1],  // Corrected position
        scale: [0.5, 0.05, 0.3],
        color: [1, 0.8, 0]  // Golden banner
      }
    ];

    // First batch creation - should succeed
    console.log('\n1️⃣ Creating first batch "duplicate_test"...');
    const result1 = await client.createBatch('duplicate_test', elements1, '/World/DuplicateTest');
    console.log('First result:', JSON.stringify(result1, null, 2));

    // Wait a moment to avoid overwhelming Isaac Sim
    console.log('\n⏳ Waiting 2 seconds to avoid overwhelming Isaac Sim...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Second batch creation with same name - should fail with specific error
    console.log('\n2️⃣ Creating second batch with same name "duplicate_test"...');
    const result2 = await client.createBatch('duplicate_test', elements2, '/World/DuplicateTest');
    console.log('Second result:', JSON.stringify(result2, null, 2));

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testDuplicateBatch();