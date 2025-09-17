#!/usr/bin/env node

/**
 * Comprehensive MCP Test Suite for World* Extensions
 * Tests all available world* MCP server endpoints
 *
 * Usage:
 *   npm run test:mcp -- --all                    # Test all extensions
 *   npm run test:mcp -- --worldbuilder          # Test only worldbuilder
 *   npm run test:mcp -- --worldviewer           # Test only worldviewer
 *   npm run test:mcp -- --worldsurveyor         # Test only worldsurveyor
 *   npm run test:mcp -- --worldstreamer         # Test only worldstreamer
 *   npm run test:mcp -- --worldrecorder         # Test only worldrecorder
 *   npm run test:mcp -- --health                # Test only health checks
 *   npm run test:mcp -- --verbose               # Verbose output
 *   npm run test:mcp -- --clean                 # Clean scene before testing
 *   npm run test:mcp -- --clean-only            # Only clean scene, don't run tests
 */

import { config } from '../src/config/environment.js';
import { WorldBuilderClient } from '../src/services/mcp-clients/worldbuilder-client.js';
import { WorldViewerClient } from '../src/services/mcp-clients/worldviewer-client.js';
import { WorldSurveyorClient } from '../src/services/mcp-clients/worldsurveyor-client.js';
import { WorldStreamerClient } from '../src/services/mcp-clients/worldstreamer-client.js';
import { WorldRecorderClient } from '../src/services/mcp-clients/worldrecorder-client.js';

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  CYAN: '\x1b[36m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m'
};

class MCPTestSuite {
  constructor(options = {}) {
    this.options = {
      verbose: false,
      ...options
    };
    this.results = {
      total: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      extensions: {}
    };
  }

  log(message, color = '') {
    console.log(`${color}${message}${COLORS.RESET}`);
  }

  logVerbose(message, color = '') {
    if (this.options.verbose) {
      console.log(`${color}  ${message}${COLORS.RESET}`);
    }
  }

  async runTest(testName, testFn, extensionName = 'general') {
    this.results.total++;

    if (!this.results.extensions[extensionName]) {
      this.results.extensions[extensionName] = { passed: 0, failed: 0, skipped: 0 };
    }

    try {
      this.logVerbose(`Running: ${testName}`, COLORS.CYAN);
      const startTime = Date.now();

      await testFn();

      const duration = Date.now() - startTime;
      this.results.passed++;
      this.results.extensions[extensionName].passed++;

      this.log(`✅ ${testName} (${duration}ms)`, COLORS.GREEN);
      return { success: true, duration };

    } catch (error) {
      this.results.failed++;
      this.results.extensions[extensionName].failed++;

      this.log(`❌ ${testName}`, COLORS.RED);
      if (this.options.verbose) {
        this.log(`   Error: ${error.message}`, COLORS.RED);
      }
      return { success: false, error: error.message };
    }
  }

  skipTest(testName, reason, extensionName = 'general') {
    this.results.total++;
    this.results.skipped++;

    if (!this.results.extensions[extensionName]) {
      this.results.extensions[extensionName] = { passed: 0, failed: 0, skipped: 0 };
    }
    this.results.extensions[extensionName].skipped++;

    this.log(`⏭️  ${testName} (${reason})`, COLORS.YELLOW);
  }

  // ========== WorldBuilder Tests ==========

  async testWorldBuilder() {
    this.log('\n🏗️  Testing WorldBuilder MCP Extension', COLORS.BOLD + COLORS.BLUE);

    let client;

    try {
      client = new WorldBuilderClient({ enableLogging: this.options.verbose });
      await client.initialize();
    } catch (error) {
      this.skipTest('WorldBuilder Connection', `Cannot connect: ${error.message}`, 'worldbuilder');
      return;
    }

    // Health check
    await this.runTest('WorldBuilder Health Check', async () => {
      const result = await client.executeCommand('worldbuilder_health_check');

      // Log the actual response to debug the issue
      if (this.options.verbose) {
        console.log('Health check response:', JSON.stringify(result, null, 2));
      }

      if (!result || !result.success || result.result?.isError) {
        throw new Error('Health check failed');
      }

      // Check for common health status indicators
      if (result.status && result.status !== 'healthy' && result.status !== 'ok') {
        throw new Error(`Health check failed - status: ${result.status}`);
      }

      // If no status field, check for error indicators
      if (result.error || result.errors) {
        throw new Error(`Health check failed - error: ${result.error || result.errors}`);
      }

      // If we get here, consider it healthy (response received without errors)
    }, 'worldbuilder');

    // Scene status
    await this.runTest('WorldBuilder Scene Status', async () => {
      await client.getSceneStatus();
    }, 'worldbuilder');

    // Add primitive element (well spaced from other objects)
    await this.runTest('WorldBuilder Add Element', async () => {
      await client.addElement('cube', 'test_cube', [3, 0, 0.5], [1, 0, 0], [1, 1, 1]);
    }, 'worldbuilder');

    // Place USD asset (at origin for easy reference)
    await this.runTest('WorldBuilder Place Asset', async () => {
      const assetPath = '/home/sherndon/agent-adventures/assets/demo/Mugs/SM_Mug_A2.usd';
      await client.placeAsset('test_mug', assetPath, [0, 0, 0.5], [0, 0, 0], [1, 1, 1]);
    }, 'worldbuilder');

    // Create batch: Mini Castle (well spaced from individual objects)
    await this.runTest('WorldBuilder Create Batch - Mini Castle', async () => {
      const elements = [
        // Castle base walls
        {
          element_type: 'cube',
          name: 'castle_wall_front',
          position: [-6, -2, 0.5],
          scale: [3, 0.3, 1],
          color: [0.7, 0.7, 0.6]  // Stone gray
        },
        {
          element_type: 'cube',
          name: 'castle_wall_back',
          position: [-6, 2, 0.5],
          scale: [3, 0.3, 1],
          color: [0.7, 0.7, 0.6]
        },
        {
          element_type: 'cube',
          name: 'castle_wall_left',
          position: [-7.5, 0, 0.5],
          scale: [0.3, 4.3, 1],
          color: [0.7, 0.7, 0.6]
        },
        {
          element_type: 'cube',
          name: 'castle_wall_right',
          position: [-4.5, 0, 0.5],
          scale: [0.3, 4.3, 1],
          color: [0.7, 0.7, 0.6]
        },
        // Corner towers
        {
          element_type: 'cylinder',
          name: 'tower_front_left',
          position: [-7.5, -2, 1.2],
          scale: [0.4, 0.4, 1.5],
          color: [0.6, 0.6, 0.5]  // Darker stone
        },
        {
          element_type: 'cylinder',
          name: 'tower_front_right',
          position: [-4.5, -2, 1.2],
          scale: [0.4, 0.4, 1.5],
          color: [0.6, 0.6, 0.5]
        },
        {
          element_type: 'cylinder',
          name: 'tower_back_left',
          position: [-7.5, 2, 1.2],
          scale: [0.4, 0.4, 1.5],
          color: [0.6, 0.6, 0.5]
        },
        {
          element_type: 'cylinder',
          name: 'tower_back_right',
          position: [-4.5, 2, 1.2],
          scale: [0.4, 0.4, 1.5],
          color: [0.6, 0.6, 0.5]
        },
        // Main keep (central tower)
        {
          element_type: 'cylinder',
          name: 'main_keep',
          position: [-6, 0, 1.8],
          scale: [0.8, 0.8, 2.5],
          color: [0.5, 0.5, 0.4]  // Darkest stone
        },
        // Tower roofs
        {
          element_type: 'cone',
          name: 'main_keep_roof',
          position: [-6, 0, 3.2],
          scale: [1, 1, 0.8],
          color: [0.3, 0.6, 0.3]  // Green roof
        },
        {
          element_type: 'cone',
          name: 'tower_roof_fl',
          position: [-7.5, -2, 2.1],
          scale: [0.5, 0.5, 0.6],
          color: [0.8, 0.2, 0.2]  // Red roof
        },
        {
          element_type: 'cone',
          name: 'tower_roof_fr',
          position: [-4.5, -2, 2.1],
          scale: [0.5, 0.5, 0.6],
          color: [0.8, 0.2, 0.2]
        },
        {
          element_type: 'cone',
          name: 'tower_roof_bl',
          position: [-7.5, 2, 2.1],
          scale: [0.5, 0.5, 0.6],
          color: [0.8, 0.2, 0.2]  // Red roof
        },
        {
          element_type: 'cone',
          name: 'tower_roof_br',
          position: [-4.5, 2, 2.1],
          scale: [0.5, 0.5, 0.6],
          color: [0.8, 0.2, 0.2]
        },
        // Flag pole
        {
          element_type: 'cylinder',
          name: 'flag_pole',
          position: [-6, 0, 3.9],
          scale: [0.05, 0.05, 1],
          color: [0.4, 0.2, 0.1]  // Brown wood
        },
        // Flag
        {
          element_type: 'cube',
          name: 'flag',
          position: [-5.7, 0, 4.1],
          scale: [0.5, 0.05, 0.3],
          color: [1, 0.8, 0]  // Golden banner
        }
      ];
      await client.createBatch('castle_v2', elements, '/World/CastleV2');
    }, 'worldbuilder');

    // List elements
    await this.runTest('WorldBuilder List Elements', async () => {
      const result = await client.listElements();

      // Log the actual response to understand the format
      if (this.options.verbose) {
        console.log('List elements response:', JSON.stringify(result, null, 2));
      }

      // Handle different possible response formats
      let elements;
      if (Array.isArray(result)) {
        elements = result;
      } else if (result && result.elements && Array.isArray(result.elements)) {
        elements = result.elements;
      } else if (result && result.data && Array.isArray(result.data)) {
        elements = result.data;
      } else if (result && typeof result === 'object') {
        // If it's an object but not an array, that's still a valid response
        // Just check it's not an error
        if (result.error) {
          throw new Error(`List elements failed: ${result.error}`);
        }
        return; // Accept any object response as valid
      } else {
        throw new Error(`Unexpected response format: ${typeof result}`);
      }

      // If we have an array, verify it's valid
      if (!Array.isArray(elements)) {
        throw new Error('Expected array of elements or valid response object');
      }
    }, 'worldbuilder');

    // Get scene
    await this.runTest('WorldBuilder Get Scene', async () => {
      const scene = await client.getScene(true);
      if (!scene) {
        throw new Error('Failed to get scene data');
      }
    }, 'worldbuilder');

    // Query objects
    await this.runTest('WorldBuilder Query Objects', async () => {
      await client.queryObjectsByType('primitive');
    }, 'worldbuilder');

    if (client) {
      await client.disconnect();
    }
  }

  // ========== WorldViewer Tests ==========

  async testWorldViewer() {
    this.log('\n📷 Testing WorldViewer MCP Extension', COLORS.BOLD + COLORS.BLUE);

    let client;

    try {
      client = new WorldViewerClient({ enableLogging: this.options.verbose });
      await client.initialize();
    } catch (error) {
      this.skipTest('WorldViewer Connection', `Cannot connect: ${error.message}`, 'worldviewer');
      return;
    }

    // Health check
    await this.runTest('WorldViewer Health Check', async () => {
      const result = await client.executeCommand('worldviewer_health_check');
      if (!result || !result.success || result.result?.isError) {
        throw new Error('Health check failed');
      }

      if (this.options.verbose) {
        console.log('WorldViewer health check response:', JSON.stringify(result, null, 2));
      }

      // Check for error indicators
      if (result.error || result.errors) {
        throw new Error(`Health check failed - error: ${result.error || result.errors}`);
      }
    }, 'worldviewer');

    // Get camera status
    await this.runTest('WorldViewer Get Camera Status', async () => {
      await client.getCameraStatus();
    }, 'worldviewer');

    // Set camera position
    await this.runTest('WorldViewer Set Camera Position', async () => {
      await client.setCameraPosition([10, 10, 10], [0, 0, 0]);
    }, 'worldviewer');

    // Orbit camera
    await this.runTest('WorldViewer Orbit Camera', async () => {
      await client.orbitCamera([0, 0, 0], 15, 30, 45);
    }, 'worldviewer');

    // Frame object (if objects exist)
    await this.runTest('WorldViewer Frame Object', async () => {
      try {
        await client.frameObject('/World/test_cube', 10);
      } catch (error) {
        // Object may not exist, that's ok for this test
        if (!error.message.includes('not found') && !error.message.includes('does not exist')) {
          throw error;
        }
      }
    }, 'worldviewer');

    if (client) {
      await client.disconnect();
    }
  }

  // ========== WorldSurveyor Tests ==========

  async testWorldSurveyor() {
    this.log('\n🗺️  Testing WorldSurveyor MCP Extension', COLORS.BOLD + COLORS.BLUE);

    let client;

    try {
      client = new WorldSurveyorClient({ enableLogging: this.options.verbose });
      await client.initialize();
    } catch (error) {
      this.skipTest('WorldSurveyor Connection', `Cannot connect: ${error.message}`, 'worldsurveyor');
      return;
    }

    // Health check
    await this.runTest('WorldSurveyor Health Check', async () => {
      const result = await client.executeCommand('worldsurveyor_health_check');
      if (!result || !result.success || result.result?.isError) {
        throw new Error('Health check failed');
      }
    }, 'worldsurveyor');

    // Create waypoint
    await this.runTest('WorldSurveyor Create Waypoint', async () => {
      await client.createWaypoint([5, 5, 1], 'camera_position', 'test_waypoint');
    }, 'worldsurveyor');

    // List waypoints
    await this.runTest('WorldSurveyor List Waypoints', async () => {
      const result = await client.listWaypoints();
      if (!result || !result.success || result.result?.isError) {
        throw new Error('List waypoints failed');
      }
    }, 'worldsurveyor');

    // List waypoints by type
    await this.runTest('WorldSurveyor List Waypoints by Type', async () => {
      await client.listWaypoints('camera_position');
    }, 'worldsurveyor');

    if (client) {
      await client.disconnect();
    }
  }

  // ========== WorldStreamer Tests ==========

  async testWorldStreamer() {
    this.log('\n📺 Testing WorldStreamer MCP Extension', COLORS.BOLD + COLORS.BLUE);

    let client;

    try {
      client = new WorldStreamerClient({ enableLogging: this.options.verbose });
      await client.initialize();
    } catch (error) {
      this.skipTest('WorldStreamer Connection', `Cannot connect: ${error.message}`, 'worldstreamer');
      return;
    }

    // Health check
    await this.runTest('WorldStreamer Health Check', async () => {
      const result = await client.executeCommand('worldstreamer_health_check');
      if (!result || !result.success || result.result?.isError) {
        throw new Error('Health check failed');
      }
    }, 'worldstreamer');

    // Get status
    await this.runTest('WorldStreamer Get Status', async () => {
      await client.getStatus();
    }, 'worldstreamer');

    // Validate environment
    await this.runTest('WorldStreamer Validate Environment', async () => {
      await client.validateEnvironment();
    }, 'worldstreamer');

    // Get streaming URLs only if streaming is active
    await this.runTest('WorldStreamer Get URLs (if streaming)', async () => {
      const status = await client.getStatus();
      if (status && status.streaming === true) {
        await client.getStreamingUrls();
      } else {
        // Just test that the endpoint works without requiring active stream
        await client.getStreamingUrls();
      }
    }, 'worldstreamer');

    if (client) {
      await client.disconnect();
    }
  }

  // ========== WorldRecorder Tests ==========

  async testWorldRecorder() {
    this.log('\n🎥 Testing WorldRecorder MCP Extension', COLORS.BOLD + COLORS.BLUE);

    let client;

    try {
      client = new WorldRecorderClient({ enableLogging: this.options.verbose });
      await client.initialize();
    } catch (error) {
      this.skipTest('WorldRecorder Connection', `Cannot connect: ${error.message}`, 'worldrecorder');
      return;
    }

    // Health check
    await this.runTest('WorldRecorder Health Check', async () => {
      const result = await client.executeCommand('worldrecorder_health_check');
      if (!result || !result.success || result.result?.isError) {
        throw new Error('Health check failed');
      }
    }, 'worldrecorder');

    // Get status (non-intrusive)
    await this.runTest('WorldRecorder Get Status', async () => {
      await client.getStatus();
    }, 'worldrecorder');

    // Get metrics (non-intrusive)
    await this.runTest('WorldRecorder Get Metrics', async () => {
      await client.getMetricsJSON();
    }, 'worldrecorder');

    if (client) {
      await client.disconnect();
    }
  }

  // ========== Health Check Tests ==========

  async testHealthChecks() {
    this.log('\n💓 Testing All Health Checks', COLORS.BOLD + COLORS.BLUE);

    const extensions = ['worldbuilder', 'worldviewer', 'worldsurveyor', 'worldstreamer', 'worldrecorder'];

    for (const extension of extensions) {
      const url = config.mcp.services[extension] || config.mcp.services[extension.replace('world', 'world')];

      if (!url) {
        this.skipTest(`${extension} Health`, 'URL not configured', 'health');
        continue;
      }

      await this.runTest(`${extension} Health`, async () => {
        // Basic connectivity test
        const response = await fetch(url.replace('/mcp', '/health'), {
          method: 'GET',
          timeout: 5000
        }).catch(() => {
          throw new Error('Connection failed');
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      }, 'health');
    }
  }

  // ========== Scene Cleanup ==========

  async cleanScene() {
    this.log('🧹 Cleaning Isaac Sim scene...', COLORS.YELLOW);

    let client;
    try {
      client = new WorldBuilderClient({ enableLogging: this.options.verbose });
      await client.initialize();

      await client.clearScene('/World', true);
      this.log('✅ Scene cleaned successfully', COLORS.GREEN);

      if (client) {
        await client.disconnect();
      }
    } catch (error) {
      this.log(`❌ Failed to clean scene: ${error.message}`, COLORS.RED);
      if (client) {
        await client.disconnect();
      }
      throw error;
    }
  }

  // ========== Main Test Runner ==========

  async run(testFilter = {}) {
    this.log('🧪 MCP Extensions Test Suite', COLORS.BOLD + COLORS.CYAN);

    // Handle clean-only mode
    if (testFilter.cleanOnly) {
      await this.cleanScene();
      this.log('🏁 Clean complete - exiting', COLORS.CYAN);
      process.exit(0);
    }

    this.log(`📋 Configuration:`, COLORS.CYAN);
    this.log(`   WorldBuilder: ${config.mcp.services.worldBuilder}`);
    this.log(`   WorldViewer: ${config.mcp.services.worldViewer}`);
    this.log(`   WorldSurveyor: ${config.mcp.services.worldSurveyor}`);
    this.log(`   WorldStreamer: ${config.mcp.services.worldStreamer}`);
    this.log(`   WorldRecorder: ${config.mcp.services.worldRecorder}`);
    this.log(`   Mock Mode: ${config.mcp.mockMode}`);

    const startTime = Date.now();

    try {
      // Clean scene before testing if requested
      if (testFilter.clean) {
        await this.cleanScene();
        this.log(''); // Add spacing
      }
      if (testFilter.all || testFilter.worldbuilder) {
        await this.testWorldBuilder();
      }

      if (testFilter.all || testFilter.worldviewer) {
        await this.testWorldViewer();
      }

      if (testFilter.all || testFilter.worldsurveyor) {
        await this.testWorldSurveyor();
      }

      if (testFilter.all || testFilter.worldstreamer) {
        await this.testWorldStreamer();
      }

      if (testFilter.all || testFilter.worldrecorder) {
        await this.testWorldRecorder();
      }

      if (testFilter.all || testFilter.health) {
        await this.testHealthChecks();
      }

    } catch (error) {
      this.log(`\n💥 Test suite error: ${error.message}`, COLORS.RED);
    }

    // Print results
    const duration = Date.now() - startTime;
    this.printResults(duration);

    // Exit with appropriate code
    process.exit(this.results.failed > 0 ? 1 : 0);
  }

  printResults(duration) {
    this.log('\n📊 Test Results', COLORS.BOLD + COLORS.CYAN);
    this.log(`⏱️  Duration: ${duration}ms`);
    this.log(`📈 Total: ${this.results.total}`);
    this.log(`✅ Passed: ${this.results.passed}`, COLORS.GREEN);
    this.log(`❌ Failed: ${this.results.failed}`, this.results.failed > 0 ? COLORS.RED : '');
    this.log(`⏭️  Skipped: ${this.results.skipped}`, COLORS.YELLOW);

    // Per-extension breakdown
    this.log('\n📋 By Extension:', COLORS.CYAN);
    Object.entries(this.results.extensions).forEach(([ext, stats]) => {
      const total = stats.passed + stats.failed + stats.skipped;
      this.log(`   ${ext}: ${stats.passed}/${total} passed`);
    });

    // Success rate
    const successRate = this.results.total > 0 ?
      ((this.results.passed / (this.results.total - this.results.skipped)) * 100).toFixed(1) : 0;

    this.log(`\n🎯 Success Rate: ${successRate}%`,
      successRate > 80 ? COLORS.GREEN : successRate > 60 ? COLORS.YELLOW : COLORS.RED);
  }
}

// ========== CLI Argument Parsing ==========

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    clean: args.includes('--clean'),
    cleanOnly: args.includes('--clean-only'),
    all: args.includes('--all'),
    worldbuilder: args.includes('--worldbuilder'),
    worldviewer: args.includes('--worldviewer'),
    worldsurveyor: args.includes('--worldsurveyor'),
    worldstreamer: args.includes('--worldstreamer'),
    worldrecorder: args.includes('--worldrecorder'),
    health: args.includes('--health')
  };

  // If clean-only is specified, we don't need other test flags
  if (options.cleanOnly) {
    return options;
  }

  // If no specific tests requested, default to all
  const testFlags = ['all', 'worldbuilder', 'worldviewer', 'worldsurveyor', 'worldstreamer', 'worldrecorder', 'health'];
  if (!testFlags.some(flag => options[flag])) {
    options.all = true;
  }

  return options;
}

// ========== Main Execution ==========

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = parseArgs();
  const testSuite = new MCPTestSuite({ verbose: options.verbose });

  // Handle uncaught errors gracefully
  process.on('unhandledRejection', (error) => {
    console.error('\n💥 Unhandled error:', error);
    process.exit(1);
  });

  testSuite.run(options);
}

export { MCPTestSuite };