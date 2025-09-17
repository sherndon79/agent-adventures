#!/usr/bin/env node
/**
 * Test MCP connection to WorldBuilder server
 */

import { config } from '../src/config/environment.js';
import { WorldBuilderClient } from '../src/services/mcp-clients/worldbuilder-client.js';

console.log('🔌 Testing MCP Connection to WorldBuilder');
console.log('==========================================');

async function testMCPConnection() {
  const client = new WorldBuilderClient({
    mockMode: false, // Use real MCP connection
    enableLogging: true
  });

  try {
    console.log('📡 Initializing MCP client...');
    await client.initialize();

    console.log('✅ MCP client connected successfully!');

    // Test basic health check
    console.log('🏥 Testing health check...');
    const health = await client.extensionHealth();
    console.log('Health result:', health);

    // Test getting scene
    console.log('🏗️ Testing scene query...');
    const scene = await client.getScene();
    console.log('Scene result:', scene);

    // Test adding a simple element
    console.log('🧊 Testing element creation...');
    const element = await client.addElement(
      'cube',
      'agent_adventures_test_cube',
      [1, 0, 0.5],
      {
        color: [0.2, 0.8, 0.4],
        scale: [1, 1, 1]
      }
    );
    console.log('Element creation result:', element);

    console.log('🎉 All MCP tests passed!');

  } catch (error) {
    console.error('❌ MCP test failed:', error.message);
    console.error('Full error:', error);
  } finally {
    try {
      console.log('🔌 Disconnecting MCP client...');
      await client.disconnect();
      console.log('✅ MCP client disconnected');
    } catch (disconnectError) {
      console.warn('⚠️ Disconnect warning:', disconnectError.message);
    }
  }
}

testMCPConnection().then(() => {
  console.log('✨ MCP connection test completed');
  process.exit(0);
}).catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});