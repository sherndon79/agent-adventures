#!/usr/bin/env node
/**
 * Test script using agent-world relative asset paths
 */

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  GRAY: '\x1b[90m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

async function testAgentWorldAssets() {
  let client;

  try {
    log('🔍 Connecting to WorldBuilder...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // Clear scene first
    log('🧹 Clearing scene...', COLORS.YELLOW);
    await client.clearScene('/World', true);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test with agent-world relative asset path
    log('📦 Placing asset using agent-world relative path...', COLORS.BLUE);

    // Using relative path that should resolve within agent-world project
    const relativeAssetPath = '../../assets/demo/Mugs/SM_Mug_A2.usd';

    const result = await client.placeAsset(
      'agent_world_mug',           // name
      relativeAssetPath,           // asset_path (relative to agent-world)
      [0, 0, 1],                  // position
      [0, 0, 0],                  // rotation
      [0.3, 0.3, 0.3],            // scale (30% size)
      '/World/agent_world_mug'    // primPath - explicit container path
    );

    log('📤 Placement result:', COLORS.CYAN);
    console.log(JSON.stringify(result, null, 2));

    // Wait for operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Analyze the results
    log('🔍 Analyzing asset placement with relative path...', COLORS.YELLOW);
    const sceneResult = await client.getScene(true);

    if (sceneResult?.success && sceneResult.result?.structuredContent?.result?.hierarchy) {
      const hierarchy = sceneResult.result.structuredContent.result.hierarchy;

      log('\n📋 Scene hierarchy:', COLORS.GREEN);

      function printHierarchy(node, indent = '') {
        log(`${indent}${COLORS.BOLD}${node.name}${COLORS.RESET} (${node.type}) - ${node.path}`, COLORS.BLUE);

        if (node.bounds && node.type === 'Mesh') {
          const min = node.bounds.min;
          const max = node.bounds.max;
          const size = max.map((maxVal, i) => maxVal - min[i]);
          const avgSize = size.reduce((a, b) => a + b) / size.length;
          log(`${indent}  Size: [${size.map(v => v.toFixed(2)).join(', ')}] (avg: ${avgSize.toFixed(2)})`, COLORS.GRAY);
        }

        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            printHierarchy(child, indent + '  ');
          }
        }
      }

      if (hierarchy.children && hierarchy.children.length > 0) {
        hierarchy.children.forEach(child => printHierarchy(child));

        // Check if our container was created
        const agentWorldContainer = hierarchy.children.find(child => child.name === 'agent_world_mug');
        if (agentWorldContainer) {
          log(`\n✅ SUCCESS: Agent-world relative path resolved correctly!`, COLORS.GREEN);
          log(`   Container: ${agentWorldContainer.type} at ${agentWorldContainer.path}`, COLORS.GRAY);
          log(`   Children: ${agentWorldContainer.children?.length || 0}`, COLORS.GRAY);
        } else {
          log(`\n❌ Container not found - relative path may not have resolved`, COLORS.RED);
        }
      } else {
        log('❌ No children found in World', COLORS.RED);
      }

    } else {
      log(`❌ Failed to get scene structure: ${sceneResult?.error || 'Unknown error'}`, COLORS.RED);
    }

    log('\n🎯 Agent-world asset test complete!', COLORS.CYAN);
    log('   This test validates that asset_manager.py can resolve relative paths within the agent-world project.', COLORS.GRAY);

  } catch (error) {
    log(`❌ Error: ${error.message}`, COLORS.RED);
    if (error.stack) {
      log(`Stack: ${error.stack}`, COLORS.GRAY);
    }
    process.exit(1);
  } finally {
    if (client) {
      try {
        await client.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}

// Run the test
testAgentWorldAssets().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});