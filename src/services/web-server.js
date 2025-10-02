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
import YouTubeStreamingController from './streaming/youtube-streaming-controller.js';
import {
  DASHBOARD_EVENT_TYPES,
  adaptAgentProposal,
  adaptCompetitionCompleted,
  adaptCompetitionVoting,
  adaptJudgeDecision,
  adaptPlatformStatus,
  adaptSettings
} from './dashboard/dashboard-event-adapter.js';
import streamRoutes from '../routes/streamRoutes.js';
import audioRoutes from '../routes/audioRoutes.js';
import { setupWebSocketServer } from '../controllers/streamController.js';

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
    this.streamingController = null;
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
      this._setupStreamingRoutes();

      // Create HTTP server
      this.server = createServer(this.app);

      // Setup WebSocket server
      this._setupWebSocketServer();

      // Setup event listeners
      this._setupEventListeners();

      // Initialize MCP clients
      await this._initializeMCPClients();

      // Initialize streaming controller
      this._initializeStreamingController();

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

  _broadcastExcept(excluded, type, data) {
    if (this.clients.size <= 1) return;

    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });

    for (const client of this.clients) {
      if (client === excluded || client.readyState !== client.OPEN) {
        continue;
      }

      try {
        client.send(message);
      } catch (error) {
        console.warn('WebSocket send error:', error.message);
        this.clients.delete(client);
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
   * Initialize streaming controller
   */
  _initializeStreamingController() {
    try {
      if (this.currentSettings.streaming) {
        this.streamingController = new YouTubeStreamingController({
          mediaBridgeDir: process.env.MEDIA_BRIDGE_DIR,
          composeFile: process.env.MEDIA_BRIDGE_COMPOSE_FILE,
          webrtcHealthUrl: process.env.WEBRTC_HEALTH_URL,
          audioHealthUrl: process.env.AUDIO_HEALTH_URL
        });
        console.log('✅ YouTube Streaming Controller initialized');
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize streaming controller:', error.message);
    }
  }

  /**
   * Setup API routes
   */
  _setupApiRoutes() {
    this.app.use('/api', streamRoutes);
    this.app.use('/api/audio', audioRoutes);

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
   * Setup YouTube Streaming API routes
   */
  _setupStreamingRoutes() {
    const formatSession = (session = {}) => ({
      id: session.id,
      status: session.status,
      startTime: session.streaming?.startedAt || null,
      endTime: session.streaming?.endedAt || null,
      youtubeWatchUrl: session.monitoring?.youtubeWatchUrl || null,
      webRTCMonitorUrl: session.monitoring?.webrtcUrl || null,
      audioSource: session.streaming?.audioSource || null,
      videoBitrateK: session.streaming?.videoBitrateK || null,
      audioBitrateK: session.streaming?.audioBitrateK || null,
      fps: session.streaming?.fps || null,
      primaryRtmpUrl: session.streaming?.primaryUrl || null,
      backupRtmpUrl: session.streaming?.backupUrl || null,
      health: session.health || null
    });

    // POST /api/streaming/youtube/start - Start YouTube streaming session
    this.app.post('/api/streaming/youtube/start', async (req, res) => {
      try {
        if (!this.streamingController) {
          return res.status(503).json({
            success: false,
            error: 'Streaming controller not initialized'
          });
        }

        const options = {
          streamKey: req.body.streamKey || process.env.PRIMARY_STREAM_KEY,
          backupStreamKey: req.body.backupStreamKey || process.env.BACKUP_STREAM_KEY,
          primaryUrl: req.body.primaryUrl || process.env.PRIMARY_RTMP_URL,
          backupUrl: req.body.backupUrl || process.env.BACKUP_RTMP_URL,
          audioSource: req.body.audioSource || process.env.MEDIA_BRIDGE_AUDIO_SOURCE,
          audioToken: req.body.audioToken || process.env.MEDIA_BRIDGE_AUDIO_TOKEN || process.env.AUDIO_TOKEN,
          videoBitrateK: req.body.videoBitrateK || req.body.videoBitrate || process.env.MEDIA_BRIDGE_VIDEO_BITRATE_K,
          audioBitrateK: req.body.audioBitrateK || req.body.audioBitrate || process.env.MEDIA_BRIDGE_AUDIO_BITRATE_K,
          fps: req.body.fps || process.env.MEDIA_BRIDGE_FPS,
          srtUrl: req.body.srtUrl || process.env.MEDIA_BRIDGE_SRT_URL,
          webrtcHost: req.body.webrtcHost,
          webrtcPort: req.body.webrtcPort,
          webrtcPath: req.body.webrtcPath,
          youtubeWatchUrl: req.body.youtubeWatchUrl || process.env.YOUTUBE_WATCH_URL
        };

        console.log('🎥 Starting YouTube stream via API', {
          primaryUrl: options.primaryUrl,
          backupConfigured: Boolean(options.backupStreamKey),
          audioSource: options.audioSource,
          srtUrl: options.srtUrl,
          videoBitrateK: options.videoBitrateK,
          audioBitrateK: options.audioBitrateK,
          fps: options.fps,
          webrtcHost: options.webrtcHost,
          webrtcPort: options.webrtcPort
        });
        const session = await this.streamingController.startYouTubeStream(options);

        // Broadcast streaming status to dashboard clients
        this.broadcast(DASHBOARD_EVENT_TYPES.STREAM_STATUS, {
          status: session.status,
          session: formatSession(session)
        });

        res.json({
          success: true,
          session: formatSession(session)
        });

      } catch (error) {
        console.error('❌ Failed to start YouTube stream', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // POST /api/streaming/youtube/:sessionId/stop - Stop YouTube streaming session
    this.app.post('/api/streaming/youtube/:sessionId/stop', async (req, res) => {
      try {
        if (!this.streamingController) {
          return res.status(503).json({
            success: false,
            error: 'Streaming controller not initialized'
          });
        }

        const { sessionId } = req.params;
        console.log('🛑 Stopping YouTube stream via API', { sessionId });

        const session = await this.streamingController.stopYouTubeStream(sessionId);

        // Broadcast streaming status to dashboard clients
        this.broadcast(DASHBOARD_EVENT_TYPES.STREAM_STATUS, {
          status: session.status,
          session: formatSession(session)
        });

        res.json({
          success: true,
          session: formatSession(session)
        });

      } catch (error) {
        console.error('❌ Failed to stop YouTube stream', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // GET /api/streaming/youtube/:sessionId/status - Get session status
    this.app.get('/api/streaming/youtube/:sessionId/status', async (req, res) => {
      try {
        if (!this.streamingController) {
          return res.status(503).json({
            success: false,
            error: 'Streaming controller not initialized'
          });
        }

        const { sessionId } = req.params;
        const session = await this.streamingController.getSessionStatus(sessionId);

        if (!session) {
          return res.status(404).json({
            success: false,
            error: 'Session not found'
          });
        }

        res.json({
          success: true,
          session: formatSession(session)
        });

      } catch (error) {
        console.error('❌ Failed to get YouTube stream status', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // GET /api/streaming/youtube/sessions - List active sessions
    this.app.get('/api/streaming/youtube/sessions', async (req, res) => {
      try {
        if (!this.streamingController) {
          return res.status(503).json({
            success: false,
            error: 'Streaming controller not initialized'
          });
        }

        const health = await this.streamingController.performHealthChecks();
        this.streamingController.ensureSessionFromHealth(health);
        const sessions = this.streamingController.getActiveSessions();

        res.json({
          success: true,
          sessions: sessions.map(formatSession),
          count: sessions.length
        });

      } catch (error) {
        console.error('❌ Failed to list YouTube streams', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // GET /api/streaming/health - Get streaming system health
    this.app.get('/api/streaming/health', async (req, res) => {
      try {
        if (!this.streamingController) {
          return res.status(503).json({
            success: false,
            error: 'Streaming controller not initialized'
          });
        }

        const health = await this.streamingController.performHealthChecks();
        this.streamingController.ensureSessionFromHealth(health);
        const overall = Array.isArray(health)
          ? health.every(item => item.status === 'ok')
          : false;

        res.json({
          success: true,
          health: {
            overall
          },
          details: health,
          sessions: this.streamingController.getActiveSessions().map(formatSession)
        });

      } catch (error) {
        console.error('❌ Streaming health check failed', error);
        res.status(500).json({
          success: false,
          health: {
            overall: false
          },
          details: [],
          error: error.message
        });
      }
    });

    // GET /api/streaming/youtube/presets - Get quality presets
    this.app.get('/api/streaming/youtube/presets', (req, res) => {
      const presets = {
        '720p30': {
          name: '720p 30fps (HD)',
          width: 1280,
          height: 720,
          fps: 30,
          bitrate: 2500,
          format: '720p'
        },
        '1080p30': {
          name: '1080p 30fps (Full HD)',
          width: 1920,
          height: 1080,
          fps: 30,
          bitrate: 4000,
          format: '1080p'
        },
        '1080p60': {
          name: '1080p 60fps (Full HD)',
          width: 1920,
          height: 1080,
          fps: 60,
          bitrate: 6000,
          format: '1080p'
        }
      };

      res.json({
        success: true,
        presets
      });
    });
  }

  /**
   * Setup WebSocket server
   */
  _setupWebSocketServer() {
    setupWebSocketServer(this.server);
  }

  /**
   * Setup event listeners for platform events
   */
  _setupEventListeners() {
    // Listen to platform events and broadcast to dashboard with normalised payloads
    this.eventBus.subscribe('platform:started', (event) => {
      this.broadcast(
        DASHBOARD_EVENT_TYPES.PLATFORM_STARTED,
        adaptPlatformStatus(event.payload)
      );
    });

    this.eventBus.subscribe('agent:proposal', (event) => {
      const adapted = adaptAgentProposal(event.payload);
      if (adapted.agentId) {
        this.broadcast(DASHBOARD_EVENT_TYPES.AGENT_PROPOSAL, adapted);
      }
    });

    this.eventBus.subscribe('proposal:decision_made', (event) => {
      this.broadcast(
        DASHBOARD_EVENT_TYPES.JUDGE_DECISION,
        adaptJudgeDecision(event.payload)
      );
    });

    this.eventBus.subscribe('competition:voting_result', (event) => {
      this.broadcast(
        DASHBOARD_EVENT_TYPES.COMPETITION_VOTING,
        adaptCompetitionVoting(event.payload)
      );
    });

    this.eventBus.subscribe('competition:completed', (event) => {
      this.broadcast(
        DASHBOARD_EVENT_TYPES.COMPETITION_COMPLETED,
        adaptCompetitionCompleted(event.payload)
      );
    });

    this.eventBus.subscribe('system:metrics', (event) => {
      this.broadcast(DASHBOARD_EVENT_TYPES.SYSTEM_METRICS, event.payload);
    });

    this.eventBus.subscribe('stream:status', (event) => {
      this.broadcast(DASHBOARD_EVENT_TYPES.STREAM_STATUS, event.payload);
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
        // Send current platform status to requester only
        ws.send(JSON.stringify({
          type: DASHBOARD_EVENT_TYPES.PLATFORM_STATUS,
          data: adaptPlatformStatus({
            clients: this.clients.size,
            uptime: process.uptime()
          }),
          timestamp: Date.now()
        }));
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
        type: DASHBOARD_EVENT_TYPES.PLATFORM_STATUS,
        data: adaptPlatformStatus(platformStatus),
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
      type: DASHBOARD_EVENT_TYPES.COMPETITION_STARTED,
      data: { type, batchId },
      timestamp: Date.now()
    }));

    console.log(`📨 Emitted proposal:request for ${type} competition (batch: ${batchId})`);

    // Notify other dashboard clients
    this._broadcastExcept(ws, DASHBOARD_EVENT_TYPES.COMPETITION_STARTED, { type, batchId });
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
    const adaptedSettings = adaptSettings(settings);

    ws.send(JSON.stringify({
      type: DASHBOARD_EVENT_TYPES.SETTINGS_UPDATED,
      data: adaptedSettings,
      timestamp: Date.now()
    }));

    // Broadcast to all clients
    this.broadcast(
      DASHBOARD_EVENT_TYPES.SETTINGS_UPDATED,
      adaptedSettings
    );

    console.log(`✅ Settings updated: LLM=${settings.llmApis}, MCP=${settings.mcpCalls}, Stream=${settings.streaming}, Judge=${settings.judgePanel}`);
  }

  /**
   * Get current platform status
   */
  _getPlatformStatus() {
    const envMockMcp = process.env.MOCK_MCP_MODE === 'true';
    const envMockStreaming = process.env.MOCK_STREAMING_MODE === 'true';
    const mcpMockMode = this.currentSettings.mcpCalls === false || envMockMcp;
    const streamingMockMode = this.currentSettings.streaming === false || envMockStreaming;
    const llmMockMode = this.currentSettings.llmApis === false;

    const isaacConnected = !mcpMockMode && Boolean(this.worldBuilderClient);

    return {
      agentsStarted: 3, // This should come from the agent manager
      agentsFailed: 0,
      startTime: Date.now(),
      uptime: process.uptime(),
      clients: this.clients.size,
      services: {
        isaacSim: mcpMockMode ? 'mock' : 'healthy',
        eventBus: 'healthy',
        agents: llmMockMode ? 'mock' : 'healthy',
        streaming: streamingMockMode ? 'mock' : 'inactive'
      },
      isaacSim: {
        connected: isaacConnected,
        mockMode: mcpMockMode,
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
