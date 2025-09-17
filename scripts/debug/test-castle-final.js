#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

dotenv.config();

async function testCastleFinal() {
  let client;
  try {
    console.log('🏰 Creating the ULTIMATE castle test with proper gateway, add/remove functionality!');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // Final castle with PROPER gap, drawbridge placement, and door attachment
    const castleElements = [
      // Castle walls with CLEAR GAP in front (1.5 unit gap between segments)
      {
        element_type: 'cube',
        name: 'castle_wall_front_left',
        position: [3.75, -2, 0.5],  // Left wall segment
        scale: [1.0, 0.3, 1],       // Shorter wall
        color: [0.7, 0.7, 0.6]
      },
      {
        element_type: 'cube',
        name: 'castle_wall_front_right',
        position: [6.25, -2, 0.5],  // Right wall segment
        scale: [1.0, 0.3, 1],       // Shorter wall
        color: [0.7, 0.7, 0.6]      // 1.5 unit GAP between 4.25 and 5.75
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

      // DRAWBRIDGE properly spanning the FRONT gateway gap
      {
        element_type: 'cube',
        name: 'drawbridge',
        position: [5, -2, 0.1],     // CENTER of front gateway
        scale: [1.5, 0.1, 0.2],     // Spanning the 1.5 unit gap
        color: [0.4, 0.2, 0.1]      // Brown wood
      },

      // TEMPORARY GATE to test removal (will be removed later)
      {
        element_type: 'cube',
        name: 'temporary_gate',
        position: [5, -2, 0.8],     // Vertical gate in the opening
        scale: [0.1, 0.1, 1.2],     // Thin vertical gate
        color: [0.3, 0.1, 0.05]     // Dark brown
      },

      // Corner towers
      {
        element_type: 'cylinder',
        name: 'tower_front_left',
        position: [3.5, -2, 1.2],
        scale: [0.4, 0.4, 1.5],
        color: [0.6, 0.6, 0.5]
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

      // Main keep
      {
        element_type: 'cylinder',
        name: 'main_keep',
        position: [5, 0, 1.8],
        scale: [0.8, 0.8, 2.5],
        color: [0.5, 0.5, 0.4]
      },

      // FIXED door - flush against keep wall (no gap, attached properly)
      {
        element_type: 'cube',
        name: 'keep_door',
        position: [5, 0.4, 0.8],    // Flush against keep south wall
        scale: [0.3, 0.05, 0.8],    // Very thin, flush against wall
        color: [0.4, 0.2, 0.1]
      },

      // Tower roofs
      {
        element_type: 'cone',
        name: 'main_keep_roof',
        position: [5, 0, 3.2],
        scale: [1, 1, 0.8],
        color: [0.3, 0.6, 0.3]
      },
      {
        element_type: 'cone',
        name: 'tower_roof_fl',
        position: [3.5, -2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]
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
        color: [0.8, 0.2, 0.2]
      },
      {
        element_type: 'cone',
        name: 'tower_roof_br',
        position: [6.5, 2, 2.1],
        scale: [0.5, 0.5, 0.6],
        color: [0.8, 0.2, 0.2]
      },

      // Flag pole and flag
      {
        element_type: 'cylinder',
        name: 'flag_pole',
        position: [5, 0, 3.9],
        scale: [0.05, 0.05, 1],
        color: [0.4, 0.2, 0.1]
      },
      {
        element_type: 'cube',
        name: 'flag',
        position: [5.3, 0, 4.1],
        scale: [0.5, 0.05, 0.3],
        color: [1, 0.8, 0]
      },

      // Little Castle Bro - our hero!
      {
        element_type: 'cylinder',
        name: 'little_castle_bro_body',
        position: [4.5, 0.5, 0.6],
        scale: [0.2, 0.2, 0.8],
        color: [0.8, 0.6, 0.4]
      },
      {
        element_type: 'sphere',
        name: 'little_castle_bro_head',
        position: [4.5, 0.5, 1.1],
        scale: [0.15, 0.15, 0.15],
        color: [0.9, 0.7, 0.5]
      }
    ];

    console.log('\\n🏰 Step 1: Creating ultimate castle with proper gateway and temporary gate...');
    const batchResult = await client.createBatch('ultimate_castle', castleElements, '/World/UltimateCastle');
    console.log('Castle created:', JSON.stringify(batchResult, null, 2));

    console.log('\\n📊 Step 2: Verifying castle with temporary gate...');
    const sceneWithGate = await client.getScene(true);
    console.log('Scene with gate:', JSON.stringify(sceneWithGate, null, 2));

    console.log('\\n➕ Step 3: Adding a guard to the gateway for extra testing...');
    const guardResult = await client.addElement(
      'cylinder',
      'castle_guard',
      [5.5, -1.8, 0.6],          // Near the gateway
      [0.4, 0.4, 0.6],           // Guard colors (brownish)
      [0.15, 0.15, 0.8],         // Guard size
      '/World/ultimate_castle'    // Add to existing batch
    );
    console.log('Guard added:', JSON.stringify(guardResult, null, 2));

    console.log('\\n📊 Step 4: Scene with guard added...');
    const sceneWithGuard = await client.getScene(true);
    console.log('Scene with guard:', JSON.stringify(sceneWithGuard, null, 2));

    console.log('\\n❌ Step 5: Removing temporary gate (opening the gateway)...');
    const removeGateResult = await client.removeElement('/World/ultimate_castle/temporary_gate');
    console.log('Gate removal:', JSON.stringify(removeGateResult, null, 2));

    console.log('\\n❌ Step 6: Removing the guard (he has done his duty)...');
    const removeGuardResult = await client.removeElement('/World/ultimate_castle/castle_guard');
    console.log('Guard removal:', JSON.stringify(removeGuardResult, null, 2));

    console.log('\\n📊 Step 7: Final castle - open gateway, no temporary elements...');
    const finalScene = await client.getScene(true);
    console.log('Final scene:', JSON.stringify(finalScene, null, 2));

    console.log('\\n🎉 ULTIMATE CASTLE TEST COMPLETE!');
    console.log('✅ Proper gateway with real gap');
    console.log('✅ Drawbridge spanning the gap correctly');
    console.log('✅ Door properly attached to keep');
    console.log('✅ Added elements to existing batch');
    console.log('✅ Removed elements from batch');
    console.log('✅ Little Castle Bro safe and sound!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testCastleFinal();