#!/usr/bin/env node

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function debugScene() {
  let client;
  try {
    console.log('🔍 Debugging Isaac Sim scene contents...');

    client = new WorldBuilderClient({ enableLogging: true });
    await client.initialize();

    // Get complete scene structure
    console.log('\n📋 Getting complete scene structure...');
    const scene = await client.getScene(true);
    console.log('Scene structure:', JSON.stringify(scene, null, 2));

    // List all elements
    console.log('\n📝 Listing all scene elements...');
    const elements = await client.listElements();
    console.log('Elements:', JSON.stringify(elements, null, 2));

    // Get batch info specifically
    console.log('\n🔍 Getting mini_castle batch info...');
    try {
      const batchInfo = await client.getBatchInfo('mini_castle');
      console.log('Batch info:', JSON.stringify(batchInfo, null, 2));
    } catch (error) {
      console.log('Batch info error:', error.message);
    }

    // Query objects in the batch area
    console.log('\n🎯 Querying objects in batch area...');
    try {
      const nearbyObjects = await client.queryObjectsInBounds([-3, -3, 0], [-1, 3, 1]);
      console.log('Objects in batch area:', JSON.stringify(nearbyObjects, null, 2));
    } catch (error) {
      console.log('Query error:', error.message);
    }

  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

debugScene();