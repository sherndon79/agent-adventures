#!/usr/bin/env node
/**
 * Debug script to test mug placement with proper scaling
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

// Helper method to wait for operations
async function waitForOperations(client, maxWaitMs = 5000) {
  const startTime = Date.now();
  let lastQueuedCount = -1;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await client.getRequestStatus();
      const queuedCount = status?.result?.queued_requests || 0;

      log(`   Queue status: ${queuedCount} operations pending`, COLORS.GRAY);

      if (queuedCount === 0 && lastQueuedCount > 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
        return true;
      }

      if (queuedCount === 0 && lastQueuedCount === -1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      lastQueuedCount = queuedCount;
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      log(`   Error checking queue status: ${error.message}`, COLORS.YELLOW);
      await new Promise(resolve => setTimeout(resolve, 500));
      break;
    }
  }

  await new Promise(resolve => setTimeout(resolve, 300));
  return false;
}

async function testMugScaling() {
  let client;

  try {
    log('🔍 Connecting to WorldBuilder...', COLORS.CYAN);
    client = new WorldBuilderClient({ enableLogging: false });
    await client.initialize();

    // Clear scene first
    log('🧹 Clearing scene...', COLORS.YELLOW);
    await client.clearScene('/World', true);
    await waitForOperations(client, 5000);

    // Place mug with small scale using proper container path
    log('☕ Placing mug with scale [0.1, 0.1, 0.1]...', COLORS.BLUE);
    const assetPath = '/home/sherndon/agent-world/assets/demo/Mugs/SM_Mug_A2.usd';
    const result = await client.placeAsset('test_mug', assetPath, [0, 0, 0.5], [0, 0, 0], [0.1, 0.1, 0.1], '/World/test_mug');

    log('📤 Asset placement result:', COLORS.CYAN);
    console.log(JSON.stringify(result, null, 2));

    // Wait for placement to complete
    log('⏳ Waiting for placement to complete...', COLORS.YELLOW);
    await waitForOperations(client, 5000);

    // Get scene structure to verify container
    log('🔍 Checking scene structure...', COLORS.YELLOW);
    const sceneResult = await client.getScene(true);

    if (sceneResult?.success && sceneResult.result?.structuredContent?.result?.hierarchy) {
      const hierarchy = sceneResult.result.structuredContent.result.hierarchy;

      log('\n✅ Scene hierarchy after placement:', COLORS.GREEN);

      // Look for our container
      const testMugContainer = hierarchy.children?.find(child => child.name === 'test_mug');
      if (testMugContainer) {
        log(`${COLORS.BOLD}Found container: ${testMugContainer.name}${COLORS.RESET}`, COLORS.GREEN);
        log(`   Path: ${testMugContainer.path}`, COLORS.GRAY);
        log(`   Type: ${testMugContainer.type}`, COLORS.GRAY);

        if (testMugContainer.children && testMugContainer.children.length > 0) {
          log('   Children:', COLORS.GRAY);
          testMugContainer.children.forEach(child => {
            log(`     - ${child.name} (${child.type})`, COLORS.GRAY);
            if (child.bounds) {
              const min = child.bounds.min;
              const max = child.bounds.max;
              const size = max.map((maxVal, i) => maxVal - min[i]);
              log(`       Size: [${size.map(v => v.toFixed(2)).join(', ')}]`, COLORS.GRAY);
            }
          });
        }
      } else {
        log('❌ test_mug container not found in scene!', COLORS.RED);

        // Show what we do have
        log('\nCurrent scene children:', COLORS.YELLOW);
        hierarchy.children?.forEach(child => {
          log(`   - ${child.name} (${child.type}) at ${child.path}`, COLORS.GRAY);
        });
      }
    }

    log('\n📸 Taking screenshot to verify visual result...', COLORS.BLUE);
    // We can't take screenshot from here, but let's just log completion
    log('✅ Test completed! Check Isaac Sim viewport to see if mug is properly scaled.', COLORS.GREEN);
    log('   Expected: Small mug (10% of original size)', COLORS.GRAY);

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
testMugScaling().catch(error => {
  log(`❌ Fatal error: ${error.message}`, COLORS.RED);
  process.exit(1);
});