#!/usr/bin/env node
/**
 * Test refactored asset validation with absolute agent-world path
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

async function testRefactoredValidation() {
  let client;

  try {
    log('🔍 Connecting to WorldBuilder...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // Clear scene first
    log('🧹 Clearing scene...', COLORS.YELLOW);
    await client.clearScene('/World', true);
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Test with absolute agent-world asset path
    log('📦 Testing refactored validation with absolute path...', COLORS.BLUE);

    // Using absolute path to agent-world assets
    const absoluteAssetPath = '/home/sherndon/agent-world/assets/demo/Mugs/SM_Mug_A2.usd';

    const result = await client.placeAsset(
      'refactored_test_mug',           // name
      absoluteAssetPath,               // asset_path (absolute)
      [2, 0, 1],                      // position (offset from previous)
      [0, 0, 0],                      // rotation
      [0.4, 0.4, 0.4],                // scale (40% size)
      '/World/refactored_test_mug'     // primPath - explicit container path
    );

    log('📤 Placement result:', COLORS.CYAN);
    console.log(JSON.stringify(result, null, 2));

    // Wait for operation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Analyze the results
    log('🔍 Checking if refactored validation worked...', COLORS.YELLOW);
    const sceneResult = await client.getScene(true);

    if (sceneResult?.success && sceneResult.result?.structuredContent?.result?.hierarchy) {
      const hierarchy = sceneResult.result.structuredContent.result.hierarchy;

      log('\n📋 Scene validation results:', COLORS.GREEN);

      // Check if our container was created
      const refactoredContainer = hierarchy.children?.find(child => child.name === 'refactored_test_mug');
      if (refactoredContainer) {
        log(`✅ SUCCESS: Refactored asset validation is working!`, COLORS.GREEN);
        log(`   Container: ${refactoredContainer.type} at ${refactoredContainer.path}`, COLORS.GRAY);
        log(`   Children: ${refactoredContainer.children?.length || 0}`, COLORS.GRAY);

        // Check for the mug mesh
        const mugMesh = refactoredContainer.children?.find(child =>
          child.name === 'SM_Mug_A2' && child.type === 'Mesh'
        );
        if (mugMesh && mugMesh.bounds) {
          const size = mugMesh.bounds.max.map((maxVal, i) => maxVal - mugMesh.bounds.min[i]);
          const avgSize = size.reduce((a, b) => a + b) / size.length;
          log(`   Mug size: [${size.map(v => v.toFixed(2)).join(', ')}] (avg: ${avgSize.toFixed(2)})`, COLORS.GRAY);

          if (avgSize < 8) {
            log(`   ✅ Scaling also working correctly (40% size)`, COLORS.GREEN);
          } else {
            log(`   ❌ Scaling not working (too large)`, COLORS.RED);
          }
        }
      } else {
        log(`❌ FAILED: Refactored container not found`, COLORS.RED);
        log(`   Available containers:`, COLORS.YELLOW);
        hierarchy.children?.forEach(child => {
          log(`     - ${child.name} (${child.type}) at ${child.path}`, COLORS.GRAY);
        });
      }

    } else {
      log(`❌ Failed to get scene structure: ${sceneResult?.error || 'Unknown error'}`, COLORS.RED);
    }

    log('\n🎯 Refactored validation test complete!', COLORS.CYAN);
    log('   This test validates the clean asset_manager.py implementation.', COLORS.GRAY);

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
testRefactoredValidation().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});