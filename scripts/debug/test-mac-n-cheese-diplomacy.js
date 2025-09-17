#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function deployMacNCheeseDiplomacy() {
  let client;
  try {
    console.log('🧀 EMERGENCY DIPLOMATIC MISSION: Mac N Cheese Peace Treaty!');
    console.log('🎯 Objective: Appease Little Castle Bro before he plots revenge');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    console.log('\n📍 Step 1: Locating Little Castle Bro in timeout corner...');
    const scene = await client.getScene(true);
    console.log('Castle status: Secured, Little Castle Bro contained');

    console.log('\n🧀 Step 2: Deploying mac n cheese asset near timeout corner...');

    // Get absolute path to the mac n cheese asset
    const assetPath = path.resolve('assets/demo/Food/mac_n_cheese.usd');
    console.log('Mac n cheese asset path:', assetPath);

    // Place mac n cheese near Little Castle Bro's timeout location (he's at [6, 1, 0.6])
    const macNCheeseResult = await client.placeAsset(
      'peace_offering_mac_n_cheese',  // name
      assetPath,                      // assetPath
      [5.5, 1.2, 0.3],               // position: Right next to timeout corner, on the ground
      [0, 0, 0],                     // rotation: No rotation
      [0.8, 0.8, 0.8],               // scale: Nice visible size
      '/World/ultimate_castle/peace_offering_mac_n_cheese'  // primPath
    );
    console.log('Mac n cheese deployment result:', JSON.stringify(macNCheeseResult, null, 2));

    console.log('\n📜 Step 3: Checking diplomatic status...');
    const batchInfo = await client.getBatchInfo('ultimate_castle');
    console.log('Castle batch status after peace offering:', batchInfo.success ? 'STABLE' : 'UNSTABLE');

    console.log('\n🕊️ Step 4: Implementing additional peace measures...');

    // Maybe add a little note or flag nearby?
    const peaceFlag = await client.addElement(
      'cube',
      'peace_treaty_note',
      [5.3, 1.5, 0.5],  // Small flag near the mac n cheese
      [1, 1, 1],        // White flag of surrender/peace
      [0.1, 0.02, 0.3], // Small note-like dimensions
      '/World/ultimate_castle'
    );
    console.log('Peace treaty note placed:', JSON.stringify(peaceFlag, null, 2));

    console.log('\n🎉 DIPLOMATIC MISSION STATUS: SUCCESS!');
    console.log('✅ Mac n cheese peace offering deployed');
    console.log('✅ White flag of truce planted');
    console.log('✅ Little Castle Bro containment maintained');
    console.log('✅ Castle structural integrity preserved');
    console.log('');
    console.log('🤝 Terms of peace treaty:');
    console.log('- Little Castle Bro gets premium mac n cheese');
    console.log('- No more mysterious disappearances of castle staff');
    console.log('- Timeout period reduced to time served');
    console.log('- Full pardon for "scientific experiments"');
    console.log('');
    console.log('⚠️  Warning: Treaty violation will result in immediate');
    console.log('   relocation to the dungeon (if we build one)');

  } catch (error) {
    console.error('❌ DIPLOMATIC CRISIS! Peace mission failed:', error);
    console.error('⚠️  Little Castle Bro may escalate to DEFCON 1!');
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

deployMacNCheeseDiplomacy();