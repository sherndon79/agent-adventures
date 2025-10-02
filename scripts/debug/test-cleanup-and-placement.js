#!/usr/bin/env node
/**
 * Comprehensive test for asset placement and cleanup functionality
 * Tests the complete lifecycle: clean -> place -> verify -> clean -> verify
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

async function waitForSettling(delay = 1000) {
  await new Promise(resolve => setTimeout(resolve, delay));
}

async function getSceneChildCount(client) {
  try {
    const sceneResult = await client.getScene(true);
    if (sceneResult?.success && sceneResult.result?.structuredContent?.result?.hierarchy) {
      return sceneResult.result.structuredContent.result.hierarchy.children?.length || 0;
    }
    return -1; // Error indicator
  } catch (error) {
    log(`Error getting scene: ${error.message}`, COLORS.RED);
    return -1;
  }
}

async function testCleanupAndPlacement() {
  let client;

  try {
    log('🔧 Starting comprehensive cleanup and placement test...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // === PHASE 1: Initial Cleanup ===
    log('\n🧹 PHASE 1: Initial scene cleanup...', COLORS.YELLOW);
    const initialClear = await client.clearScene('/World', true);
    log(`Initial clear result: ${initialClear.success ? '✅ Success' : '❌ Failed'}`,
        initialClear.success ? COLORS.GREEN : COLORS.RED);

    await waitForSettling();
    const emptyCount = await getSceneChildCount(client);
    log(`Scene children after initial clear: ${emptyCount}`, COLORS.GRAY);

    // === PHASE 2: Asset Placement ===
    log('\n📦 PHASE 2: Placing multiple assets...', COLORS.YELLOW);

    // Place first asset with explicit container
    const mugPath = '/home/sherndon/agent-world/assets/demo/Mugs/SM_Mug_A2.usd';
    const mugResult = await client.placeAsset(
      'cleanup_test_mug',
      mugPath,
      [0, 0, 1],
      [0, 0, 0],
      [0.2, 0.2, 0.2],
      '/World/cleanup_test_mug'
    );
    log(`Mug placement: ${mugResult.success ? '✅ Success' : '❌ Failed'}`,
        mugResult.success ? COLORS.GREEN : COLORS.RED);

    // Place second asset
    const cupPath = '/home/sherndon/agent-world/assets/demo/Mugs/SM_Mug_C1.usd';
    const cupResult = await client.placeAsset(
      'cleanup_test_cup',
      cupPath,
      [2, 0, 1],
      [0, 0, 0],
      [0.3, 0.3, 0.3],
      '/World/cleanup_test_cup'
    );
    log(`Cup placement: ${cupResult.success ? '✅ Success' : '❌ Failed'}`,
        cupResult.success ? COLORS.GREEN : COLORS.RED);

    // Add some primitive elements
    const cubeResult = await client.addElement('cube', 'cleanup_test_cube', [-2, 0, 1], [0, 1, 0], [1, 1, 1]);
    log(`Cube placement: ${cubeResult.success ? '✅ Success' : '❌ Failed'}`,
        cubeResult.success ? COLORS.GREEN : COLORS.RED);

    await waitForSettling(2000);

    // === PHASE 3: Verify Placement ===
    log('\n🔍 PHASE 3: Verifying assets were placed...', COLORS.YELLOW);
    const populatedCount = await getSceneChildCount(client);
    log(`Scene children after placement: ${populatedCount}`, COLORS.GRAY);

    if (populatedCount > emptyCount) {
      log(`✅ Assets successfully placed (${populatedCount - emptyCount} new children)`, COLORS.GREEN);
    } else {
      log(`❌ Asset placement may have failed (no new children detected)`, COLORS.RED);
    }

    // Get detailed scene structure
    const sceneResult = await client.getScene(true);
    if (sceneResult?.success) {
      const hierarchy = sceneResult.result.structuredContent.result.hierarchy;
      log('\n📋 Current scene contents:', COLORS.CYAN);
      hierarchy.children?.forEach(child => {
        log(`   - ${COLORS.BOLD}${child.name}${COLORS.RESET} (${child.type}) at ${child.path}`, COLORS.BLUE);
      });
    }

    // === PHASE 4: Test Cleanup ===
    log('\n🗑️  PHASE 4: Testing cleanup functionality...', COLORS.YELLOW);
    const cleanupResult = await client.clearScene('/World', true);
    log(`Cleanup result: ${cleanupResult.success ? '✅ Success' : '❌ Failed'}`,
        cleanupResult.success ? COLORS.GREEN : COLORS.RED);

    await waitForSettling(2000);

    // === PHASE 5: Verify Cleanup ===
    log('\n✨ PHASE 5: Verifying cleanup was effective...', COLORS.YELLOW);
    const finalCount = await getSceneChildCount(client);
    log(`Scene children after cleanup: ${finalCount}`, COLORS.GRAY);

    if (finalCount <= emptyCount) {
      log(`✅ Cleanup successful (${populatedCount - finalCount} children removed)`, COLORS.GREEN);
    } else {
      log(`❌ Cleanup may be incomplete (${finalCount - emptyCount} children remain)`, COLORS.RED);
    }

    // Get final scene structure
    const finalScene = await client.getScene(true);
    if (finalScene?.success) {
      const hierarchy = finalScene.result.structuredContent.result.hierarchy;
      log('\n📋 Final scene contents:', COLORS.CYAN);
      if (hierarchy.children && hierarchy.children.length > 0) {
        hierarchy.children.forEach(child => {
          log(`   - ${COLORS.BOLD}${child.name}${COLORS.RESET} (${child.type}) at ${child.path}`, COLORS.BLUE);
        });
      } else {
        log('   (Scene is empty)', COLORS.GRAY);
      }
    }

    // === SUMMARY ===
    log('\n🎯 TEST SUMMARY:', COLORS.CYAN);
    log(`Initial empty count: ${emptyCount}`, COLORS.GRAY);
    log(`Populated count: ${populatedCount}`, COLORS.GRAY);
    log(`Final count: ${finalCount}`, COLORS.GRAY);

    const placementWorked = populatedCount > emptyCount;
    const cleanupWorked = finalCount <= emptyCount;

    log(`Asset Placement: ${placementWorked ? '✅ PASS' : '❌ FAIL'}`,
        placementWorked ? COLORS.GREEN : COLORS.RED);
    log(`Scene Cleanup: ${cleanupWorked ? '✅ PASS' : '❌ FAIL'}`,
        cleanupWorked ? COLORS.GREEN : COLORS.RED);

    if (placementWorked && cleanupWorked) {
      log('\n🎉 Overall Test Result: ✅ PASS - Both placement and cleanup working correctly!', COLORS.GREEN);
    } else {
      log('\n❌ Overall Test Result: FAIL - Issues detected', COLORS.RED);
    }

  } catch (error) {
    log(`❌ Test Error: ${error.message}`, COLORS.RED);
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

// Run the comprehensive test
testCleanupAndPlacement().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});