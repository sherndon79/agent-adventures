#!/usr/bin/env node

/**
 * Test script to debug web server MCP integration
 */

import dotenv from 'dotenv';
dotenv.config();

console.log('🧪 Testing Web Server MCP Integration...');

// Test direct API calls that match the web server's calls
const testPlaceAsset = async () => {
  console.log('\n📦 Testing place_asset via web server API...');

  const payload = {
    name: "test_cube_web",
    asset_path: "/World/test_asset",
    position: [2, 0, 0.5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    prim_path: ""
  };

  try {
    const response = await fetch('http://localhost:3001/api/mcp/worldbuilder/place_asset', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('📥 Response:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('✅ place_asset successful');
    } else {
      console.log('❌ place_asset failed');
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
};

const testCreateBatch = async () => {
  console.log('\n📦 Testing create_batch via web server API...');

  const payload = {
    batch_name: "test_batch_web",
    elements: [
      {
        element_type: "cube",
        name: "web_cube_1",
        position: [3, 0, 0.5],
        scale: [1, 1, 1],
        color: [1, 0, 0]
      },
      {
        element_type: "sphere",
        name: "web_sphere_1",
        position: [4, 0, 0.5],
        scale: [0.5, 0.5, 0.5],
        color: [0, 1, 0]
      }
    ],
    parent_path: "/World"
  };

  try {
    const response = await fetch('http://localhost:3001/api/mcp/worldbuilder/create_batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log('📥 Response:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('✅ create_batch successful');
    } else {
      console.log('❌ create_batch failed');
    }
  } catch (error) {
    console.error('❌ Request failed:', error);
  }
};

// Run tests
const runTests = async () => {
  await testPlaceAsset();
  await testCreateBatch();

  console.log('\n🏁 Web server MCP tests complete');
};

runTests().catch(console.error);