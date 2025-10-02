#!/usr/bin/env node
/**
 * Debug script to check the mug's transform properties
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

async function checkMugTransform() {
  let client;

  try {
    log('🔍 Connecting to WorldBuilder...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // Get scene structure to find mug paths
    log('🔍 Getting scene structure...', COLORS.YELLOW);
    const sceneResult = await client.getScene(true);

    if (sceneResult?.success && sceneResult.result?.structuredContent?.result?.hierarchy) {
      const hierarchy = sceneResult.result.structuredContent.result.hierarchy;

      // Find mug-related elements
      function findMugElements(node, path = '') {
        const currentPath = path + '/' + node.name;
        const results = [];

        if (node.name && (node.name.includes('Mug') || node.name.includes('SM_Mug') || node.path?.includes('Mug'))) {
          results.push({
            name: node.name,
            path: node.path || currentPath,
            type: node.type,
            bounds: node.bounds
          });
        }

        if (node.children) {
          for (const child of node.children) {
            results.push(...findMugElements(child, currentPath));
          }
        }

        return results;
      }

      const mugElements = findMugElements(hierarchy);
      log(`\n✅ Found ${mugElements.length} mug-related elements:`, COLORS.GREEN);

      for (const element of mugElements) {
        log(`\n${COLORS.BOLD}${element.name}${COLORS.RESET}`, COLORS.BLUE);
        log(`   Path: ${element.path}`, COLORS.GRAY);
        log(`   Type: ${element.type}`, COLORS.GRAY);

        if (element.bounds) {
          const min = element.bounds.min;
          const max = element.bounds.max;
          const size = max.map((maxVal, i) => maxVal - min[i]);
          log(`   Bounds: [${min.map(v => v.toFixed(2)).join(', ')}] to [${max.map(v => v.toFixed(2)).join(', ')}]`, COLORS.GRAY);
          log(`   Size: [${size.map(v => v.toFixed(2)).join(', ')}]`, COLORS.GRAY);
        }

        // Try to get detailed asset info if this looks like the main mug
        if (element.path === '/World/SM_Mug_A2' || element.path === '/World/test_mug') {
          try {
            log(`\n🔎 Getting detailed transform info for ${element.path}...`, COLORS.YELLOW);

            // Note: We'd need a way to get transform details from WorldBuilder
            // For now, let's see if we can get asset info
            const listResult = await client.listElements();
            if (listResult?.success && listResult.result?.elements) {
              const mugInList = listResult.result.elements.find(e =>
                e.prim_path === element.path || e.path === element.path || e.name === 'test_mug'
              );
              if (mugInList) {
                log('   From listElements():', COLORS.CYAN);
                console.log(JSON.stringify(mugInList, null, 4));
              }
            }
          } catch (error) {
            log(`   ⚠️  Could not get detailed info: ${error.message}`, COLORS.YELLOW);
          }
        }
      }

      // Check what scale should have been applied
      log(`\n📏 Expected vs Actual Scale Analysis:`, COLORS.YELLOW);
      log(`   Expected scale: [0.1, 0.1, 0.1] (should be 10% original size)`, COLORS.GRAY);

      const mainMug = mugElements.find(e => e.path === '/World/SM_Mug_A2');
      if (mainMug && mainMug.bounds) {
        const size = mainMug.bounds.max.map((maxVal, i) => maxVal - mainMug.bounds.min[i]);
        log(`   Current size: [${size.map(v => v.toFixed(2)).join(', ')}]`, COLORS.GRAY);
        log(`   If scale was applied, original would be: [${size.map(v => (v/0.1).toFixed(2)).join(', ')}]`, COLORS.GRAY);

        // Check if this looks like the scale was applied
        const avgSize = size.reduce((a, b) => a + b) / size.length;
        if (avgSize > 5) {
          log(`   ❌ Scale likely NOT applied - object is too large (avg size: ${avgSize.toFixed(2)})`, COLORS.RED);
        } else {
          log(`   ✅ Scale might be applied - reasonable size (avg size: ${avgSize.toFixed(2)})`, COLORS.GREEN);
        }
      }

    } else {
      log(`❌ Failed to get scene structure: ${sceneResult?.error || 'Unknown error'}`, COLORS.RED);
    }

  } catch (error) {
    log(`❌ Error: ${error.message}`, COLORS.RED);
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

// Run the script
checkMugTransform().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});