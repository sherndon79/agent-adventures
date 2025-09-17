/**
 * Core Dashboard Controller for Agent Adventures
 * Manages overall dashboard state, WebSocket connection, and module coordination
 */

const DASHBOARD_EVENT_TYPES = Object.freeze({
  PLATFORM_STARTED: 'platform_started',
  PLATFORM_STATUS: 'platform_status',
  SYSTEM_HEALTH: 'system_health',
  METRICS_UPDATE: 'metrics_update',
  STREAM_STATUS: 'stream_status',
  AGENT_PROPOSAL: 'agent_proposal',
  JUDGE_DECISION: 'judge_decision',
  COMPETITION_STARTED: 'competition_started',
  COMPETITION_VOTING: 'competition_voting',
  COMPETITION_COMPLETED: 'competition_completed',
  SETTINGS_UPDATED: 'settings_updated',
  ACTIVITY_LOG: 'activity_log'
});

class AgentAdventuresDashboard {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.modules = {};
    this.config = {
      wsUrl: 'ws://localhost:3001',
      reconnectInterval: 5000,
      maxReconnectAttempts: 10
    };

    this.reconnectAttempts = 0;
    this.systemData = {
      agents: {
        claude: { status: 'inactive', proposals: 0, wins: 0 },
        gemini: { status: 'inactive', proposals: 0, wins: 0 },
        gpt: { status: 'inactive', proposals: 0, wins: 0 }
      },
      metrics: {
        totalTokens: 0,
        totalCost: 0,
        competitions: 0,
        avgResponseTime: 0
      },
      system: {
        health: 'unknown',
        streaming: false,
        isaacSim: 'disconnected'
      }
    };

    this.activeCompetition = null;
    this.messageHandlers = {};
    this.seenCompetitionBatches = new Set();

    this.init();
  }

  async init() {
    console.log('🚀 Initializing Agent Adventures Dashboard...');

    // Initialize UI components
    this.initializeUI();

    // Initialize modules
    this.initializeModules();

    // Register message handlers after modules are ready
    this.messageHandlers = this._createMessageHandlers();

    // Start WebSocket connection
    this.connectWebSocket();

    // Start periodic updates
    this.startPeriodicUpdates();

    console.log('✅ Dashboard initialized successfully');
  }

  initializeUI() {
    // Update system time
    this.updateSystemTime();
    setInterval(() => this.updateSystemTime(), 1000);

    // Set initial connection status
    this.updateConnectionStatus('connecting');

    // Bind event listeners
    this.bindEventListeners();
  }

  bindEventListeners() {
    // Stream controls
    document.getElementById('start-stream')?.addEventListener('click', () => {
      this.sendCommand('streaming', 'start');
    });

    document.getElementById('stop-stream')?.addEventListener('click', () => {
      this.sendCommand('streaming', 'stop');
    });

    // Competition controls
    document.getElementById('start-competition')?.addEventListener('click', () => {
      const type = document.getElementById('competition-type')?.value || 'asset_placement';
      this.startCompetition(type);
    });

    // Metrics controls
    document.getElementById('reset-metrics')?.addEventListener('click', () => {
      this.resetMetrics();
    });

    // Log controls
    document.getElementById('clear-log')?.addEventListener('click', () => {
      this.modules.activityLog?.clearLog();
    });

    // Settings controls
    document.getElementById('settings-toggle')?.addEventListener('click', () => {
      this.showSettings();
    });

    document.getElementById('close-settings')?.addEventListener('click', () => {
      this.hideSettings();
    });

    document.getElementById('apply-settings')?.addEventListener('click', () => {
      this.applySettings();
    });

    document.getElementById('reset-settings')?.addEventListener('click', () => {
      this.resetSettings();
    });
  }

  initializeModules() {
    try {
      // Initialize all dashboard modules
      this.modules.streamViewer = new StreamViewer(this);
      this.modules.agentCompetition = new AgentCompetition(this);
      this.modules.metricsTracker = new MetricsTracker(this);
      this.modules.systemHealth = new SystemHealth(this);
      this.modules.activityLog = new ActivityLog(this);

      console.log('✅ All dashboard modules initialized');
    } catch (error) {
      console.error('❌ Module initialization failed:', error);
      this.logActivity('error', 'SYSTEM', `Module initialization failed: ${error.message}`);
    }
  }

  _createMessageHandlers() {
    const handler = (fn) => (data, raw) => fn.call(this, data, raw);

    return {
      [DASHBOARD_EVENT_TYPES.PLATFORM_STARTED]: handler(this.handlePlatformStarted),
      [DASHBOARD_EVENT_TYPES.PLATFORM_STATUS]: handler(this.handlePlatformStarted),
      [DASHBOARD_EVENT_TYPES.SYSTEM_HEALTH]: handler(this.handleSystemUpdate),
      [DASHBOARD_EVENT_TYPES.METRICS_UPDATE]: (data) => {
        this.modules.metricsTracker?.updateMetrics(data);
      },
      [DASHBOARD_EVENT_TYPES.STREAM_STATUS]: (data) => {
        this.modules.streamViewer?.updateStreamStatus(data);
      },
      [DASHBOARD_EVENT_TYPES.AGENT_PROPOSAL]: handler(this.onAgentProposal),
      [DASHBOARD_EVENT_TYPES.JUDGE_DECISION]: handler(this.onJudgeDecision),
      [DASHBOARD_EVENT_TYPES.COMPETITION_STARTED]: handler(this.onCompetitionStarted),
      [DASHBOARD_EVENT_TYPES.COMPETITION_VOTING]: handler(this.onCompetitionVoting),
      [DASHBOARD_EVENT_TYPES.COMPETITION_COMPLETED]: handler(this.onCompetitionCompleted),
      [DASHBOARD_EVENT_TYPES.SETTINGS_UPDATED]: handler(this.onSettingsUpdated),
      [DASHBOARD_EVENT_TYPES.ACTIVITY_LOG]: (data) => {
        if (data && data.level && data.source && data.message) {
          this.logActivity(data.level, data.source, data.message);
        }
      },
      // Backwards compatibility with legacy event names
      'platform:started': handler(this.handlePlatformStarted),
      'platform:status': handler(this.handlePlatformStarted),
      'agent:proposal': handler(this.onAgentProposal),
      'proposal:decision_made': handler(this.onJudgeDecision),
      'competition:started': handler(this.onCompetitionStarted),
      'settings:updated': handler(this.onSettingsUpdated),
      'system:metrics': (data) => {
        this.modules.metricsTracker?.updateMetrics(data);
      },
      'stream:status': (data) => {
        this.modules.streamViewer?.updateStreamStatus(data);
      }
    };
  }

  connectWebSocket() {
    try {
      console.log(`🔌 Connecting to WebSocket: ${this.config.wsUrl}`);

      // Connect to real WebSocket server
      this.socket = new WebSocket(this.config.wsUrl);
      this.socket.onopen = () => this.onSocketOpen();
      this.socket.onmessage = (event) => this.onSocketMessage(event);
      this.socket.onclose = () => this.onSocketClose();
      this.socket.onerror = (error) => this.onSocketError(error);

    } catch (error) {
      console.error('❌ WebSocket connection failed:', error);
      this.scheduleReconnect();
    }
  }

  simulateConnection() {
    // Simulate successful connection for development
    setTimeout(() => {
      this.connected = true;
      this.updateConnectionStatus('online');
      this.logActivity('system', 'WEBSOCKET', 'Connected to backend (simulated)');

      // Simulate periodic data updates
      this.startSimulatedUpdates();
    }, 2000);
  }

  startSimulatedUpdates() {
    // Simulate periodic system updates for development
    setInterval(() => {
      this.simulateSystemUpdate();
    }, 5000);

    setInterval(() => {
      this.simulateMetricsUpdate();
    }, 10000);
  }

  simulateSystemUpdate() {
    const update = {
      type: 'system_health',
      data: {
        cpu: Math.random() * 30 + 10, // 10-40%
        memory: Math.random() * 200 + 50, // 50-250 MB
        eventQueue: Math.floor(Math.random() * 10),
        services: {
          eventBus: 'healthy',
          agents: Math.random() > 0.8 ? 'inactive' : 'healthy',
          streaming: this.systemData.system.streaming ? 'healthy' : 'inactive'
        }
      }
    };

    this.handleSystemUpdate(update.data);
  }

  simulateMetricsUpdate() {
    // Simulate token usage growth
    this.systemData.metrics.totalTokens += Math.floor(Math.random() * 100 + 50);
    this.systemData.metrics.totalCost = this.systemData.metrics.totalTokens * 0.001;
    this.systemData.metrics.avgResponseTime = Math.floor(Math.random() * 1000 + 500);

    this.modules.metricsTracker?.updateMetrics(this.systemData.metrics);
  }

  onSocketOpen() {
    console.log('✅ WebSocket connected');
    this.connected = true;
    this.reconnectAttempts = 0;
    this.updateConnectionStatus('online');
    this.logActivity('system', 'WEBSOCKET', 'Connected to backend');

    // Request initial data
    this.sendCommand('system', 'get_status');
  }

  onSocketMessage(event) {
    try {
      const message = JSON.parse(event.data);
      this.handleMessage(message);
    } catch (error) {
      console.error('❌ Failed to parse WebSocket message:', error);
    }
  }

  onSocketClose() {
    console.log('🔌 WebSocket disconnected');
    this.connected = false;
    this.updateConnectionStatus('offline');
    this.logActivity('system', 'WEBSOCKET', 'Disconnected from backend');
    this.scheduleReconnect();
  }

  onSocketError(error) {
    console.error('❌ WebSocket error:', error);
    const errorMessage = error?.message || error?.type || 'Unknown WebSocket error';
    this.logActivity('error', 'WEBSOCKET', `Connection error: ${errorMessage}`);
  }

  handleMessage(message) {
    const handler = this.messageHandlers?.[message.type];
    if (handler) {
      handler(message.data, message);
      return;
    }

    console.log('📨 Unknown message type:', message.type);
  }

  handlePlatformStarted(data) {
    console.log('🚀 Platform started with data:', data);

    // Update agent status from platform startup data
    const agentsStarted = data.agentsStarted || 0;
    const agentsFailed = data.agentsFailed || 0;

    // Set all agents to active if they started successfully
    if (agentsStarted > 0) {
      const agentNames = ['claude', 'gemini', 'gpt'];
      for (let i = 0; i < Math.min(agentsStarted, agentNames.length); i++) {
        this.systemData.agents[agentNames[i]].status = 'active';
      }
    }

    // Update system services from backend data
    if (data.services) {
      this.updateSystemServices(data.services);
    }

    // Update Isaac Sim status if provided
    if (data.isaacSim) {
      this.updateIsaacSimStatus(data.isaacSim);
    }

    // Log the event
    this.logActivity('system', 'PLATFORM',
      `Platform started: ${agentsStarted} agents running, ${agentsFailed} failed`);

    // Update modules
    this.modules.systemHealth?.updateServiceStatuses();
    this.modules.agentCompetition?.updateAgentStats(this.systemData.agents);
  }

  updateSystemServices(services) {
    // Update system health module with real service status
    if (this.modules.systemHealth) {
      Object.keys(services).forEach(serviceName => {
        this.modules.systemHealth.setServiceStatus(serviceName, services[serviceName]);
      });
    }
  }

  updateIsaacSimStatus(isaacSimData) {
    const { connected, mockMode } = isaacSimData;

    if (mockMode) {
      this.logActivity('system', 'ISAAC_SIM', 'Running in Mock Mode');
    } else if (connected) {
      this.logActivity('system', 'ISAAC_SIM', 'Connected via MCP');
    } else {
      this.logActivity('system', 'ISAAC_SIM', 'Disconnected');
    }

    // Update system data
    this.systemData.system.isaacSim = connected ? 'connected' : (mockMode ? 'mock' : 'disconnected');
  }

  handleSystemUpdate(data) {
    if (this.modules.systemHealth) {
      this.modules.systemHealth.updateHealth(data);
    }
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      this.updateConnectionStatus('offline');
      return;
    }

    this.reconnectAttempts++;
    this.updateConnectionStatus('connecting');

    console.log(`🔄 Scheduling reconnect attempt ${this.reconnectAttempts}/${this.config.maxReconnectAttempts} in ${this.config.reconnectInterval}ms`);

    setTimeout(() => {
      this.connectWebSocket();
    }, this.config.reconnectInterval);
  }

  sendCommand(module, command, data = {}) {
    if (!this.connected && !this.isSimulatedMode()) {
      console.warn('⚠️ Cannot send command: not connected to backend');
      this.logActivity('warning', 'COMMAND', `Failed to send ${module}.${command}: not connected`);
      return;
    }

    const message = {
      type: 'command',
      module,
      command,
      data,
      timestamp: Date.now()
    };

    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      // Handle simulated commands
      this.handleSimulatedCommand(module, command, data);
    }

    this.logActivity('system', 'COMMAND', `Sent ${module}.${command}`);
  }

  handleSimulatedCommand(module, command, data) {
    // Simulate command responses for development
    setTimeout(() => {
      const commandKey = `${module}.${command}`;
      switch (commandKey) {
        case 'streaming.start':
          this.systemData.system.streaming = true;
          this.modules.streamViewer?.updateStreamStatus({ active: true, quality: 'good', latency: 150 });
          this.logActivity('system', 'STREAM', 'Stream started (simulated)');
          break;
        case 'streaming.stop':
          this.systemData.system.streaming = false;
          this.modules.streamViewer?.updateStreamStatus({ active: false });
          this.logActivity('system', 'STREAM', 'Stream stopped');
          break;
        case 'competition.start':
        case 'agents.start_competition':
          this.onCompetitionStarted({
            type: data.type,
            batchId: `sim_${data.type || 'competition'}_${Date.now()}`,
            simulated: true
          });
          this.simulateCompetitionWorkflow(data.type,
            { batchId: this.activeCompetition?.batchId });
          break;
      }
    }, 500);
  }

  startCompetition(type) {
    this.logActivity('competition', 'SYSTEM', `Starting ${type} competition`);
    this.sendCommand('competition', 'start', { type });
  }

  _normalizeAgentId(agentId = '') {
    if (this.systemData.agents[agentId]) return agentId;
    const shorthand = agentId.split('-')[0];
    return this.systemData.agents[shorthand] ? shorthand : agentId;
  }

  onCompetitionStarted(data = {}) {
    const { type, batchId, simulated = false } = data;
    if (!batchId || !type) return;

    this.activeCompetition = { type, batchId, simulated };

    if (!this.seenCompetitionBatches.has(batchId)) {
      this.seenCompetitionBatches.add(batchId);
      this.systemData.metrics.competitions += 1;
      this.modules.metricsTracker?.updateMetrics(this.systemData.metrics);
    }

    this.modules.agentCompetition?.startCompetition(type, {
      batchId,
      simulated
    });
  }

  onAgentProposal(proposal = {}) {
    const agentId = proposal.agentId || proposal.agent;
    if (!agentId) return;

    const normalizedAgent = this._normalizeAgentId(agentId);
    const agentData = this.systemData.agents[normalizedAgent];
    if (agentData) {
      agentData.proposals = (agentData.proposals || 0) + 1;
    }

    const enrichedProposal = {
      ...proposal,
      agentId,
      agent: normalizedAgent,
      proposalType: proposal.proposalType,
      reasoning: proposal.reasoning || proposal.summary || '',
      summary: proposal.summary || proposal.reasoning || ''
    };

    this.modules.agentCompetition?.handleAgentProposal(enrichedProposal);
    this.modules.agentCompetition?.updateAgentStats(this.systemData.agents);
  }

  onJudgeDecision(decision = {}) {
    const normalizedWinner = this._normalizeAgentId(decision.winner);

    const agentData = this.systemData.agents[normalizedWinner];
    if (agentData) {
      agentData.wins = (agentData.wins || 0) + 1;
    }

    const enrichedDecision = {
      ...decision,
      winner: normalizedWinner
    };

    this.modules.agentCompetition?.handleJudgeDecision(enrichedDecision);
    this.modules.agentCompetition?.updateAgentStats(this.systemData.agents);
  }

  onCompetitionVoting(payload = {}) {
    if (typeof this.modules.agentCompetition?.handleVotingResult === 'function') {
      this.modules.agentCompetition.handleVotingResult(payload);
    }
  }

  onCompetitionCompleted(payload = {}) {
    if (typeof this.modules.agentCompetition?.completeCompetition === 'function') {
      this.modules.agentCompetition.completeCompetition(payload);
    }
    this.activeCompetition = null;
  }

  onSettingsUpdated(settings = {}) {
    this.currentSettings = {
      ...this.currentSettings,
      ...settings
    };

    try {
      localStorage.setItem('agent-adventures-settings', JSON.stringify(this.currentSettings));
    } catch (error) {
      console.warn('Failed to persist settings:', error);
    }

    this.loadCurrentSettings();

    this.logActivity('system', 'SETTINGS',
      `Updated: LLM=${this.currentSettings.llmApis}, MCP=${this.currentSettings.mcpCalls}, Stream=${this.currentSettings.streaming}, Judge=${this.currentSettings.judgePanel}`);
  }

  simulateCompetitionWorkflow(type, options = {}) {
    const batchId = options.batchId || this.activeCompetition?.batchId || `sim_${type}_${Date.now()}`;

    // Simulate agent proposals arriving over time
    setTimeout(() => {
      this.simulateAgentProposals(type, batchId);
    }, 500);

    // Simulate voting updates
    setTimeout(() => {
      this.simulateMockVoting(batchId);
    }, 2500);

    // Simulate final judge decision shortly after voting
    setTimeout(() => {
      this.simulateJudgeDecision(batchId);
    }, 5000);
  }

  simulateAgentProposals(type, batchId) {
    const templates = this.getProposalsForType(type);

    templates.forEach((template, index) => {
      setTimeout(() => {
        this.onAgentProposal({
          batchId,
          agentId: template.agent,
          proposalType: type,
          reasoning: template.reasoning,
          summary: template.summary,
          timestamp: Date.now()
        });
        this.logActivity('competition', template.agent.toUpperCase(),
          `Submitted ${type} proposal: "${template.summary}"`);
      }, index * 600);
    });
  }

  simulateMockVoting(batchId) {
    this.logActivity('competition', 'SYSTEM', 'Audience voting begins! (simulated)');

    const totalVotes = Math.floor(Math.random() * 200) + 100; // 100-300 votes
    const votingDuration = 30000; // 30 seconds

    let votesReceived = 0;
    const voteInterval = setInterval(() => {
      if (votesReceived >= totalVotes) {
        clearInterval(voteInterval);
        this.finalizeMockVoting(batchId, totalVotes);
        return;
      }

      const batchSize = Math.floor(Math.random() * 10) + 5;
      votesReceived += batchSize;

      this.updateMockVoteDisplay(Math.min(votesReceived, totalVotes), totalVotes);

    }, 1000);

    // Emit an initial voting snapshot
    this.onCompetitionVoting({
      batchId,
      totalVotes,
      voteBreakdown: {
        claude: Math.floor(totalVotes * 0.33),
        gemini: Math.floor(totalVotes * 0.33),
        gpt: Math.floor(totalVotes * 0.34)
      },
      method: 'mock_audience_voting',
      timestamp: Date.now()
    });
  }

  simulateJudgeDecision(batchId) {
    const competition = this.activeCompetition && this.activeCompetition.batchId === batchId
      ? this.activeCompetition
      : null;

    const type = competition?.type || 'asset_placement';
    const agents = ['claude', 'gemini', 'gpt'];
    const winner = competition?.votingWinner || agents[Math.floor(Math.random() * agents.length)];

    const reasoning = {
      claude: 'Technical excellence with comprehensive spatial analysis and safety considerations',
      gemini: 'Bold visual impact creating maximum engagement and dramatic composition',
      gpt: 'Optimal balance of story advancement and audience accessibility'
    };

    const decision = {
      batchId,
      winner,
      reasoning: reasoning[winner],
      confidence: 'high',
      timestamp: Date.now()
    };

    this.onJudgeDecision(decision);
    this.logActivity('competition', 'JUDGE', `${winner} wins: ${decision.reasoning}`);

    setTimeout(() => {
      this.simulateWinnerExecution(winner, type);
    }, 2000);
  }

  resetMetrics() {
    this.systemData.metrics = {
      totalTokens: 0,
      totalCost: 0,
      competitions: 0,
      avgResponseTime: 0
    };

    Object.keys(this.systemData.agents).forEach(agent => {
      this.systemData.agents[agent].proposals = 0;
      this.systemData.agents[agent].wins = 0;
    });

    this.modules.metricsTracker?.updateMetrics(this.systemData.metrics);
    this.modules.agentCompetition?.updateAgentStats(this.systemData.agents);

    this.logActivity('system', 'METRICS', 'Metrics reset');
  }

  startPeriodicUpdates() {
    // Update various dashboard elements periodically
    setInterval(() => {
      this.updateSystemTime();
    }, 1000);
  }

  updateSystemTime() {
    const timeElement = document.getElementById('system-time');
    if (timeElement) {
      const now = new Date();
      timeElement.textContent = now.toLocaleTimeString();
    }
  }

  updateConnectionStatus(status) {
    const statusElement = document.getElementById('connection-status');
    if (!statusElement) return;

    const indicator = statusElement.querySelector('.status-indicator');
    const text = statusElement.querySelector('span');

    // Update indicator
    indicator.className = `status-indicator ${status}`;

    // Update text
    const statusText = {
      online: 'Connected',
      offline: 'Disconnected',
      connecting: 'Connecting...'
    };

    if (text) {
      text.textContent = statusText[status] || 'Unknown';
    }
  }

  logActivity(level, source, message) {
    if (this.modules.activityLog) {
      this.modules.activityLog.addEntry(level, source, message);
    }
  }

  isSimulatedMode() {
    return !this.socket || this.socket.readyState !== WebSocket.OPEN;
  }

  updateMockVoteDisplay(current, total) {
    // Simulate realistic vote distribution
    const claudeVotes = Math.floor(current * (0.3 + Math.random() * 0.4));
    const geminiVotes = Math.floor(current * (0.25 + Math.random() * 0.35));
    const gptVotes = current - claudeVotes - geminiVotes;

    this.logActivity('competition', 'VOTES',
      `Claude: ${claudeVotes}, Gemini: ${geminiVotes}, GPT: ${gptVotes} (${current}/${total} votes)`);
  }

  finalizeMockVoting(batchId, totalVotes) {
    // Determine winner with realistic distribution
    const agents = ['claude', 'gemini', 'gpt'];
    const weights = [0.35, 0.32, 0.33]; // Slightly favor Claude
    const random = Math.random();

    let winner;
    let cumulative = 0;
    for (let i = 0; i < agents.length; i++) {
      cumulative += weights[i];
      if (random < cumulative) {
        winner = agents[i];
        break;
      }
    }

    // Calculate final vote percentages
    const votes = {
      claude: Math.floor(totalVotes * (0.30 + Math.random() * 0.25)),
      gemini: Math.floor(totalVotes * (0.25 + Math.random() * 0.25)),
    };
    votes.gpt = totalVotes - votes.claude - votes.gemini;

    // Ensure winner actually has most votes
    const maxVotes = Math.max(votes.claude, votes.gemini, votes.gpt);
    votes[winner] = maxVotes + Math.floor(Math.random() * 20) + 1;

    const winPercentage = Math.round((votes[winner] / totalVotes) * 100);

    this.logActivity('competition', 'RESULTS',
      `🏆 ${winner.toUpperCase()} leads audience voting with ${votes[winner]} votes (${winPercentage}%)`);

    this.logActivity('competition', 'RESULTS',
      `Final: Claude ${votes.claude}, Gemini ${votes.gemini}, GPT ${votes.gpt}`);

    this.onCompetitionVoting({
      batchId,
      winningAgentId: winner,
      totalVotes,
      voteBreakdown: votes,
      method: 'mock_audience_voting',
      timestamp: Date.now()
    });

    if (this.activeCompetition && this.activeCompetition.batchId === batchId) {
      this.activeCompetition.votingWinner = winner;
    }

    return winner;
  }

  simulateWinnerExecution(winner, type) {
    this.logActivity('competition', winner.toUpperCase(),
      `Executing ${type} commands in Isaac Sim...`);

    const settings = this.getStoredSettings();

    if (settings.mcpCalls && type === 'asset_placement') {
      // Use real worldbuilder MCP calls
      this.executeRealAssetPlacement(winner, type);
    } else {
      // Simulate MCP calls
      setTimeout(() => {
        this.logActivity('isaac-sim', 'MCP',
          `${winner} successfully executed ${type} via MCP (simulated)`);

        this.logActivity('competition', 'SYSTEM',
          `Competition complete! Next round starts in 5 minutes.`);
      }, 3000);
    }
  }

  async executeRealAssetPlacement(winner, type) {
    try {
      // Step 1: Clear the scene first
      this.logActivity('isaac-sim', 'MCP',
        `Clearing scene before ${winner} placement...`);

      const clearResponse = await fetch('/api/mcp/worldbuilder/clear_scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '/World',
          confirm: true
        })
      });

      if (clearResponse.ok) {
        this.logActivity('isaac-sim', 'MCP',
          `✓ Scene cleared successfully`);
      } else {
        this.logActivity('isaac-sim', 'WARN',
          `Scene clear failed: ${clearResponse.statusText}`);
      }

      // Step 2: Get winner's asset placement configuration
      const assetConfig = this.getAssetPlacementConfig(winner);

      this.logActivity('isaac-sim', 'MCP',
        `Calling worldbuilder MCP for ${winner}...`);

      if (assetConfig.useBatch) {
        // Use batch creation for multiple related assets
        const response = await fetch('/api/mcp/worldbuilder/create_batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_name: assetConfig.batch_name,
            elements: assetConfig.elements,
            parent_path: assetConfig.parent_path || '/World'
          })
        });

        if (response.ok) {
          const result = await response.json();
          this.logActivity('isaac-sim', 'MCP',
            `✓ Batch created: ${assetConfig.batch_name} with ${assetConfig.elements.length} elements`);
        } else {
          throw new Error(`Batch creation failed: ${response.statusText}`);
        }
      } else {
        // Use individual USD asset placement
        const response = await fetch('/api/mcp/worldbuilder/place_asset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: assetConfig.name,
            asset_path: assetConfig.asset_path,
            position: assetConfig.position,
            rotation: assetConfig.rotation || [0, 0, 0],
            scale: assetConfig.scale || [1, 1, 1]
          })
        });

        if (response.ok) {
          const result = await response.json();
          this.logActivity('isaac-sim', 'MCP',
            `✓ Asset placed: ${assetConfig.name} at [${assetConfig.position.join(', ')}]`);
        } else {
          throw new Error(`Asset placement failed: ${response.statusText}`);
        }
      }

      this.logActivity('competition', 'SYSTEM',
        `Competition complete! Next round starts in 5 minutes.`);

    } catch (error) {
      this.logActivity('isaac-sim', 'ERROR',
        `MCP call failed: ${error.message}`);

      // Fall back to simulation
      this.logActivity('isaac-sim', 'MCP',
        `Falling back to simulation mode...`);

      setTimeout(() => {
        this.logActivity('competition', 'SYSTEM',
          `Competition complete! Next round starts in 5 minutes.`);
      }, 1000);
    }
  }

  getAssetPlacementConfig(winner) {
    // Define asset configurations testing both batch creation and USD placement
    const configs = {
      claude: {
        // Test individual USD asset placement
        useBatch: false,
        name: 'claude_coffee_mug',
        asset_path: '/home/sherndon/agent-adventures/assets/demo/Mugs/SM_Mug_A2.usd',
        position: [2.0, 1.0, 0.8],
        rotation: [0, 0, 0],
        scale: [1.0, 1.0, 1.0]
      },
      gemini: {
        // Test batch creation with mixed primitives and USD assets
        useBatch: true,
        batch_name: 'gemini_mixed_scene',
        parent_path: '/World/GeminiZone',
        elements: [
          {
            // USD asset in batch
            asset_path: '/home/sherndon/agent-adventures/assets/demo/Mugs/SM_Mug_C1.usd',
            name: 'elegant_mug',
            position: [0.0, 0.0, 0.5],
            rotation: [0, 45, 0],
            scale: [1.2, 1.2, 1.2]
          },
          {
            // Primitive in batch for comparison
            element_type: 'cube',
            name: 'mug_platform',
            position: [0.0, 0.0, 0.0],
            scale: [1.5, 1.5, 0.1],
            color: [0.7, 0.5, 0.3]
          }
        ]
      },
      gpt: {
        // Test batch creation with multiple USD assets
        useBatch: true,
        batch_name: 'gpt_mug_collection',
        parent_path: '/World/CoffeeBar',
        elements: [
          {
            asset_path: '/home/sherndon/agent-adventures/assets/demo/Mugs/SM_Mug_B1.usd',
            name: 'mug_left',
            position: [-1.5, 0.0, 0.5],
            rotation: [0, -30, 0],
            scale: [1.0, 1.0, 1.0]
          },
          {
            asset_path: '/home/sherndon/agent-adventures/assets/demo/Mugs/SM_Mug_D1.usd',
            name: 'mug_right',
            position: [1.5, 0.0, 0.5],
            rotation: [0, 30, 0],
            scale: [1.0, 1.0, 1.0]
          },
          {
            asset_path: '/home/sherndon/agent-adventures/assets/demo/Mugs/SM_Mug_A2.usd',
            name: 'mug_center',
            position: [0.0, 0.0, 0.5],
            rotation: [0, 0, 0],
            scale: [1.1, 1.1, 1.1]
          }
        ]
      }
    };

    return configs[winner] || configs.claude;
  }

  getProposalsForType(type) {
    const proposals = {
      asset_placement: [
        {
          agent: 'claude',
          type: 'asset_placement',
          summary: 'Place strategic cube formation for spatial puzzle',
          reasoning: 'Systematic placement enabling logical progression and discovery',
          timestamp: Date.now()
        },
        {
          agent: 'gemini',
          type: 'asset_placement',
          summary: 'Create dramatic sphere tower with bold lighting',
          reasoning: 'Striking visual centerpiece that commands attention',
          timestamp: Date.now()
        },
        {
          agent: 'gpt',
          type: 'asset_placement',
          summary: 'Arrange balanced cylinder garden for exploration',
          reasoning: 'Accessible layout encouraging audience engagement',
          timestamp: Date.now()
        }
      ],
      camera_move: [
        {
          agent: 'claude',
          summary: 'Systematic reveal shot mapping the environment',
          reasoning: 'Strategic camera work revealing spatial relationships'
        },
        {
          agent: 'gemini',
          summary: 'Dynamic arc shot with dramatic elevation change',
          reasoning: 'Bold cinematic movement creating visual excitement'
        },
        {
          agent: 'gpt',
          summary: 'Smooth approach shot connecting with audience',
          reasoning: 'Accessible camera work enhancing viewer engagement'
        }
      ],
      story_advance: [
        {
          agent: 'claude',
          summary: 'Investigate the mysterious cave sounds carefully',
          reasoning: 'Logical progression building suspense through exploration'
        },
        {
          agent: 'gemini',
          summary: 'Confront the village elder about ancient secrets',
          reasoning: 'Bold character interaction driving dramatic revelation'
        },
        {
          agent: 'gpt',
          summary: 'Gather the team before making important decisions',
          reasoning: 'Character-focused approach building audience connection'
        }
      ]
    };

    return proposals[type] || [];
  }

  // Public API for modules
  getSystemData() {
    return { ...this.systemData };
  }

  updateAgentStatus(agent, status) {
    if (this.systemData.agents[agent]) {
      this.systemData.agents[agent].status = status;
    }
  }

  // Settings management
  showSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      this.loadCurrentSettings();
    }
  }

  hideSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

  loadCurrentSettings() {
    // Load current settings from localStorage or defaults
    const settings = this.getStoredSettings();

    document.getElementById('toggle-llm-apis').checked = settings.llmApis;
    document.getElementById('toggle-mcp-calls').checked = settings.mcpCalls;
    document.getElementById('toggle-streaming').checked = settings.streaming;
    document.getElementById('toggle-judge-panel').checked = settings.judgePanel;
  }

  getStoredSettings() {
    const defaults = {
      llmApis: true,
      mcpCalls: true,
      streaming: true,
      judgePanel: true
    };

    try {
      const stored = localStorage.getItem('agent-adventures-settings');
      return stored ? { ...defaults, ...JSON.parse(stored) } : defaults;
    } catch (error) {
      console.warn('Failed to load settings from localStorage:', error);
      return defaults;
    }
  }

  applySettings() {
    const settings = {
      llmApis: document.getElementById('toggle-llm-apis').checked,
      mcpCalls: document.getElementById('toggle-mcp-calls').checked,
      streaming: document.getElementById('toggle-streaming').checked,
      judgePanel: document.getElementById('toggle-judge-panel').checked
    };

    // Store settings locally
    try {
      localStorage.setItem('agent-adventures-settings', JSON.stringify(settings));
    } catch (error) {
      console.warn('Failed to save settings to localStorage:', error);
    }

    // Send settings to backend
    this.sendCommand('settings', 'update', settings);

    // Log the changes
    this.logActivity('system', 'SETTINGS',
      `Applied: LLM=${settings.llmApis}, MCP=${settings.mcpCalls}, Stream=${settings.streaming}, Judge=${settings.judgePanel}`);

    // Hide settings modal
    this.hideSettings();
  }

  resetSettings() {
    // Reset to defaults
    document.getElementById('toggle-llm-apis').checked = true;
    document.getElementById('toggle-mcp-calls').checked = true;
    document.getElementById('toggle-streaming').checked = true;
    document.getElementById('toggle-judge-panel').checked = true;

    this.logActivity('system', 'SETTINGS', 'Reset to defaults');
  }

  // Cleanup
  destroy() {
    if (this.socket) {
      this.socket.close();
    }

    Object.values(this.modules).forEach(module => {
      if (module.destroy) {
        module.destroy();
      }
    });

    console.log('🔄 Dashboard destroyed');
  }
}

// Initialize dashboard when page loads
let dashboard;

document.addEventListener('DOMContentLoaded', () => {
  dashboard = new AgentAdventuresDashboard();
});

// Export for other modules
window.AgentAdventuresDashboard = dashboard;
