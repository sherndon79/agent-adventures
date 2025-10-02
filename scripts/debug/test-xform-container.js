#!/usr/bin/env node
/**
 * Test script to verify Xform container creation for USD assets
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

async function testXformContainer() {
  let client;

  try {
    log('🔍 Connecting to WorldBuilder...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // Clear scene first
    log('🧹 Clearing scene...', COLORS.YELLOW);
    await client.clearScene('/World', true);

    // Wait a moment for clear to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Place asset with explicit container name
    log('📦 Placing asset with container name "my_test_container"...', COLORS.BLUE);
    const assetPath = '/home/sherndon/agent-world/assets/demo/Mugs/SM_Mug_A2.usd';

    // Use explicit prim_path to control container location
    const result = await client.placeAsset(
      'my_test_container',  // name
      assetPath,           // asset_path
      [0, 0, 1],          // position
      [0, 0, 0],          // rotation
      [0.2, 0.2, 0.2],    // scale
      '/World/my_test_container'  // primPath - explicit container path
    );

    log('📤 Placement result:', COLORS.CYAN);
    console.log(JSON.stringify(result, null, 2));

    // Wait for operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get detailed scene structure
    log('🔍 Analyzing scene structure...', COLORS.YELLOW);
    const sceneResult = await client.getScene(true);

    if (sceneResult?.success && sceneResult.result?.structuredContent?.result?.hierarchy) {
      const hierarchy = sceneResult.result.structuredContent.result.hierarchy;

      log('\n📋 Complete scene hierarchy:', COLORS.GREEN);

      function printHierarchy(node, indent = '') {
        log(`${indent}${COLORS.BOLD}${node.name}${COLORS.RESET} (${node.type}) - ${node.path}`, COLORS.BLUE);

        if (node.bounds) {
          const min = node.bounds.min;
          const max = node.bounds.max;
          const size = max.map((maxVal, i) => maxVal - min[i]);
          log(`${indent}  Size: [${size.map(v => v.toFixed(2)).join(', ')}]`, COLORS.GRAY);
        }

        if (node.children && node.children.length > 0) {
          for (const child of node.children) {
            printHierarchy(child, indent + '  ');
          }
        }
      }

      if (hierarchy.children && hierarchy.children.length > 0) {
        hierarchy.children.forEach(child => printHierarchy(child));
      } else {
        log('❌ No children found in World', COLORS.RED);
      }

      // Look specifically for our expected container
      const expectedContainer = hierarchy.children?.find(child => child.name === 'my_test_container');
      if (expectedContainer) {
        log(`\n✅ Found expected container: ${expectedContainer.name}`, COLORS.GREEN);
        log(`   Path: ${expectedContainer.path}`, COLORS.GRAY);
        log(`   Type: ${expectedContainer.type}`, COLORS.GRAY);

        if (expectedContainer.children && expectedContainer.children.length > 0) {
          log(`   Children count: ${expectedContainer.children.length}`, COLORS.GRAY);
          expectedContainer.children.forEach(child => {
            log(`     - ${child.name} (${child.type})`, COLORS.GRAY);
          });
        } else {
          log(`   ❌ Container has no children - reference may not be working`, COLORS.RED);
        }
      } else {
        log(`\n❌ Expected container 'my_test_container' not found`, COLORS.RED);

        // Check what we actually got
        const mugElement = hierarchy.children?.find(child =>
          child.name.includes('Mug') || child.name.includes('SM_Mug')
        );
        if (mugElement) {
          log(`   Found direct mug element instead: ${mugElement.name} at ${mugElement.path}`, COLORS.YELLOW);
        }
      }

    } else {
      log(`❌ Failed to get scene structure: ${sceneResult?.error || 'Unknown error'}`, COLORS.RED);
    }

    log('\n🎯 Analysis complete! Check Isaac Sim viewport for visual confirmation.', COLORS.CYAN);

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
testXformContainer().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});