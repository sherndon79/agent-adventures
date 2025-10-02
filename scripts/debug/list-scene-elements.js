#!/usr/bin/env node
/**
 * Debug script to list all elements in the Isaac Sim scene
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

async function listSceneElements() {
  let client;

  try {
    log('🔍 Connecting to WorldBuilder...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    log('📋 Listing scene elements...', COLORS.YELLOW);
    const elementsResult = await client.listElements();

    if (elementsResult?.success) {
      const elements = elementsResult.result?.elements || [];
      log(`\n✅ Found ${elements.length} elements in scene:`, COLORS.GREEN);

      if (elements.length === 0) {
        log('   (Scene is empty)', COLORS.GRAY);
      } else {
        elements.forEach((element, index) => {
          log(`\n${index + 1}. ${COLORS.BOLD}${element.name || 'Unnamed'}${COLORS.RESET}`, COLORS.BLUE);
          log(`   Path: ${element.prim_path || element.path || 'N/A'}`, COLORS.GRAY);
          log(`   Type: ${element.prim_type || element.type || 'N/A'}`, COLORS.GRAY);

          if (element.position) {
            const pos = Array.isArray(element.position) ? element.position : [element.position.x, element.position.y, element.position.z];
            log(`   Position: [${pos.map(p => p.toFixed(2)).join(', ')}]`, COLORS.GRAY);
          }

          if (element.scale) {
            const scale = Array.isArray(element.scale) ? element.scale : [element.scale.x, element.scale.y, element.scale.z];
            log(`   Scale: [${scale.map(s => s.toFixed(2)).join(', ')}]`, COLORS.GRAY);
          }

          if (element.references && element.references.length > 0) {
            log(`   References: ${element.references.join(', ')}`, COLORS.GRAY);
          }
        });
      }
    } else {
      log(`❌ Failed to list elements: ${elementsResult?.error || 'Unknown error'}`, COLORS.RED);
    }

    // Also get full scene structure
    log('\n🌳 Getting full scene structure...', COLORS.YELLOW);
    const sceneResult = await client.getScene(true);

    if (sceneResult?.success) {
      log('✅ Scene structure retrieved successfully', COLORS.GREEN);
      if (process.argv.includes('--verbose')) {
        console.log('\nFull scene data:');
        console.log(JSON.stringify(sceneResult.result, null, 2));
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

// Parse command line args
const showHelp = process.argv.includes('--help') || process.argv.includes('-h');

if (showHelp) {
  log('🔍 Isaac Sim Scene Elements Lister', COLORS.BOLD + COLORS.CYAN);
  log('\nUsage: node list-scene-elements.js [options]');
  log('\nOptions:');
  log('  --verbose    Show full scene data in JSON format');
  log('  --help, -h   Show this help message');
  process.exit(0);
}

// Run the script
listSceneElements().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});