/**
 * Web Server Service for Agent Adventures
 * Provides dashboard hosting and WebSocket API for real-time platform monitoring
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, existsSync, readFileSync } from 'fs';
import { WorldBuilderClient } from './mcp-clients/worldbuilder-client.js';

import {
  DASHBOARD_EVENT_TYPES,
  adaptAgentProposal,
  adaptCompetitionCompleted,
  adaptCompetitionVoting,
  adaptJudgeDecision,
  adaptPlatformStatus,
  adaptSettings
} from './dashboard/dashboard-event-adapter.js';

import audioRoutes from '../routes/audioRoutes.js';
import ambientRoutes from '../routes/ambientRoutes.js';
import { setupWebSocketServer, getDashboardSockets } from '../controllers/streamController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const YOUTUBE_SETTINGS_PATH = join(__dirname, '../config/youtube_settings.json');

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
    this.isRunning = false;
    this.worldBuilderClient = null;
    this.chatMessagePoster = null;
    this.currentSettings = {
      llmApis: true,
      mcpCalls: true,
      streaming: true,
      judgePanel: true,
      audioMode: 'story'
    };
    this.orchestratorManager = null;
    this.storyLoopManager = null;
    this.mcpClientManager = null;
  }

  /**
   * Initialize and start the web server
   */
  async initialize() {
    try {
      // Make this instance globally available for WebSocket handlers
      global.webServerInstance = this;

      // Create Express app
      this.app = express();

      // Middleware
      this.app.use(express.json());
      this.app.use(express.static(this.config.dashboardPath));

      // API Routes
    this._setupApiRoutes();

    this._setupAmbientRoutes();

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
    // Use dashboard sockets from streamController
    const clients = getDashboardSockets();

    this._broadcastExcept(null, type, data);
  }

  _broadcastExcept(excluded, type, data) {
    const clients = getDashboardSockets();
    if (clients.size === 0) {
      return;
    }

    const message = JSON.stringify({
      type,
      data,
      timestamp: Date.now()
    });

    console.log(`[WebServer] Broadcasting ${type} to ${clients.size} client(s)`);
    for (const client of clients) {
      if (client === excluded || client.readyState !== 1) {
        continue;
      }

      try {
        client.send(message);
      } catch (error) {
        console.warn('WebSocket send error:', error.message);
        clients.delete(client);
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
    // This method is now empty, but retained for potential future use.
  }

  /**
   * Setup API routes
   */
  _setupApiRoutes() {

    this.app.use('/api/audio', audioRoutes);

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        clients: getDashboardSockets().size,
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

    this.app.post('/api/orchestrator/start', async (req, res) => {
      if (!this.orchestratorManager) {
        return res.status(503).json({
          success: false,
          error: 'Orchestrator manager not available'
        });
      }

      const adventureId = req.body?.adventureId || this.config.defaultAdventure || 'sample-adventure';
      const initialContext = req.body?.initialContext || {};
      const autoReset = req.body?.autoReset !== undefined ? !!req.body.autoReset : true;

      const alreadyRunning = this.orchestratorManager
        .getActiveAdventures()
        .some(({ id }) => id === adventureId);

      if (alreadyRunning) {
        return res.status(409).json({
          success: false,
          error: `Adventure ${adventureId} is already running`
        });
      }

      try {
        const { promise } = await this.orchestratorManager.startAdventure(adventureId, {
          initialContext,
          autoReset
        });

        promise
          .then(() => {
            console.log(`🎬 Adventure ${adventureId} completed`);
          })
          .catch((error) => {
            console.error(`⚠️ Adventure ${adventureId} ended with error:`, error);
          });

        res.status(202).json({
          success: true,
          adventureId,
          initialContext
        });
      } catch (error) {
        console.error('❌ Failed to start orchestrated adventure:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get YouTube stream ID endpoint
    this.app.get('/api/stream/youtube-id', (req, res) => {
      res.json({
        streamId: process.env.YOUTUBE_LIVE_BROADCAST_ID || ''
      });
    });

    // Local chat message endpoint (for testing without YouTube API)
    this.app.post('/api/chat/local-message', async (req, res) => {
      try {
        const { message } = req.body;
        const username = 'AgentAdventures';
        const channelId = 'UC8N2VGl1BoDwy1ke99cQIGw';

        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        // Emit to EventBus with same format as YouTube chat
        this.eventBus.emit('chat:message', {
          messageId: `local_${Date.now()}`,
          text: message,
          author: {
            id: channelId,
            name: username,
            isModerator: false,
            isOwner: true,
            isVerified: false
          },
          publishedAt: new Date().toISOString(),
          type: 'textMessageEvent',
          platform: 'local'
        });

        console.log(`💬 [Local Chat] ${username}: ${message}`);
        res.json({ success: true, username, message });
      } catch (error) {
        console.error('❌ Error processing local chat message:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Toggle YouTube chat posting
    this.app.post('/api/chat/toggle-youtube-posting', async (req, res) => {
      try {
        const { enabled } = req.body;

        if (!this.chatMessagePoster) {
          return res.status(400).json({ error: 'Chat message poster not initialized' });
        }

        this.chatMessagePoster.setDisabled(!enabled);

        console.log(`📢 [YouTube Chat] Posting ${enabled ? 'enabled' : 'disabled'}`);
        res.json({
          success: true,
          enabled,
          message: `YouTube chat posting ${enabled ? 'enabled' : 'disabled'}`
        });
      } catch (error) {
        console.error('❌ Error toggling YouTube chat posting:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Quick test scene endpoint (no LLM, just MCP calls + audio)
    this.app.post('/api/test/quick-scene', async (req, res) => {
      try {
        console.log('🎨 Creating quick test scene with audio...');

        // Clear scene
        await this.mcpClientManager.callTool('worldbuilder', 'worldbuilder_clear_scene', {
          path: '/World',
          confirm: true
        });

        // Wait for scene clear to complete
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Trigger audio generation early (narration TTS + music generation takes time)
        // This allows audio to generate while we build the scene and setup camera
        const syncId = 'sample_scene_intro';

        // Create promise to wait for audio ready
        const audioReadyPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            console.log('⏱️ Audio ready timeout - proceeding anyway');
            resolve(false);
          }, 10000); // 10 second timeout

          const handler = (data) => {
            if (data.sync_id === syncId) {
              console.log('🎵 Audio ready event received, proceeding with camera');
              clearTimeout(timeout);
              this.eventBus.off('audio:ready', handler);
              resolve(true);
            }
          };

          this.eventBus.on('audio:ready', handler);
        });

        this.eventBus.emit('orchestrator:audio:request', {
          requestId: `test_${Date.now()}`,
          stageId: 'audio_test',
          stageConfig: { optional: true },
          payload: {
            sync: {
              id: syncId,
              channels: ['narration', 'music', 'ambient'],
              metadata: {
                scene: 'aetheric_spire_intro'
              }
            },
            requests: [
              {
                channel: 'narration',
                payload: {
                  text: 'Behold the Aetheric Spire, humming with resonant light—our heroes arrive beneath cascading halos of energy. The ancient tower pulses with otherworldly power, its crystalline surface reflecting countless prismatic streams across the shadowed plaza. What mysteries lie waiting within?',
                  voice: 'af_heart',
                  volume: 0.65,
                  duck_background: true
                }
              },
              {
                channel: 'music',
                payload: {
                  tension_level: 'epic',
                  intensity: 0.75,
                  genre: 'orchestral',
                  duration: 20.0,
                  transition: {
                    type: 'crescendo',
                    duration_ms: 5000
                  }
                }
              },
              {
                channel: 'ambient',
                payload: {
                  sample_id: 'sonniss2024/scifi/scifi_0002.wav',
                  fade_out_after: 30,
                  fade_duration: 3.0,
                  loop_if_short: true,
                  volume: 0.35
                }
              }
            ],
            allowOffline: true
          }
        });

        // Create the Aetheric Spire scene from sample adventure (while audio generates)
        await this.mcpClientManager.callTool('worldbuilder', 'worldbuilder_create_batch', {
          batch_name: 'orchestrator_showcase',
          parent_path: '/World',
          elements: [
            {
              element_type: 'cylinder',
              name: 'aetheric_spire',
              position: [0, 0, 6],
              scale: [1.2, 1.2, 12],
              color: [0.2, 0.8, 1.0]
            },
            {
              element_type: 'sphere',
              name: 'halo_light_north',
              position: [0, 6, 4],
              scale: [1.5, 1.5, 1.5],
              color: [1.0, 0.85, 0.3]
            },
            {
              element_type: 'sphere',
              name: 'halo_light_south',
              position: [0, -6, 4],
              scale: [1.5, 1.5, 1.5],
              color: [1.0, 0.85, 0.3]
            },
            {
              element_type: 'sphere',
              name: 'halo_light_east',
              position: [6, 0, 4],
              scale: [1.5, 1.5, 1.5],
              color: [1.0, 0.85, 0.3]
            },
            {
              element_type: 'sphere',
              name: 'halo_light_west',
              position: [-6, 0, 4],
              scale: [1.5, 1.5, 1.5],
              color: [1.0, 0.85, 0.3]
            },
            {
              element_type: 'cube',
              name: 'elevated_plinth',
              position: [0, 0, 1],
              scale: [6, 6, 2],
              color: [0.15, 0.15, 0.22]
            }
          ]
        });

        // Wait for audio to be ready and streaming before camera movement
        await audioReadyPromise;

        // Execute multi-shot camera sequence (audio is now streaming)
        const spireCenter = [0, 0, 4];

        // Shot 1: Smooth move approach
        await this.mcpClientManager.callTool('worldviewer', 'worldviewer_smooth_move', {
          start_position: [-15, -12, 8],
          end_position: [-10, -8, 6],
          start_target: spireCenter,
          end_target: spireCenter,
          duration: 3.0,
          easing_type: 'ease_in_out',
          execution_mode: 'auto'
        });

        // Shot 2: Orbital sweep around spire (continues from shot 1's end position)
        await this.mcpClientManager.callTool('worldviewer', 'worldviewer_orbit_shot', {
          center: spireCenter,
          distance: 14,
          start_azimuth: -60,
          end_azimuth: 180,
          elevation: 25,
          duration: 8.0,
          start_position: [-10, -8, 6], // Where shot 1 ended
          start_target: spireCenter,
          end_target: [0, 0, 6], // Shift focus upward during orbit
          execution_mode: 'auto'
        });

        // Shot 3: Arc shot revealing the top of the spire
        await this.mcpClientManager.callTool('worldviewer', 'worldviewer_arc_shot', {
          start_position: [10, 8, 6],
          end_position: [5, 10, 10],
          start_target: [0, 0, 6],
          end_target: [0, 0, 10],
          duration: 3.0,
          movement_style: 'dramatic',
          execution_mode: 'auto'
        });

        console.log('✅ Quick test scene created with multi-shot sequence + audio');
        res.json({ success: true, message: 'Test scene with audio created successfully' });
      } catch (error) {
        console.error('❌ Failed to create test scene:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.app.post('/api/youtube/broadcast-id', async (req, res) => {
      try {
        const { broadcastId } = req.body;
        if (!broadcastId) {
          return res.status(400).json({ success: false, error: 'broadcastId is required' });
        }

        // Persist the new ID to the settings file
        try {
          let settings = {};
          if (existsSync(YOUTUBE_SETTINGS_PATH)) {
            settings = JSON.parse(readFileSync(YOUTUBE_SETTINGS_PATH, 'utf8'));
          }
          settings.broadcastId = broadcastId;
          writeFileSync(YOUTUBE_SETTINGS_PATH, JSON.stringify(settings, null, 2));
        } catch (error) {
          console.error('❌ Failed to write YouTube settings file:', error);
          // Non-fatal, but log it.
        }

        if (this.youtubeChatListener) {
          await this.youtubeChatListener.updateBroadcastId(broadcastId);
          console.log(`✅ YouTube Broadcast ID updated to: ${broadcastId}`);
          res.json({ success: true, message: 'YouTube Broadcast ID updated successfully.' });
        } else {
          res.status(503).json({ success: false, error: 'YouTube chat listener is not initialized.' });
        }
      } catch (error) {
        console.error('❌ Failed to update YouTube Broadcast ID:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Dashboard route (fallback)
    this.app.get('/', (req, res) => {
      res.sendFile(join(this.config.dashboardPath, 'index.html'));
    });
  }

  _setupAmbientRoutes() {
    this.app.use('/api/audio/ambient', ambientRoutes);
  }

  attachOrchestrator(orchestratorManager) {
    this.orchestratorManager = orchestratorManager;
  }

  attachStoryLoop(storyLoopManager) {
    this.storyLoopManager = storyLoopManager;
  }

  attachMCPClients(mcpClientManager) {
    this.mcpClientManager = mcpClientManager;
  }

  attachChatMessagePoster(chatMessagePoster) {
    this.chatMessagePoster = chatMessagePoster;
  }

  attachYouTubeChatListener(youtubeChatListener) {
    this.youtubeChatListener = youtubeChatListener;
  }

  /**
   * Setup YouTube Streaming API routes
   */


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
    // Chat message forwarding to dashboard
    this.eventBus.on('chat:message', (event) => {
      const payload = event.payload || event;
      this.broadcast('chat:message', payload);
    });

    // Story loop event forwarding to dashboard
    const storyLoopEvents = [
      'loop:genres_ready',
      'loop:voting_started',
      'loop:voting_complete',
      'loop:competition_started',
      'loop:judging_started',
      'loop:construction_started',
      'loop:batch_created',
      'loop:construction_completed',
      'loop:presentation_started',
      'loop:cleanup_started',
      'loop:cleanup_complete',
      'loop:phase_changed',
      'vote:received',
      'timer:countdown',
      'timer:started',
      'timer:complete',
      'voting:started',
      'voting:stopped',
      'voting:complete'
    ];

    storyLoopEvents.forEach(eventType => {
      this.eventBus.on(eventType, (event) => {
        const payload = event.payload || event;
        this.broadcast(eventType, payload);
      });
    });

    this._setupActivityLogForwarding();
  }

  _setupActivityLogForwarding() {
    this.eventBus.on('*', (eventType, event) => {
      // Avoid echoing dashboard-specific events
      if (eventType.startsWith('dashboard:')) return;

      const payload = event.payload || event;
      this.broadcast(DASHBOARD_EVENT_TYPES.ACTIVITY_LOG, {
        level: 'system', // Or derive from event type
        source: eventType,
        message: JSON.stringify(payload)
      });
    });
  }

  /**
   * Handle messages from WebSocket clients
   */
  _handleClientMessage(ws, data) {
    console.log('[WebServer] Received client message:', data.type, data);
    switch (data.type) {
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;

      case 'request:status':
        // Send current platform status to requester only
        ws.send(JSON.stringify({
          type: DASHBOARD_EVENT_TYPES.PLATFORM_STATUS,
          data: adaptPlatformStatus({
            clients: getDashboardSockets().size,
            uptime: process.uptime()
          }),
          timestamp: Date.now()
        }));
        break;

      case 'command':
        // Handle commands from the dashboard
        if (data.command === 'start_story_loop') {
          this._handleStartStoryLoop(ws);
          return;
        } else if (data.command === 'stop_story_loop') {
          this._handleStopStoryLoop(ws);
          return;
        } else {
          // Handle other dashboard commands
          this._handleDashboardCommand(ws, data);
        }
        break;

      default:
        if (this.config.enableLogging) {
          console.log('Unknown client message type:', data.type);
        }
    }
  }

  /**
   * Handle start story loop command
   */
  async _handleStartStoryLoop(ws) {
    if (!this.storyLoopManager) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Story loop manager not available',
        timestamp: Date.now()
      }));
      return;
    }

    try {
      console.log('▶️ Starting story loop via dashboard');
      await this.storyLoopManager.start();

      ws.send(JSON.stringify({
        type: 'story_loop:started',
        timestamp: Date.now()
      }));

      this.broadcast('story_loop:started', {
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Failed to start story loop:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Failed to start story loop: ${error.message}`,
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Handle stop story loop command
   */
  _handleStopStoryLoop(ws) {
    if (!this.storyLoopManager) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Story loop manager not available',
        timestamp: Date.now()
      }));
      return;
    }

    try {
      console.log('⏹️ Stopping story loop via dashboard');
      this.storyLoopManager.stop();

      ws.send(JSON.stringify({
        type: 'story_loop:stopped',
        timestamp: Date.now()
      }));

      this.broadcast('story_loop:stopped', {
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('❌ Failed to stop story loop:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: `Failed to stop story loop: ${error.message}`,
        timestamp: Date.now()
      }));
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
      console.log('[WebServer] Sending platform status:', JSON.stringify(platformStatus, null, 2));
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

    if (module === 'audio' && command === 'set_mode') {
      this._handleAudioModeChange(ws, commandData);
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

    // Handle local chat toggle
    if (settings.localChat !== undefined && this.youtubeChatListener) {
      if (settings.localChat) {
        this.youtubeChatListener.stop();
        console.log('▶️ YouTube Chat Listener stopped due to local chat activation.');
      } else {
        this.youtubeChatListener.start();
        console.log('▶️ YouTube Chat Listener started due to local chat deactivation.');
      }
    }

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
   * Handle audio mode change command
   */
  _handleAudioModeChange(ws, commandData = {}) {
    const { mode } = commandData;

    const validModes = ['story', 'commentary', 'mixed'];
    if (!validModes.includes(mode)) {
      console.warn('[WebServer] Ignoring invalid audio mode:', mode);
      ws.send(JSON.stringify({
        type: 'audio:mode_error',
        data: { mode, error: 'Invalid audio mode' },
        timestamp: Date.now()
      }));
      return;
    }

    this.currentSettings = {
      ...this.currentSettings,
      audioMode: mode
    };

    console.log(`[WebServer] Audio mode changed to ${mode}`);

    const broadcastMessage = {
      mode,
      timestamp: Date.now(),
      source: 'dashboard'
    };

    ws.send(JSON.stringify({
      type: DASHBOARD_EVENT_TYPES.AUDIO_MODE_UPDATED,
      data: { ...broadcastMessage, source: 'local' },
      timestamp: Date.now()
    }));

    this._broadcastExcept(ws, DASHBOARD_EVENT_TYPES.AUDIO_MODE_UPDATED, broadcastMessage);
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

    // Get story loop status
    const storyLoopStatus = this.storyLoopManager?.getStatus() || {
      phase: 'idle',
      iteration: 0
    };
    const isLoopRunning = storyLoopStatus.phase !== 'idle';

    return {
      agentsStarted: 3, // This should come from the agent manager
      agentsFailed: 0,
      startTime: Date.now(),
      uptime: process.uptime(),
      clients: getDashboardSockets().size,
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
      },
      storyLoop: {
        running: isLoopRunning,
        phase: storyLoopStatus.phase,
        iteration: storyLoopStatus.iteration
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
      clients: getDashboardSockets().size,
      uptime: this.isRunning ? process.uptime() : 0
    };
  }
}

export default WebServerService;
