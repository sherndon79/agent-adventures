#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testBatchAddRemove() {
  let client;
  try {
    console.log('🧪 Testing batch creation with add/remove operations...');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // Complete castle with door and person
    const castleElements = [
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
      // Door to main keep
      {
        element_type: 'cube',
        name: 'keep_door',
        position: [5, -0.8, 0.8],  // Front of keep, ground level
        scale: [0.3, 0.1, 0.8],
        color: [0.4, 0.2, 0.1]  // Brown wooden door
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
        position: [5, 0, 3.9],  // Properly seated on roof
        scale: [0.05, 0.05, 1],
        color: [0.4, 0.2, 0.1]  // Brown wood
      },
      // Flag
      {
        element_type: 'cube',
        name: 'flag',
        position: [5.3, 0, 4.1],  // On the flag pole
        scale: [0.5, 0.05, 0.3],
        color: [1, 0.8, 0]  // Golden banner
      },
      // Person in courtyard - cylinder body
      {
        element_type: 'cylinder',
        name: 'person_body',
        position: [5, 0.8, 0.6],  // In the courtyard
        scale: [0.2, 0.2, 0.8],
        color: [0.8, 0.6, 0.4]  // Human skin tone
      },
      // Person head - sphere
      {
        element_type: 'sphere',
        name: 'person_head',
        position: [5, 0.8, 1.1],  // Above body
        scale: [0.15, 0.15, 0.15],
        color: [0.9, 0.7, 0.5]  // Head skin tone
      }
    ];

    // Create the complete castle batch
    console.log('\n🏰 Step 1: Creating complete castle with door and person...');
    const batchResult = await client.createBatch('enhanced_castle', castleElements, '/World/EnhancedCastle');
    console.log('Castle batch created:', JSON.stringify(batchResult, null, 2));

    // Check scene after batch creation
    console.log('\n📊 Step 2: Checking scene after castle creation...');
    const sceneAfterBatch = await client.getScene(true);
    console.log('Scene after batch creation:', JSON.stringify(sceneAfterBatch, null, 2));

    // List elements to see what was created
    console.log('\n📋 Step 3: Listing all elements...');
    const elementsList = await client.listElements();
    console.log('Elements list:', JSON.stringify(elementsList, null, 2));

    // Remove the person (both body and head)
    console.log('\n❌ Step 4: Removing person from castle...');
    const removeBodyResult = await client.removeElement('/World/enhanced_castle/person_body');
    console.log('Remove person body:', JSON.stringify(removeBodyResult, null, 2));

    const removeHeadResult = await client.removeElement('/World/enhanced_castle/person_head');
    console.log('Remove person head:', JSON.stringify(removeHeadResult, null, 2));

    // Final scene check
    console.log('\n📊 Step 5: Final scene after person removal...');
    const finalScene = await client.getScene(true);
    console.log('Final scene:', JSON.stringify(finalScene, null, 2));

    console.log('\n🎉 Batch add/remove test completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testBatchAddRemove();