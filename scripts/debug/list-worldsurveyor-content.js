#!/usr/bin/env node
/**
 * Debug script to list all WorldSurveyor waypoints and groups
 * Shows current state to identify cleanup issues and duplicates
 */

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

async function listWorldSurveyorContent() {
  let client;

  try {
    log('🗺️  WorldSurveyor Content Inspector', COLORS.CYAN);

    client = new WorldSurveyorClient({ enableLogging: false });
    await client.initialize();

    // === LIST ALL WAYPOINTS ===
    log('\n📍 WAYPOINTS:', COLORS.YELLOW);
    const waypointsResult = await client.listWaypoints();

    if (waypointsResult?.success && waypointsResult.result?.structuredContent?.result) {
      const waypoints = waypointsResult.result.structuredContent.result.waypoints || [];
      log(`  Total waypoints: ${waypoints.length}`, COLORS.GRAY);

      if (waypoints.length > 0) {
        waypoints.forEach((waypoint, index) => {
          log(`  ${index + 1}. ${COLORS.BOLD}${waypoint.name || 'Unnamed'}${COLORS.RESET}`, COLORS.BLUE);
          log(`     ID: ${waypoint.id}`, COLORS.GRAY);
          log(`     Type: ${waypoint.waypoint_type}`, COLORS.GRAY);
          log(`     Position: [${waypoint.position?.join(', ')}]`, COLORS.GRAY);
          log(`     Created: ${waypoint.created_at}`, COLORS.GRAY);
          if (waypoint.metadata) {
            log(`     Metadata: ${JSON.stringify(waypoint.metadata)}`, COLORS.GRAY);
          }
          log(''); // Empty line
        });

        // Check for duplicates by name
        const nameGroups = waypoints.reduce((acc, wp) => {
          const name = wp.name || 'Unnamed';
          acc[name] = (acc[name] || 0) + 1;
          return acc;
        }, {});

        const duplicateNames = Object.entries(nameGroups).filter(([name, count]) => count > 1);
        if (duplicateNames.length > 0) {
          log('⚠️  DUPLICATE WAYPOINT NAMES DETECTED:', COLORS.RED);
          duplicateNames.forEach(([name, count]) => {
            log(`     "${name}": ${count} instances`, COLORS.RED);
          });
        }
      } else {
        log('  (No waypoints found)', COLORS.GRAY);
      }
    } else {
      log('  ❌ Failed to retrieve waypoints', COLORS.RED);
      console.log('Raw waypoints result:', JSON.stringify(waypointsResult, null, 2));
    }

    // === LIST ALL GROUPS ===
    log('\n📁 GROUPS:', COLORS.YELLOW);
    const groupsResult = await client.listGroups();

    if (groupsResult?.success && groupsResult.result?.structuredContent?.result) {
      const groups = groupsResult.result.structuredContent.result.groups || [];
      log(`  Total groups: ${groups.length}`, COLORS.GRAY);

      if (groups.length > 0) {
        groups.forEach((group, index) => {
          log(`  ${index + 1}. ${COLORS.BOLD}${group.name}${COLORS.RESET}`, COLORS.BLUE);
          log(`     ID: ${group.id}`, COLORS.GRAY);
          log(`     Description: ${group.description || 'No description'}`, COLORS.GRAY);
          log(`     Color: ${group.color}`, COLORS.GRAY);
          log(`     Parent: ${group.parent_group_id || 'None'}`, COLORS.GRAY);
          log(`     Created: ${group.created_at}`, COLORS.GRAY);
          log(''); // Empty line
        });

        // Check for duplicates by name
        const nameGroups = groups.reduce((acc, group) => {
          acc[group.name] = (acc[group.name] || 0) + 1;
          return acc;
        }, {});

        const duplicateNames = Object.entries(nameGroups).filter(([name, count]) => count > 1);
        if (duplicateNames.length > 0) {
          log('⚠️  DUPLICATE GROUP NAMES DETECTED:', COLORS.RED);
          duplicateNames.forEach(([name, count]) => {
            log(`     "${name}": ${count} instances`, COLORS.RED);
          });
        }
      } else {
        log('  (No groups found)', COLORS.GRAY);
      }
    } else {
      log('  ❌ Failed to retrieve groups', COLORS.RED);
      console.log('Raw groups result:', JSON.stringify(groupsResult, null, 2));
    }

    // === SUMMARY ===
    log('\n📊 SUMMARY:', COLORS.CYAN);
    const waypointCount = waypointsResult?.result?.structuredContent?.result?.waypoints?.length || 0;
    const groupCount = groupsResult?.result?.structuredContent?.result?.groups?.length || 0;

    log(`  Waypoints: ${waypointCount}`, COLORS.GRAY);
    log(`  Groups: ${groupCount}`, COLORS.GRAY);

    if (waypointCount === 0 && groupCount === 0) {
      log('  ✅ Database is clean', COLORS.GREEN);
    } else {
      log('  ⚠️  Database contains data - may need cleanup', COLORS.YELLOW);
    }

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

// Run the content inspector
listWorldSurveyorContent().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});