#!/usr/bin/env node

/**
 * Manual WorldStreamer MCP Test
 * Tests status, start, and stop streaming functionality
 */

import { config } from '../../src/config/environment.js';
import { WorldStreamerClient } from '../../src/services/mcp-clients/worldstreamer-client.js';

async function testWorldStreamer() {
  console.log('🧪 Testing WorldStreamer MCP Server\n');

  let client;
  try {
    // Initialize client
    console.log('📡 Connecting to WorldStreamer MCP...');
    client = new WorldStreamerClient({ enableLogging: true });
    await client.initialize();
    console.log('✅ Connected successfully\n');

    // Test 1: Health Check
    console.log('💓 Testing Health Check...');
    try {
      const health = await client.executeCommand('worldstreamer_health_check');
      console.log('Health Result:', JSON.stringify(health, null, 2));
      console.log('✅ Health check passed\n');
    } catch (error) {
      console.log('❌ Health check failed:', error.message, '\n');
    }

    // Test 2: Get Stream Status
    console.log('📊 Testing Get Stream Status...');
    try {
      const status = await client.getStatus();
      console.log('Status Result:', JSON.stringify(status, null, 2));
      console.log('✅ Status check passed\n');
    } catch (error) {
      console.log('❌ Status check failed:', error.message, '\n');
    }

    // Test 3: Start Streaming (if not already active)
    console.log('▶️ Testing Start Streaming...');
    try {
      const startResult = await client.startStreaming();
      console.log('Start Result:', JSON.stringify(startResult, null, 2));
      console.log('✅ Start streaming request completed\n');

      // Wait a moment for stream to initialize
      console.log('⏳ Waiting 3 seconds for stream to initialize...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check status after start
      console.log('📊 Checking status after start...');
      const statusAfterStart = await client.getStatus();
      console.log('Status After Start:', JSON.stringify(statusAfterStart, null, 2));
      console.log('✅ Status after start checked\n');

    } catch (error) {
      console.log('❌ Start streaming failed:', error.message, '\n');
    }

    // Test 4: Get Streaming URLs
    console.log('🔗 Testing Get Streaming URLs...');
    try {
      const urls = await client.getStreamingUrls();
      console.log('URLs Result:', JSON.stringify(urls, null, 2));
      console.log('✅ Get URLs passed\n');
    } catch (error) {
      console.log('❌ Get URLs failed:', error.message, '\n');
    }

    // Test 5: Stop Streaming
    console.log('⏹️ Testing Stop Streaming...');
    try {
      const stopResult = await client.stopStreaming();
      console.log('Stop Result:', JSON.stringify(stopResult, null, 2));
      console.log('✅ Stop streaming request completed\n');

      // Wait a moment for stream to stop
      console.log('⏳ Waiting 2 seconds for stream to stop...');
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check status after stop
      console.log('📊 Checking status after stop...');
      const statusAfterStop = await client.getStatus();
      console.log('Status After Stop:', JSON.stringify(statusAfterStop, null, 2));
      console.log('✅ Status after stop checked\n');

    } catch (error) {
      console.log('❌ Stop streaming failed:', error.message, '\n');
    }

    // Test 6: Validate Environment
    console.log('🔍 Testing Validate Environment...');
    try {
      const validation = await client.validateEnvironment();
      console.log('Validation Result:', JSON.stringify(validation, null, 2));
      console.log('✅ Environment validation passed\n');
    } catch (error) {
      console.log('❌ Environment validation failed:', error.message, '\n');
    }

  } catch (error) {
    console.log('💥 Fatal error:', error.message);
  } finally {
    if (client) {
      await client.disconnect();
      console.log('📡 Disconnected from WorldStreamer MCP');
    }
  }
}

// Run the test
testWorldStreamer().catch(console.error);