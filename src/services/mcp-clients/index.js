import { WorldBuilderClient } from './worldbuilder-client.js';
import { WorldViewerClient } from './worldviewer-client.js';
import { WorldSurveyorClient } from './worldsurveyor-client.js';
import { WorldStreamerClient } from './worldstreamer-client.js';
import { WorldRecorderClient } from './worldrecorder-client.js';

/**
 * MCP Client Manager - provides unified access to all Isaac Sim MCP services
 */
export class MCPClientManager {
  constructor(options = {}) {
    this.options = {
      mockMode: options.mockMode !== false, // Default to mock mode for development
      timeout: options.timeout || 10000,
      retries: options.retries || 3,
      enableLogging: options.enableLogging !== false,
      ...options
    };

    // Initialize all MCP clients
    this.clients = {
      worldBuilder: new WorldBuilderClient(this.options),
      worldViewer: new WorldViewerClient(this.options),
      worldSurveyor: new WorldSurveyorClient(this.options),
      worldStreamer: new WorldStreamerClient(this.options),
      worldRecorder: new WorldRecorderClient(this.options),
    };

    // Create convenience accessors
    this.worldBuilder = this.clients.worldBuilder;
    this.worldViewer = this.clients.worldViewer;
    this.worldSurveyor = this.clients.worldSurveyor;
    this.worldStreamer = this.clients.worldStreamer;
    this.worldRecorder = this.clients.worldRecorder;
  }

  /**
   * Call a tool on a specific MCP client
   * @param {string} clientName - Name of the client (worldBuilder, worldViewer, etc.)
   * @param {string} toolName - Name of the tool/command to execute
   * @param {object} params - Parameters for the tool
   */
  async callTool(clientName, toolName, params = {}) {
    // Normalize client name to camelCase (worldbuilder -> worldBuilder)
    const normalizedName = clientName.replace(/^world/, 'world') // Keep 'world' prefix
      .replace(/builder/i, 'Builder')
      .replace(/viewer/i, 'Viewer')
      .replace(/surveyor/i, 'Surveyor')
      .replace(/streamer/i, 'Streamer')
      .replace(/recorder/i, 'Recorder');

    const client = this.clients[normalizedName];
    if (!client) {
      throw new Error(`Unknown MCP client: ${clientName} (tried ${normalizedName})`);
    }

    // Use the client's executeCommand method
    return await client.executeCommand(toolName, params);
  }

  /**
   * Get all client instances
   */
  getAllClients() {
    return { ...this.clients };
  }

  /**
   * Perform health check on all clients
   */
  async healthCheckAll() {
    const results = {};

    for (const [name, client] of Object.entries(this.clients)) {
      try {
        results[name] = await client.healthCheck();
      } catch (error) {
        results[name] = {
          status: 'error',
          error: error.message
        };
      }
    }

    return {
      overall: this._determineOverallHealth(results),
      clients: results,
      timestamp: Date.now()
    };
  }

  /**
   * Get metrics from all clients
   */
  getMetricsAll() {
    const metrics = {};

    for (const [name, client] of Object.entries(this.clients)) {
      metrics[name] = client.getMetrics();
    }

    return {
      clients: metrics,
      timestamp: Date.now()
    };
  }

  /**
   * Determine overall system health
   */
  _determineOverallHealth(clientResults) {
    const statuses = Object.values(clientResults).map(r => r.status);

    if (statuses.every(s => s === 'healthy')) {
      return 'healthy';
    } else if (statuses.some(s => s === 'healthy')) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }
}

// Export individual clients and manager
export { WorldBuilderClient, WorldViewerClient, WorldSurveyorClient, WorldStreamerClient, WorldRecorderClient };
export default MCPClientManager;
