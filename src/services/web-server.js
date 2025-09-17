/**
 * Web Server Service for Agent Adventures
 * Provides dashboard hosting and WebSocket API for real-time platform monitoring
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { WorldBuilderClient } from './mcp-clients/worldbuilder-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class WebServerService {
  constructor(eventBus, config = {}) {
    this.eventBus = eventBus;
    this.config = {
      port: config.port || 3001,
      dashboardPath: config.dashboardPath || join(__dirname, '../../dashboard'),
      enableLogging: config.enableLogging !== false,
      ...config
    };

    this.app = null;
    this.server = null;
    this.wss = null;
    this.clients = new Set();
    this.isRunning = false;
    this.worldBuilderClient = null;
    this.currentSettings = {
      llmApis: true,
      mcpCalls: true,
      streaming: true,
      judgePanel: true
    };
  }

  /**
   * Initialize and start the web server
   */
  async initialize() {
    try {
      // Create Express app
      this.app = express();

      // Middleware
      this.app.use(express.json());
      this.app.use(express.static(this.config.dashboardPath));

      // API Routes
      this._setupApiRoutes();

      // Create HTTP server
      this.server = createServer(this.app);

      // Setup WebSocket server
      this._setupWebSocketServer();

      // Setup event listeners
      this._setupEventListeners();

      // Initialize MCP clients
      await this._initializeMCPClients();

      // Start server
      await this._startServer();

      if (this.config.enableLogging) {
        console.log(`✅ Web Server initialized on port ${this.config.port}`);
        console.log(`📊 Dashboard available at: http://localhost:${this.config.port}`);
      }

    } catch (error) {
      console.error('❌ Web Server initialization failed:', error);
      throw error;
    }
  }

  /**
   * Stop the web server
   */
  async shutdown() {
    if (this.server) {
      await new Promise((resolve) => {
        this.server.close(resolve);
      });
    }

    if (this.wss) {
      this.wss.close();
    }

    this.isRunning = false;
    console.log('🛑 Web Server stopped');
  }

  /**
   * Broadcast data to all connected WebSocket clients
   */
  broadcast(type, data) {
    if (this.clients.size === 0) return;

    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });

    for (const client of this.clients) {
      if (client.readyState === client.OPEN) {
        try {
          client.send(message);
        } catch (error) {
          console.warn('WebSocket send error:', error.message);
          this.clients.delete(client);
        }
      }
    }
  }

  // ========== Private Methods ==========

  /**
   * Initialize MCP clients
   */
  async _initializeMCPClients() {
    try {
      // Only initialize if MCP calls are enabled
      if (this.currentSettings.mcpCalls) {
        this.worldBuilderClient = new WorldBuilderClient({
          enableLogging: this.config.enableLogging
        });

        await this.worldBuilderClient.initialize();
        console.log('✅ WorldBuilder MCP client initialized');
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize MCP clients:', error.message);
      // Continue without MCP clients - will fall back to simulation
    }
  }

  /**
   * Setup API routes
   */
  _setupApiRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        clients: this.clients.size,
        timestamp: Date.now()
      });
    });

    // Platform status
    this.app.get('/api/status', (req, res) => {
      // Get real platform status
      res.json({
        platform: {
          state: 'running',
          agents: 3,
          connections: {
            mcp: process.env.MOCK_MCP_MODE !== 'true',
            llm: process.env.MOCK_LLM_MODE !== 'true',
            streaming: process.env.MOCK_STREAMING_MODE !== 'true'
          },
          isaacSim: {
            connected: process.env.MOCK_MCP_MODE !== 'true',
            mockMode: process.env.MOCK_MCP_MODE === 'true'
          }
        }
      });
    });

    // MCP Worldbuilder API routes
    this.app.post('/api/mcp/worldbuilder/place_asset', async (req, res) => {
      try {
        console.log('🎯 MCP worldbuilder place_asset called:', req.body);

        if (this.currentSettings.mcpCalls) {
          // Make real MCP call to worldbuilder
          const result = await this._callWorldbuilderMCP('place_asset', req.body);
          res.json({ success: true, result });
        } else {
          // Simulate the call
          console.log('📝 Simulating place_asset call');
          res.json({ success: true, simulated: true });
        }
      } catch (error) {
        console.error('❌ Worldbuilder place_asset error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/worldbuilder/create_batch', async (req, res) => {
      try {
        console.log('🎯 MCP worldbuilder create_batch called:', req.body);

        if (this.currentSettings.mcpCalls) {
          // Make real MCP call to worldbuilder
          const result = await this._callWorldbuilderMCP('create_batch', req.body);
          res.json({ success: true, result });
        } else {
          // Simulate the call
          console.log('📝 Simulating create_batch call');
          res.json({ success: true, simulated: true });
        }
      } catch (error) {
        console.error('❌ Worldbuilder create_batch error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.post('/api/mcp/worldbuilder/clear_scene', async (req, res) => {
      try {
        console.log('🎯 MCP worldbuilder clear_scene called:', req.body);

        if (this.currentSettings.mcpCalls) {
          // Make real MCP call to worldbuilder
          const result = await this._callWorldbuilderMCP('clear_scene', req.body);
          res.json({ success: true, result });
        } else {
          // Simulate the call
          console.log('📝 Simulating clear_scene call');
          res.json({ success: true, simulated: true });
        }
      } catch (error) {
        console.error('❌ Worldbuilder clear_scene error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Dashboard route (fallback)
    this.app.get('/', (req, res) => {
      res.sendFile(join(this.config.dashboardPath, 'index.html'));
    });
  }

  /**
   * Setup WebSocket server
   */
  _setupWebSocketServer() {
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      this.clients.add(ws);

      if (this.config.enableLogging) {
        console.log(`🔌 Dashboard client connected (${this.clients.size} total)`);
      }

      // Send initial connection message
      ws.send(JSON.stringify({
        type: 'connection',
        data: { status: 'connected', timestamp: Date.now() }
      }));

      // Handle messages from client
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this._handleClientMessage(ws, data);
        } catch (error) {
          console.warn('Invalid WebSocket message:', error.message);
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        this.clients.delete(ws);
        if (this.config.enableLogging) {
          console.log(`🔌 Dashboard client disconnected (${this.clients.size} remaining)`);
        }
      });

      // Handle errors
      ws.on('error', (error) => {
        console.warn('WebSocket error:', error.message);
        this.clients.delete(ws);
      });
    });
  }

  /**
   * Setup event listeners for platform events
   */
  _setupEventListeners() {
    // Listen to platform events and broadcast to dashboard
    this.eventBus.subscribe('platform:started', (event) => {
      this.broadcast('platform:started', event.payload);
    });

    this.eventBus.subscribe('agent:proposal', (event) => {
      this.broadcast('agent:proposal', event.payload);
    });

    this.eventBus.subscribe('agent:competition', (event) => {
      this.broadcast('agent:competition', event.payload);
    });

    this.eventBus.subscribe('mcp:command', (event) => {
      this.broadcast('mcp:command', event.payload);
    });

    this.eventBus.subscribe('system:metrics', (event) => {
      this.broadcast('system:metrics', event.payload);
    });

    this.eventBus.subscribe('stream:status', (event) => {
      this.broadcast('stream:status', event.payload);
    });
  }

  /**
   * Handle messages from WebSocket clients
   */
  _handleClientMessage(ws, data) {
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      case 'request:status':
        // Send current platform status
        this.broadcast('platform:status', {
          clients: this.clients.size,
          uptime: process.uptime()
        });
        break;

      case 'command':
        // Handle dashboard commands
        this._handleDashboardCommand(ws, data);
        break;

      default:
        if (this.config.enableLogging) {
          console.log('Unknown client message type:', data.type);
        }
    }
  }

  /**
   * Handle dashboard commands
   */
  _handleDashboardCommand(ws, data) {
    const { module, command, data: commandData } = data;

    if (module === 'system' && command === 'get_status') {
      // Send current platform status including agent information
      const platformStatus = this._getPlatformStatus();
      ws.send(JSON.stringify({
        type: 'platform:status',
        data: platformStatus,
        timestamp: Date.now()
      }));
    }

    if (module === 'competition' && command === 'start') {
      // Handle competition start command
      this._handleCompetitionStart(ws, commandData);
    }

    if (module === 'settings' && command === 'update') {
      // Handle settings update command
      this._handleSettingsUpdate(ws, commandData);
    }
  }

  /**
   * Handle competition start command
   */
  _handleCompetitionStart(ws, data) {
    const { type } = data;

    console.log(`🏆 Starting ${type} competition via dashboard command`);

    // Generate a unique batch ID for this competition
    const batchId = `comp_${type}_${Date.now()}`;

    // Map competition type to agent type and proposal type
    const competitionMapping = {
      'asset_placement': { agentType: 'scene', proposalType: 'asset_placement' },
      'camera_move': { agentType: 'camera', proposalType: 'camera_movement' },
      'story_advance': { agentType: 'story', proposalType: 'story_progression' }
    };

    const mapping = competitionMapping[type] || { agentType: 'scene', proposalType: 'asset_placement' };

    // Emit proposal request to trigger agent competition
    this.eventBus.emit('proposal:request', {
      batchId,
      agentType: mapping.agentType,
      proposalType: mapping.proposalType,
      context: {
        competitionType: type,
        source: 'dashboard',
        audience: 'interactive'
      },
      deadline: Date.now() + 30000, // 30 second deadline
      timestamp: Date.now()
    });

    // Also emit general competition start event
    this.eventBus.emit('competition:start', {
      batchId,
      type,
      timestamp: Date.now(),
      source: 'dashboard'
    });

    // Acknowledge the command
    ws.send(JSON.stringify({
      type: 'competition:started',
      data: { type, batchId },
      timestamp: Date.now()
    }));

    console.log(`📨 Emitted proposal:request for ${type} competition (batch: ${batchId})`);
  }

  /**
   * Handle settings update command
   */
  _handleSettingsUpdate(ws, settings) {
    console.log(`⚙️ Updating service settings:`, settings);

    // Emit settings update event to the platform
    this.eventBus.emit('platform:settings_updated', {
      settings,
      timestamp: Date.now(),
      source: 'dashboard'
    });

    // Store current settings (could be persisted to database/file)
    this.currentSettings = {
      ...this.currentSettings,
      ...settings
    };

    // Acknowledge the settings update
    ws.send(JSON.stringify({
      type: 'settings:updated',
      data: settings,
      timestamp: Date.now()
    }));

    // Broadcast to all clients
    this.broadcast('settings:updated', settings);

    console.log(`✅ Settings updated: LLM=${settings.llmApis}, MCP=${settings.mcpCalls}, Stream=${settings.streaming}, Judge=${settings.judgePanel}`);
  }

  /**
   * Get current platform status
   */
  _getPlatformStatus() {
    const isMockMode = process.env.MOCK_MCP_MODE === 'true';

    return {
      agentsStarted: 3, // This should come from the agent manager
      agentsFailed: 0,
      startTime: Date.now(),
      uptime: process.uptime(),
      clients: this.clients.size,
      services: {
        isaacSim: isMockMode ? 'mock' : 'healthy',
        eventBus: 'healthy',
        agents: 'healthy',
        streaming: process.env.MOCK_STREAMING_MODE === 'true' ? 'mock' : 'inactive'
      },
      isaacSim: {
        connected: !isMockMode,
        mockMode: isMockMode,
        mcpUrls: {
          worldBuilder: process.env.WORLDBUILDER_MCP_URL,
          worldViewer: process.env.WORLDVIEWER_MCP_URL,
          worldSurveyor: process.env.WORLDSURVEYOR_MCP_URL,
          worldStreamer: process.env.WORLDSTREAMER_MCP_URL,
          worldRecorder: process.env.WORLDRECORDER_MCP_URL
        }
      }
    };
  }

  /**
   * Start the HTTP server
   */
  _startServer() {
    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, (error) => {
        if (error) {
          reject(error);
        } else {
          this.isRunning = true;
          resolve();
        }
      });
    });
  }

  /**
   * Call worldbuilder MCP service
   */
  async _callWorldbuilderMCP(method, params) {
    try {
      if (!this.worldBuilderClient) {
        throw new Error('WorldBuilder MCP client not initialized');
      }

      console.log(`🔗 Calling worldbuilder MCP: ${method}`);

      let result;
      if (method === 'place_asset') {
        result = await this.worldBuilderClient.placeAsset(
          params.name,
          params.asset_path,
          params.position,
          params.rotation,
          params.scale,
          params.prim_path
        );
      } else if (method === 'create_batch') {
        result = await this.worldBuilderClient.createBatch(
          params.batch_name,
          params.elements,
          params.parent_path
        );
      } else if (method === 'clear_scene') {
        result = await this.worldBuilderClient.clearScene(
          params.path,
          params.confirm
        );
      } else {
        throw new Error(`Unsupported MCP method: ${method}`);
      }

      console.log(`✅ MCP ${method} successful:`, result);
      return result;

    } catch (error) {
      console.error(`❌ MCP ${method} failed:`, error);
      throw error;
    }
  }

  /**
   * Get server status
   */
  getStatus() {
    return {
      running: this.isRunning,
      port: this.config.port,
      clients: this.clients.size,
      uptime: this.isRunning ? process.uptime() : 0
    };
  }
}

export default WebServerService;