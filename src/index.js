#!/usr/bin/env node

/**
 * Agent Adventures - Interactive Adventure Platform
 * Main application entry point
 */

import path from 'node:path';
import { pathToFileURL } from 'url';

import { EventBus } from './core/event-bus.js';
import { StoryState } from './core/story-state.js';
import { AgentManager } from './core/agent-manager.js';
import { CompetitionManager } from './core/competition-manager.js';
import { StoryLoopManager } from './core/story-loop-manager.js';
import { WebServerService } from './services/web-server.js';
import { MCPClientManager } from './services/mcp-clients/index.js';
import { OrchestratorManager } from './orchestrator/index.js';
import YouTubeChatListener from './services/youtube/youtube-chat-listener.js';
import { ChatMessagePoster } from './services/chat/chat-message-poster.js';
import { VoteCollector } from './services/voting/vote-collector.js';
import { VoteTimer } from './services/voting/vote-timer.js';

class AdventuresPlatform {
  constructor(config = {}) {
    this.config = {
      // Event bus configuration
      eventBus: {
        maxRetries: 3,
        retryDelay: 1000,
        timeout: 5000,
        enableLogging: true,
        ...config.eventBus
      },

      // Story state configuration
      storyState: {
        maxVersions: 100,
        persistenceInterval: 30000,
        enableChangeTracking: true,
        ...config.storyState
      },

      // Agent manager configuration
      agentManager: {
        agentDirectories: ['src/agents', 'plugins'],
        maxConcurrentLoads: 5,
        healthCheckInterval: 30000,
        autoDiscover: true,
        ...config.agentManager
      },

      // Web server configuration
      webServer: {
        port: 3001,
        enableLogging: true,
        ...config.webServer
      },

      // Platform configuration
      platform: {
        gracefulShutdownTimeout: 10000,
        ...config.platform
      },

      orchestrator: {
        configDirectory: path.resolve('src', 'config', 'orchestrator'),
        autoStart: process.env.START_SAMPLE_DAG === 'true',
        defaultAdventure: 'sample-adventure',
        enableLogging: true,
        enableMockHandlers: process.env.ORCHESTRATOR_MOCK_HANDLERS !== 'false',
        enableLlmResponder: process.env.ORCHESTRATOR_LLM_RESPONDER === 'true',
        enableMcpResponder:
          process.env.ORCHESTRATOR_MCP_RESPONDER === 'true'
          || (
            process.env.ORCHESTRATOR_MCP_RESPONDER !== 'false'
            && process.env.ORCHESTRATOR_MOCK_HANDLERS === 'false'
          ),
        enableAudioResponder:
          process.env.ORCHESTRATOR_AUDIO_RESPONDER === 'true'
          || (
            process.env.ORCHESTRATOR_AUDIO_RESPONDER !== 'false'
            && process.env.ORCHESTRATOR_MOCK_HANDLERS === 'false'
          ),
        ...config.orchestrator
      },

      storyLoop: {
        autoStart: process.env.STORY_LOOP_AUTO_START === 'true',
        voteDuration: Number.parseInt(process.env.STORY_LOOP_VOTE_DURATION || '30', 10),
        presentationDuration: Number.parseInt(process.env.STORY_LOOP_PRESENTATION_DURATION || '60', 10),
        cleanupCountdown: Number.parseInt(process.env.STORY_LOOP_CLEANUP_COUNTDOWN || '60', 10),
        ...config.storyLoop
      }
    };

    this.state = 'created';
    this.startTime = null;

    // Core components
    this.eventBus = null;
    this.storyState = null;
    this.agentManager = null;
    this.competitionManager = null;
    this.webServer = null;
    this.mcpClientManager = null;
    this.orchestratorManager = null;
    this.orchestratorMockHandlers = null;
    this.orchestratorLlmResponder = null;
    this.orchestratorMcpResponder = null;
    this.orchestratorAudioResponder = null;
    this.youtubeChatListener = null;
    this.chatMessagePoster = null;
    this.voteCollector = null;
    this.voteTimer = null;
    this.storyLoopManager = null;
  }

  /**
   * Initialize the platform
   */
  async initialize() {
    console.log('🚀 Initializing Agent Adventures Platform...');

    try {
      this.state = 'initializing';

      // Initialize core components
      await this._initializeCore();

      // Set up event handlers
      this._setupEventHandlers();

      // Set up shutdown handlers
      this._setupShutdownHandlers();

      this.state = 'initialized';
      console.log('✅ Platform initialized successfully');

      return { success: true };

    } catch (error) {
      this.state = 'error';
      console.error('❌ Platform initialization failed:', error);
      throw error;
    }
  }

  /**
   * Start the platform
   */
  async start() {
    if (this.state !== 'initialized') {
      throw new Error(`Cannot start platform from state: ${this.state}`);
    }

    console.log('🎬 Starting Agent Adventures Platform...');

    try {
      this.state = 'starting';
      this.startTime = Date.now();

      // Initialize web server
      await this.webServer.initialize();

      // Initialize agent manager and discover agents
      await this.agentManager.initialize();

      // Load all discovered agents
      const { results: loadResults, totalAgentsLoaded } = await this.agentManager.loadDiscoveredAgents();
      const successfulLoads = loadResults.filter(r => r.success).length;
      console.log(`📦 Loaded ${totalAgentsLoaded} agent instances from ${successfulLoads}/${loadResults.length} agent definitions`);

      // Start all discovered agents
      const agentResults = await this.agentManager.startAllAgents();
      const successfulAgents = agentResults.filter(r => r.success);

      console.log(`🤖 Started ${successfulAgents.length}/${agentResults.length} agents`);

      // Log any failed agents
      const failedAgents = agentResults.filter(r => !r.success);
      if (failedAgents.length > 0) {
        console.warn('⚠️ Some agents failed to start:');
        failedAgents.forEach(({ agentId, error }) => {
          console.warn(`   ${agentId}: ${error}`);
        });
      }

      this.state = 'running';

      // Emit platform events
      this.eventBus.emit('platform:started', {
        startTime: this.startTime,
        agentsStarted: successfulAgents.length,
        agentsFailed: failedAgents.length
      });

      console.log('✅ Agent Adventures Platform is now running!');
      console.log(`📊 System Status:`);
      console.log(`   - Event Bus: Active`);
      console.log(`   - Story State: Tracking changes`);
      console.log(`   - Web Server: ${this.webServer.getStatus().running ? 'Running' : 'Stopped'} (port ${this.webServer.config.port})`);
      console.log(`   - Agents: ${successfulAgents.length} running`);

      if (this.config.orchestrator.autoStart && this.orchestratorManager) {
        const adventureId = this.config.orchestrator.defaultAdventure;
        try {
          const { promise } = await this.orchestratorManager.startAdventure(adventureId);
          promise.catch((error) => {
            console.error(`⚠️ Orchestrated adventure ${adventureId} ended with error:`, error);
          });
          console.log(`🎯 Orchestrator auto-started adventure: ${adventureId}`);
        } catch (error) {
          console.error('⚠️ Failed to auto-start orchestrated adventure:', error);
        }
      }

      // Auto-start story loop if configured
      if (this.config.storyLoop.autoStart && this.storyLoopManager) {
        try {
          await this.storyLoopManager.start();
          console.log('🔄 Story loop auto-started');
        } catch (error) {
          console.error('⚠️ Failed to auto-start story loop:', error);
        }
      }

      return {
        success: true,
        agentsStarted: successfulAgents.length,
        agentsFailed: failedAgents.length,
        agentResults
      };

    } catch (error) {
      this.state = 'error';
      console.error('❌ Platform start failed:', error);
      throw error;
    }
  }

  /**
   * Stop the platform
   */
  async stop() {
    console.log('🛑 Stopping Agent Adventures Platform...');

    try {
      this.state = 'stopping';

      // Stop web server
      if (this.webServer) {
        await this.webServer.shutdown();
      }

      // Stop all agents
      if (this.agentManager) {
        await this.agentManager.stopAllAgents();
        await this.agentManager.shutdown();
      }

      if (this.orchestratorMockHandlers?.shutdown) {
        await this.orchestratorMockHandlers.shutdown();
      }

      if (this.orchestratorLlmResponder?.shutdown) {
        await this.orchestratorLlmResponder.shutdown();
      }

      if (this.orchestratorMcpResponder?.shutdown) {
        await this.orchestratorMcpResponder.shutdown();
      }

      if (this.orchestratorAudioResponder?.shutdown) {
        await this.orchestratorAudioResponder.shutdown();
      }

      // Stop story loop components
      if (this.storyLoopManager) {
        this.storyLoopManager.stop();
      }

      if (this.voteTimer) {
        this.voteTimer.destroy();
      }

      if (this.voteCollector) {
        this.voteCollector.destroy();
      }

      if (this.youtubeChatListener) {
        await this.youtubeChatListener.stop();
      }

      if (this.orchestratorManager) {
        await this.orchestratorManager.shutdown();
      }

      // Cleanup core components
      if (this.storyState) {
        this.storyState.destroy();
      }

      if (this.eventBus) {
        this.eventBus.reset();
      }

      this.state = 'stopped';

      console.log('✅ Platform stopped gracefully');
      return { success: true };

    } catch (error) {
      console.error('❌ Platform stop failed:', error);
      throw error;
    }
  }

  /**
   * Get platform status
   */
  getStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;

    return {
      state: this.state,
      uptime,
      startTime: this.startTime,
      components: {
        eventBus: this.eventBus ? this.eventBus.getMetrics() : null,
        storyState: this.storyState ? 'active' : null,
        agentManager: this.agentManager ? this.agentManager.getSystemHealth() : null
      }
    };
  }

  // ========== Private Methods ==========

  /**
   * Initialize core components
   */
  async _initializeCore() {
    console.log('⚙️ Initializing core components...');

    // Create event bus
    this.eventBus = new EventBus(this.config.eventBus);
    console.log('   ✓ Event Bus initialized');

    // Create story state
    this.storyState = new StoryState({}, this.config.storyState);
    console.log('   ✓ Story State initialized');

    // Initialize MCP clients
    this.mcpClientManager = new MCPClientManager({
      mockMode: process.env.MOCK_MCP_MODE === 'true',
      enableLogging: this.config.agentManager.enableLogging !== false
    });
    console.log('   ✓ MCP Client Manager initialized');

    // Create agent manager with dependencies including MCP clients
    const dependencies = {
      eventBus: this.eventBus,
      storyState: this.storyState,
      mcpClients: this.mcpClientManager.getAllClients(),
      config: this.config
    };

    this.agentManager = new AgentManager(dependencies);
    console.log('   ✓ Agent Manager initialized');

    // Create competition manager
    this.competitionManager = new CompetitionManager(this.eventBus, {
      proposalTimeout: 30000,
      judgeTimeout: 10000,
      mockMode: true
    });
    console.log('   ✓ Competition Manager initialized');

    // Create web server with event bus integration
    this.webServer = new WebServerService(this.eventBus, this.config.webServer);
    console.log('   ✓ Web Server initialized');

    this.orchestratorManager = new OrchestratorManager({
      eventBus: this.eventBus,
      storyState: this.storyState,
      configDirectory: this.config.orchestrator.configDirectory,
      mcpClients: this.mcpClientManager,
      logger: this.config.orchestrator.enableLogging === false
        ? {
            info: () => {},
            log: () => {},
            error: (...args) => console.error(...args)
          }
        : console
    });
    console.log('   ✓ Orchestrator Manager initialized');

    this.webServer?.attachOrchestrator?.(this.orchestratorManager);
    if (this.config.orchestrator?.defaultAdventure) {
      this.webServer.config.defaultAdventure = this.config.orchestrator.defaultAdventure;
    }

    if (this.config.orchestrator.enableMockHandlers) {
      const { OrchestratorMockHandlers } = await import('./services/orchestrator/mock-handlers.js');
      this.orchestratorMockHandlers = new OrchestratorMockHandlers({
        eventBus: this.eventBus
      });
      console.log('   ✓ Orchestrator mock handlers attached');
    }

    if (this.config.orchestrator.enableLlmResponder) {
      const { OrchestratorLLMResponder } = await import('./services/orchestrator/llm-responder.js');
      this.orchestratorLlmResponder = new OrchestratorLLMResponder({
        eventBus: this.eventBus
      });
      console.log('   ✓ Orchestrator LLM responder attached');
    }

    if (this.config.orchestrator.enableMcpResponder) {
      const { OrchestratorMCPResponder } = await import('./services/orchestrator/mcp-responder.js');
      const responderLogger = this.config.orchestrator.enableLogging === false
        ? { info: () => {}, warn: () => {}, error: (...args) => console.error(...args) }
        : console;
      this.orchestratorMcpResponder = new OrchestratorMCPResponder({
        eventBus: this.eventBus,
        mcpClients: this.mcpClientManager,
        logger: responderLogger
      });
      console.log('   ✓ Orchestrator MCP responder attached');
    }

    if (this.config.orchestrator.enableAudioResponder) {
      const { OrchestratorAudioResponder } = await import('./services/orchestrator/audio-responder.js');
      const responderLogger = this.config.orchestrator.enableLogging === false
        ? { info: () => {}, warn: () => {}, error: (...args) => console.error(...args) }
        : console;
      this.orchestratorAudioResponder = new OrchestratorAudioResponder({
        eventBus: this.eventBus,
        logger: responderLogger
      });
      console.log('   ✓ Orchestrator audio responder attached');
    }

    const chatApiKey = process.env.YOUTUBE_API_KEY;
    const chatBroadcastId = process.env.YOUTUBE_LIVE_BROADCAST_ID;
    const oauthTokenPath = process.env.YOUTUBE_OAUTH_TOKEN_PATH;
    if ((chatApiKey || oauthTokenPath) && chatBroadcastId) {
      try {
        const defaultInterval = Number.parseInt(process.env.YOUTUBE_CHAT_POLL_INTERVAL_MS || '5000', 10);
        this.youtubeChatListener = new YouTubeChatListener({
          eventBus: this.eventBus,
          apiKey: chatApiKey,
          oauthTokenPath,
          broadcastId: chatBroadcastId,
          pollIntervalMs: Number.isNaN(defaultInterval) ? 5000 : defaultInterval
        });
        await this.youtubeChatListener.start();
        console.log('   ✓ YouTube chat listener initialized');
      } catch (error) {
        console.error('   ⚠️ YouTube chat listener failed to initialize:', error.message);
        console.log('   ℹ️ Story loop will be disabled (requires YouTube chat)');
        this.youtubeChatListener = null;
      }

      // Initialize story loop components (requires YouTube chat)
      // Chat message poster requires liveChatId from listener
      const liveChatId = this.youtubeChatListener?.liveChatId;
      if (this.youtubeChatListener && liveChatId) {
        this.chatMessagePoster = new ChatMessagePoster({
          apiKey: chatApiKey,
          oauthTokenPath,
          liveChatId
        });
        console.log('   ✓ Chat message poster initialized');

        // Initialize voting components
        const selfTestChannelId = process.env.YOUTUBE_CHANNEL_ID || null;
        this.voteCollector = new VoteCollector({
          eventBus: this.eventBus,
          selfTestChannelId
        });
        if (selfTestChannelId) {
          console.log('   ✓ Vote collector initialized (self-test mode enabled)');
        } else {
          console.log('   ✓ Vote collector initialized');
        }

        this.voteTimer = new VoteTimer({
          eventBus: this.eventBus,
          duration: this.config.storyLoop.voteDuration,
          suppressNotifications: !!selfTestChannelId // Suppress in self-test mode
        });
        console.log(`   ✓ Vote timer initialized${selfTestChannelId ? ' (self-test mode - notifications suppressed)' : ''}`);

        // Initialize story loop manager
        this.storyLoopManager = new StoryLoopManager({
          eventBus: this.eventBus,
          storyState: this.storyState,
          mcpClients: this.mcpClientManager,
          chatPoster: this.chatMessagePoster,
          voteCollector: this.voteCollector,
          voteTimer: this.voteTimer
        });
        console.log('   ✓ Story loop manager initialized');
      }
    } else {
      console.log('   ℹ️ YouTube chat listener disabled (missing YOUTUBE_API_KEY or YOUTUBE_LIVE_BROADCAST_ID)');
      console.log('   ℹ️ Story loop disabled (requires YouTube chat)');
    }
  }

  /**
   * Set up event handlers
   */
  _setupEventHandlers() {
    // Platform-level event handling
    this.eventBus.subscribe('platform:error', (event) => {
      console.error('Platform error:', event.payload);
    });

    this.eventBus.subscribe('agent:error', (event) => {
      console.error(`Agent error [${event.payload.agentId}]:`, event.payload.error);
    });

    // Story state change logging (debug)
    if (this.config.storyState.enableLogging) {
      this.storyState.on('state:changed', (change) => {
        console.log(`📝 State changed: ${change.path} =`, change.newValue);
      });
    }

    this.eventBus.subscribe('chat:selection', (event) => {
      const payload = event.payload;
      if (!payload || typeof payload.choice !== 'number') {
        return;
      }

      console.log('🗳️ Chat selection received:', payload);

      this.storyState.updateState('audience.pending_votes', (current = []) => {
        const entry = {
          platform: payload.platform || 'youtube',
          choice: payload.choice,
          author: payload.author || 'unknown',
          messageId: payload.messageId || null,
          receivedAt: payload.publishedAt || new Date().toISOString()
        };

        const next = Array.isArray(current) ? [...current, entry] : [entry];
        if (next.length > 100) {
          next.splice(0, next.length - 100);
        }
        return next;
      }, { source: 'chat-selection' });
    });

    console.log('   ✓ Event handlers set up');
  }

  /**
   * Set up graceful shutdown handlers
   */
  _setupShutdownHandlers() {
    const gracefulShutdown = async (signal) => {
      console.log(`\n🔄 Received ${signal}, shutting down gracefully...`);

      try {
        // Set timeout for forced shutdown
        const forceTimeout = setTimeout(() => {
          console.log('⏰ Shutdown timeout reached, forcing exit');
          process.exit(1);
        }, this.config.platform.gracefulShutdownTimeout);

        await this.stop();
        clearTimeout(forceTimeout);

        console.log('👋 Goodbye!');
        process.exit(0);

      } catch (error) {
        console.error('❌ Shutdown failed:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('💥 Uncaught exception:', error);
      gracefulShutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('💥 Unhandled rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });

    console.log('   ✓ Shutdown handlers set up');
  }
}

// ========== Main Application ==========

async function main() {
  try {
    // Create and initialize platform
    const platform = new AdventuresPlatform();

    await platform.initialize();
    await platform.start();

    // Keep the process running
    process.stdin.resume();

  } catch (error) {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  }
}

// Run if this is the main module
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

export { AdventuresPlatform };
export default AdventuresPlatform;
