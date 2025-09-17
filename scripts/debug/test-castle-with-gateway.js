#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testCastleWithGateway() {
  let client;
  try {
    console.log('🏰 Creating proper castle with gateway, drawbridge, and Little Castle Bro!');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // Enhanced castle with gateway and proper door placement
    const castleElements = [
      // Castle base walls with GATEWAY in front
      {
        element_type: 'cube',
        name: 'castle_wall_front_left',
        position: [4.25, -2, 0.5],  // Left side of gateway
        scale: [1.5, 0.3, 1],
        color: [0.7, 0.7, 0.6]  // Stone gray
      },
      {
        element_type: 'cube',
        name: 'castle_wall_front_right',
        position: [5.75, -2, 0.5],  // Right side of gateway
        scale: [1.5, 0.3, 1],
        color: [0.7, 0.7, 0.6]
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

      // DRAWBRIDGE across the gateway!
      {
        element_type: 'cube',
        name: 'drawbridge',
        position: [5, -2.2, 0.1],  // Across the gateway opening
        scale: [1, 0.1, 0.2],      // Flat bridge
        color: [0.4, 0.2, 0.1]     // Brown wood
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

      // FIXED Door placement - attached to BACK of keep (inside castle)
      {
        element_type: 'cube',
        name: 'keep_door',
        position: [5, 0.6, 0.8],   // Back side of keep, properly positioned
        scale: [0.3, 0.1, 0.8],
        color: [0.4, 0.2, 0.1]     // Brown wooden door
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

      // LITTLE CASTLE BRO RETURNS! 🎉
      // Person in courtyard - cylinder body
      {
        element_type: 'cylinder',
        name: 'little_castle_bro_body',
        position: [4.5, 0.5, 0.6],  // Safe spot in courtyard, away from door
        scale: [0.2, 0.2, 0.8],
        color: [0.8, 0.6, 0.4]  // Human skin tone
      },

      // Person head - sphere
      {
        element_type: 'sphere',
        name: 'little_castle_bro_head',
        position: [4.5, 0.5, 1.1],  // Above body
        scale: [0.15, 0.15, 0.15],
        color: [0.9, 0.7, 0.5]  // Head skin tone
      }
    ];

    // Create the proper castle batch
    console.log('\\n🏰 Step 1: Creating castle with gateway, drawbridge, and Little Castle Bro...');
    const batchResult = await client.createBatch('proper_castle', castleElements, '/World/ProperCastle');
    console.log('Castle batch created:', JSON.stringify(batchResult, null, 2));

    // Check final scene
    console.log('\\n📊 Step 2: Checking final castle scene...');
    const finalScene = await client.getScene(true);
    console.log('Final castle scene:', JSON.stringify(finalScene, null, 2));

    console.log('\\n🎉 Little Castle Bro has been RESURRECTED! 👤✨');
    console.log('🌉 Castle now has a proper gateway and drawbridge!');
    console.log('🚪 Door is now properly placed on the keep!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testCastleWithGateway();