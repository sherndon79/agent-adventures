import { EventEmitter } from 'eventemitter3';

/**
 * Competition Manager - Handles proposal collection, judging, and execution
 */
export class CompetitionManager extends EventEmitter {
  constructor(eventBus, config = {}) {
    super();

    this.eventBus = eventBus;
    this.config = {
      proposalTimeout: config.proposalTimeout || 30000, // 30 seconds
      judgeTimeout: config.judgeTimeout || 10000, // 10 seconds for judging
      mockMode: config.mockMode !== false, // Default to mock mode
      executionTimeout: config.executionTimeout || 10000,
      ...config
    };

    // Active competitions
    this.activeCompetitions = new Map(); // batchId -> competition data
    this.proposalCollections = new Map(); // batchId -> proposals array
    this.executionWatchers = new Map(); // proposalId -> { batchId, timeout }

    this._setupEventListeners();
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Listen for competition starts
    this.eventBus.subscribe('competition:start', (event) => {
      this._handleCompetitionStart(event.payload);
    });

    // Listen for agent proposals
    this.eventBus.subscribe('agent:proposal', (event) => {
      this._handleAgentProposal(event.payload);
    });

    // Listen for platform settings updates
    this.eventBus.subscribe('platform:settings_updated', (event) => {
      this._updateSettings(event.payload.settings);
    });

    // Listen for proposal execution confirmation
    this.eventBus.subscribe('agent:proposal_executed', (event) => {
      this._handleProposalExecution(event.payload);
    });
  }

  /**
   * Handle competition start
   */
  _handleCompetitionStart(competitionData) {
    const { batchId, type, timestamp } = competitionData;
    const proposalTimeout = competitionData.proposalTimeout || this.config.proposalTimeout;
    const executionTimeout = competitionData.executionTimeout || this.config.executionTimeout;

    console.log(`[CompetitionManager] Starting competition: ${type} (batch: ${batchId})`);

    // Initialize competition tracking
    this.activeCompetitions.set(batchId, {
      ...competitionData,
      proposals: [],
      proposalTimeout,
      executionTimeout,
      deadline: timestamp + proposalTimeout,
      status: 'collecting_proposals'
    });

    this.proposalCollections.set(batchId, []);

    // Set timeout for proposal collection
    setTimeout(() => {
      this._evaluateProposals(batchId);
    }, this.config.proposalTimeout);
  }

  /**
   * Handle incoming agent proposals
   */
  _handleAgentProposal(proposalData) {
    const { batchId, proposal } = proposalData;

    if (!this.activeCompetitions.has(batchId)) {
      console.warn(`[CompetitionManager] Received proposal for unknown batch: ${batchId}`);
      return;
    }

    const competition = this.activeCompetitions.get(batchId);
    if (competition.status !== 'collecting_proposals') {
      console.warn(`[CompetitionManager] Received late proposal for batch: ${batchId}`);
      return;
    }

    console.log(`[CompetitionManager] Received proposal from ${proposal.agentId} for batch ${batchId}`);

    // Add proposal to collection
    const proposals = this.proposalCollections.get(batchId);
    proposals.push(proposal);

    // Update competition data
    competition.proposals = proposals;
    this.activeCompetitions.set(batchId, competition);

    // Broadcast proposal received to dashboard
    this.eventBus.emit('competition:proposal_received', {
      batchId,
      agentId: proposal.agentId,
      proposalCount: proposals.length,
      timestamp: Date.now()
    });
  }

  /**
   * Evaluate proposals and select winner
   */
  async _evaluateProposals(batchId) {
    const competition = this.activeCompetitions.get(batchId);
    if (!competition) return;

    const proposals = this.proposalCollections.get(batchId) || [];

    console.log(`[CompetitionManager] Evaluating ${proposals.length} proposals for batch ${batchId}`);

    if (proposals.length === 0) {
      console.warn(`[CompetitionManager] No proposals received for batch ${batchId}`);
      this._endCompetition(batchId, { error: 'No proposals received' });
      return;
    }

    // Update status
    competition.status = 'judging';
    this.activeCompetitions.set(batchId, competition);

    // Mock judging or real judge panel
    const winner = await this._selectWinner(proposals, competition);

    if (winner) {
      await this._executeWinningProposal(batchId, winner, competition);
    } else {
      this._endCompetition(batchId, { error: 'No winner selected' });
    }
  }

  /**
   * Select winning proposal (mock or real judging)
   */
  async _selectWinner(proposals, competition) {
    if (this.config.mockMode) {
      // Mock judging - randomly select winner for now
      console.log(`[CompetitionManager] Mock judging: selecting random winner from ${proposals.length} proposals`);
      const winner = proposals[Math.floor(Math.random() * proposals.length)];

      // Emit mock audience voting result
      this.eventBus.emit('competition:voting_result', {
        batchId: competition.batchId,
        winningAgentId: winner.agentId,
        totalVotes: Math.floor(Math.random() * 1000) + 100,
        voteBreakdown: this._generateMockVotes(proposals),
        method: 'mock_audience_voting',
        timestamp: Date.now()
      });

      return winner;
    } else {
      // Real judge panel would be implemented here
      // For now, fall back to mock
      console.log(`[CompetitionManager] Real judging not implemented, using mock`);
      return proposals[Math.floor(Math.random() * proposals.length)];
    }
  }

  /**
   * Generate mock vote breakdown
   */
  _generateMockVotes(proposals) {
    const votes = {};
    const totalVotes = Math.floor(Math.random() * 1000) + 100;
    let remaining = totalVotes;

    proposals.forEach((proposal, index) => {
      if (index === proposals.length - 1) {
        votes[proposal.agentId] = remaining;
      } else {
        const voteCount = Math.floor(Math.random() * remaining / (proposals.length - index));
        votes[proposal.agentId] = voteCount;
        remaining -= voteCount;
      }
    });

    return votes;
  }

  /**
   * Execute winning proposal via MCP
   */
  async _executeWinningProposal(batchId, winningProposal, competition) {
    console.log(`[CompetitionManager] Executing winning proposal from ${winningProposal.agentId}`);

    // Update status
    competition.status = 'awaiting_execution';
    competition.winningProposal = winningProposal;
    this.activeCompetitions.set(batchId, competition);

    // Emit decision made event
    this.eventBus.emit('proposal:decision_made', {
      batchId,
      winningAgentId: winningProposal.agentId,
      winningProposal,
      decision: {
        winner: winningProposal.agentId,
        timestamp: Date.now(),
        method: this.config.mockMode ? 'mock_voting' : 'audience_voting'
      }
    });

    // Broadcast to dashboard
    this.eventBus.emit('competition:winner_selected', {
      batchId,
      winningAgentId: winningProposal.agentId,
      winningProposal: {
        id: winningProposal.id,
        agentId: winningProposal.agentId,
        data: winningProposal.data,
        reasoning: winningProposal.reasoning
      },
      timestamp: Date.now()
    });

    const executionTimeout = competition.executionTimeout || this.config.executionTimeout;
    const timeoutHandle = setTimeout(() => {
      this.executionWatchers.delete(winningProposal.id);
      this._endCompetition(batchId, {
        winner: winningProposal.agentId,
        executed: false,
        error: 'Agent execution timeout'
      });
    }, executionTimeout);
    timeoutHandle.unref?.();

    this.executionWatchers.set(winningProposal.id, {
      batchId,
      timeout: timeoutHandle
    });
  }

  _handleProposalExecution(payload = {}) {
    const proposalId = payload.proposalId;
    if (!proposalId) {
      return;
    }

    const watcher = this.executionWatchers.get(proposalId);
    if (!watcher) {
      return;
    }

    clearTimeout(watcher.timeout);
    this.executionWatchers.delete(proposalId);

    const competition = this.activeCompetitions.get(watcher.batchId);
    if (!competition) {
      return;
    }

    this._endCompetition(watcher.batchId, {
      winner: competition.winningProposal?.agentId,
      executed: true,
      executionPayload: payload
    });
  }

  /**
   * End competition and cleanup
   */
  _endCompetition(batchId, result) {
    console.log(`[CompetitionManager] Competition ${batchId} ended:`, result);

    for (const [proposalId, watcher] of this.executionWatchers.entries()) {
      if (watcher.batchId === batchId) {
        clearTimeout(watcher.timeout);
        this.executionWatchers.delete(proposalId);
      }
    }

    const competition = this.activeCompetitions.get(batchId);

    // Emit completion event
    this.eventBus.emit('competition:completed', {
      batchId,
      context: competition?.context || {},
      result: {
        ...result,
        winningProposal: competition?.winningProposal
      },
      timestamp: Date.now()
    });

    // Cleanup
    this.activeCompetitions.delete(batchId);
    this.proposalCollections.delete(batchId);
  }

  /**
   * Update settings from dashboard
   */
  _updateSettings(settings) {
    if (settings.judgePanel !== undefined) {
      this.config.mockMode = !settings.judgePanel;
      console.log(`[CompetitionManager] Judge panel ${settings.judgePanel ? 'ENABLED' : 'DISABLED (using mock)'}`);
    }
  }

  /**
   * Get current competition status
   */
  getStatus() {
    return {
      activeCompetitions: this.activeCompetitions.size,
      competitions: Array.from(this.activeCompetitions.values()),
      config: this.config
    };
  }
}

export default CompetitionManager;
