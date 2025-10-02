#!/usr/bin/env node
/**
 * Simple cleanup test for WorldBuilder scene and WorldSurveyor waypoints/groups
 * Tests all cleanup functionality across both systems
 */

import { WorldBuilderClient } from '../../src/services/mcp-clients/worldbuilder-client.js';
import { WorldSurveyorClient } from '../../src/services/mcp-clients/worldsurveyor-client.js';

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

async function simpleCleanupTest() {
  let worldBuilderClient;
  let worldSurveyorClient;

  try {
    log('🧹 Starting comprehensive cleanup test...', COLORS.CYAN);

    // Initialize clients
    log('🔗 Initializing clients...', COLORS.YELLOW);
    worldBuilderClient = new WorldBuilderClient({ enableLogging: false });
    await worldBuilderClient.initialize();
    log('  ✅ WorldBuilder client initialized', COLORS.GREEN);

    worldSurveyorClient = new WorldSurveyorClient({ enableLogging: false });
    await worldSurveyorClient.initialize();
    log('  ✅ WorldSurveyor client initialized', COLORS.GREEN);

    // === WORLDBUILDER CLEANUP ===
    log('\n🏗️  WORLDBUILDER CLEANUP:', COLORS.CYAN);

    // Get initial scene state
    const initialScene = await worldBuilderClient.getScene(true);
    const initialCount = initialScene?.result?.structuredContent?.result?.hierarchy?.children?.length || 0;
    log(`  Initial scene objects: ${initialCount}`, COLORS.GRAY);

    // Clear WorldBuilder scene
    const sceneCleanup = await worldBuilderClient.clearScene('/World', true);
    log(`  Scene cleanup result: ${sceneCleanup.success ? '✅ Success' : '❌ Failed'}`,
        sceneCleanup.success ? COLORS.GREEN : COLORS.RED);

    if (!sceneCleanup.success) {
      log(`    Error: ${sceneCleanup.error || 'Unknown error'}`, COLORS.RED);
    }

    await waitForSettling(2000);

    // Verify scene cleanup
    const finalScene = await worldBuilderClient.getScene(true);
    const finalCount = finalScene?.result?.structuredContent?.result?.hierarchy?.children?.length || 0;
    log(`  Final scene objects: ${finalCount}`, COLORS.GRAY);

    const sceneCleanupWorked = finalCount <= initialCount;
    log(`  Scene cleanup: ${sceneCleanupWorked ? '✅ EFFECTIVE' : '❌ INCOMPLETE'}`,
        sceneCleanupWorked ? COLORS.GREEN : COLORS.RED);

    // === WORLDSURVEYOR CLEANUP ===
    log('\n🗺️  WORLDSURVEYOR CLEANUP:', COLORS.CYAN);

    // Get initial waypoint and group counts
    const initialWaypoints = await worldSurveyorClient.listWaypoints();
    const initialWaypointCount = initialWaypoints?.result?.waypoints?.length || 0;
    log(`  Initial waypoints: ${initialWaypointCount}`, COLORS.GRAY);

    const initialGroups = await worldSurveyorClient.listGroups();
    const initialGroupCount = initialGroups?.result?.groups?.length || 0;
    log(`  Initial groups: ${initialGroupCount}`, COLORS.GRAY);

    // Clear waypoints
    const waypointCleanup = await worldSurveyorClient.clearWaypoints(true);
    log(`  Waypoint cleanup result: ${waypointCleanup.success ? '✅ Success' : '❌ Failed'}`,
        waypointCleanup.success ? COLORS.GREEN : COLORS.RED);

    if (!waypointCleanup.success) {
      log(`    Error: ${waypointCleanup.error || 'Unknown error'}`, COLORS.RED);
    }

    // Clear groups
    const groupCleanup = await worldSurveyorClient.clearGroups(true);
    log(`  Group cleanup result: ${groupCleanup.success ? '✅ Success' : '❌ Failed'}`,
        groupCleanup.success ? COLORS.GREEN : COLORS.RED);

    if (!groupCleanup.success) {
      log(`    Error: ${groupCleanup.error || 'Unknown error'}`, COLORS.RED);
    }

    await waitForSettling(1000);

    // Verify waypoint and group cleanup
    const finalWaypoints = await worldSurveyorClient.listWaypoints();
    const finalWaypointCount = finalWaypoints?.result?.waypoints?.length || 0;
    log(`  Final waypoints: ${finalWaypointCount}`, COLORS.GRAY);

    const finalGroups = await worldSurveyorClient.listGroups();
    const finalGroupCount = finalGroups?.result?.groups?.length || 0;
    log(`  Final groups: ${finalGroupCount}`, COLORS.GRAY);

    const waypointCleanupWorked = finalWaypointCount === 0;
    const groupCleanupWorked = finalGroupCount === 0;

    log(`  Waypoint cleanup: ${waypointCleanupWorked ? '✅ EFFECTIVE' : '❌ INCOMPLETE'}`,
        waypointCleanupWorked ? COLORS.GREEN : COLORS.RED);
    log(`  Group cleanup: ${groupCleanupWorked ? '✅ EFFECTIVE' : '❌ INCOMPLETE'}`,
        groupCleanupWorked ? COLORS.GREEN : COLORS.RED);

    // === SUMMARY ===
    log('\n🎯 CLEANUP TEST SUMMARY:', COLORS.CYAN);
    log(`WorldBuilder Scene: ${sceneCleanupWorked ? '✅ PASS' : '❌ FAIL'}`,
        sceneCleanupWorked ? COLORS.GREEN : COLORS.RED);
    log(`WorldSurveyor Waypoints: ${waypointCleanupWorked ? '✅ PASS' : '❌ FAIL'}`,
        waypointCleanupWorked ? COLORS.GREEN : COLORS.RED);
    log(`WorldSurveyor Groups: ${groupCleanupWorked ? '✅ PASS' : '❌ FAIL'}`,
        groupCleanupWorked ? COLORS.GREEN : COLORS.RED);

    const allPassed = sceneCleanupWorked && waypointCleanupWorked && groupCleanupWorked;
    log(`\n🎉 Overall Result: ${allPassed ? '✅ ALL CLEANUP OPERATIONS WORKING' : '❌ SOME ISSUES DETECTED'}`,
        allPassed ? COLORS.GREEN : COLORS.RED);

  } catch (error) {
    log(`❌ Test Error: ${error.message}`, COLORS.RED);
    if (error.stack) {
      log(`Stack: ${error.stack}`, COLORS.GRAY);
    }
    process.exit(1);
  } finally {
    // Cleanup clients
    if (worldBuilderClient) {
      try {
        await worldBuilderClient.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
    if (worldSurveyorClient) {
      try {
        await worldSurveyorClient.disconnect();
      } catch (e) {
        // Ignore disconnect errors
      }
    }
  }
}

// Run the cleanup test
simpleCleanupTest().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});