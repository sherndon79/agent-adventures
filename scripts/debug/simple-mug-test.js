#!/usr/bin/env node
/**
 * Simple mug placement test without unnecessary polling
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

async function simpleMugTest() {
  let client;

  try {
    log('🔍 Connecting to WorldBuilder...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // Clear scene first
    log('🧹 Clearing scene...', COLORS.YELLOW);
    const clearResult = await client.clearScene('/World', true);
    log(`Clear result: ${clearResult.success ? '✅ Success' : '❌ Failed'}`, clearResult.success ? COLORS.GREEN : COLORS.RED);

    // Place mug with small scale using proper container path
    log('☕ Placing mug with scale [0.1, 0.1, 0.1]...', COLORS.BLUE);
    const assetPath = '/home/sherndon/agent-world/assets/demo/Mugs/SM_Mug_A2.usd';
    const result = await client.placeAsset('test_mug', assetPath, [0, 0, 0.5], [0, 0, 0], [0.1, 0.1, 0.1], '/World/test_mug');

    if (result.success) {
      log('✅ Asset placement queued successfully', COLORS.GREEN);
    } else {
      log('❌ Asset placement failed', COLORS.RED);
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    // Give a moment for the operation to complete, then check scene
    log('⏳ Waiting 2 seconds for placement to complete...', COLORS.YELLOW);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Get scene structure to verify
    log('🔍 Checking scene structure...', COLORS.YELLOW);
    const sceneResult = await client.getScene(true);

    if (sceneResult?.success && sceneResult.result?.structuredContent?.result?.hierarchy) {
      const hierarchy = sceneResult.result.structuredContent.result.hierarchy;

      log('\n📋 Scene children after placement:', COLORS.CYAN);
      hierarchy.children?.forEach(child => {
        log(`   - ${COLORS.BOLD}${child.name}${COLORS.RESET} (${child.type}) at ${child.path}`, COLORS.BLUE);
        if (child.children && child.children.length > 0) {
          child.children.forEach(grandchild => {
            log(`     └─ ${grandchild.name} (${grandchild.type})`, COLORS.GRAY);
          });
        }
      });

      // Look for our expected container
      const testMugContainer = hierarchy.children?.find(child => child.name === 'test_mug');
      if (testMugContainer) {
        log(`\n✅ Found test_mug container! Type: ${testMugContainer.type}`, COLORS.GREEN);
      } else {
        log('\n❌ test_mug container not found - Xform container approach may not be working', COLORS.RED);
      }

      // Look for the actual mug mesh
      const mugMesh = hierarchy.children?.find(child => child.name === 'SM_Mug_A2');
      if (mugMesh && mugMesh.bounds) {
        const min = mugMesh.bounds.min;
        const max = mugMesh.bounds.max;
        const size = max.map((maxVal, i) => maxVal - min[i]);
        log(`\n☕ Mug mesh found:`, COLORS.YELLOW);
        log(`   Size: [${size.map(v => v.toFixed(2)).join(', ')}]`, COLORS.GRAY);

        const avgSize = size.reduce((a, b) => a + b) / size.length;
        if (avgSize > 5) {
          log(`   ❌ Still too large (avg: ${avgSize.toFixed(2)}) - scaling not working`, COLORS.RED);
        } else {
          log(`   ✅ Good size (avg: ${avgSize.toFixed(2)}) - scaling may be working`, COLORS.GREEN);
        }
      }
    }

    log('\n🎯 Test completed! Check Isaac Sim viewport for visual confirmation.', COLORS.CYAN);

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

// Run the test
simpleMugTest().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});