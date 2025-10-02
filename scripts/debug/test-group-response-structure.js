#!/usr/bin/env node
/**
 * Debug script to examine group creation response structure
 */

import { WorldSurveyorClient } from '../../src/services/mcp-clients/worldsurveyor-client.js';

async function testGroupResponseStructure() {
  let client;
  try {
    client = new WorldSurveyorClient({ enableLogging: false });
    await client.initialize();

    console.log('🔍 Testing group creation response structure...');

    const result = await client.createGroup('DebugGroup', 'Test group for debugging', '#FF0000');

    console.log('\n📋 Raw result structure:');
    console.log(JSON.stringify(result, null, 2));

    console.log('\n🔍 Checking specific paths used by test suite:');
    console.log('result?.success:', result?.success);
    console.log('result.result?.structuredContent?.result type:', typeof result.result?.structuredContent?.result);
    console.log('result.result?.structuredContent?.result:', result.result?.structuredContent?.result);

    console.log('\n📋 Testing listGroups response structure...');
    const listResult = await client.listGroups();
    console.log('listGroups result:');
    console.log(JSON.stringify(listResult, null, 2));
    console.log('listGroups result.result?.structuredContent?.result type:', typeof listResult.result?.structuredContent?.result);
    console.log('listGroups result.result?.structuredContent?.result:', listResult.result?.structuredContent?.result);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    if (client) {
      await client.disconnect();
    }
  }
}

testGroupResponseStructure().catch(console.error);