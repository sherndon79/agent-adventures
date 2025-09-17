/**
 * Proposal and Judging System for Multi-LLM Agent Competition
 * Handles proposal creation, evaluation, and decision making
 */

export class Proposal {
  constructor(agentId, agentType, proposalType, data, reasoning = '') {
    this.id = this._generateId();
    this.agentId = agentId;
    this.agentType = agentType; // 'scene', 'camera', 'story'
    this.proposalType = proposalType; // 'asset_placement', 'camera_move', 'story_advance', etc.
    this.data = data;
    this.reasoning = reasoning;
    this.timestamp = Date.now();
    this.status = 'pending'; // 'pending', 'judged', 'executed', 'rejected'

    // Metadata for tracking
    this.metadata = {
      tokenCount: this._estimateTokens(reasoning),
      priority: this._calculatePriority(proposalType),
      spatial: this._extractSpatialData(data)
    };
  }

  /**
   * Validate proposal format and content
   */
  validate() {
    const errors = [];

    // Basic validation
    if (!this.agentId || !this.agentType || !this.proposalType) {
      errors.push('Missing required fields');
    }

    // Type-specific validation
    switch (this.proposalType) {
      case 'asset_placement':
        if (!this.data.position || !Array.isArray(this.data.position) || this.data.position.length !== 3) {
          errors.push('Invalid position format for asset placement');
        }
        if (!this.data.element_type || !this.data.name) {
          errors.push('Missing element_type or name for asset placement');
        }
        break;

      case 'camera_move':
        if (!this.data.target_position || !Array.isArray(this.data.target_position)) {
          errors.push('Invalid target_position for camera move');
        }
        break;

      case 'story_advance':
        if (!this.data.story_beat || !this.data.choices) {
          errors.push('Missing story_beat or choices for story advance');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Convert proposal to compact string for LLM consumption
   */
  toCompactString() {
    const spatial = this.metadata.spatial;
    const spatialStr = spatial ? ` pos=${spatial.position?.join(',')}` : '';

    return `${this.agentId}[${this.proposalType}${spatialStr}]: ${this.reasoning}`;
  }

  // ========== Private Methods ==========

  _generateId() {
    return `prop_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  _estimateTokens(text) {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  _calculatePriority(proposalType) {
    const priorities = {
      'story_advance': 1,      // Highest priority
      'asset_placement': 2,
      'camera_move': 3,
      'lighting_change': 4,
      'audio_cue': 5          // Lowest priority
    };

    return priorities[proposalType] || 3;
  }

  _extractSpatialData(data) {
    const spatial = {};

    if (data.position) spatial.position = data.position;
    if (data.target_position) spatial.target_position = data.target_position;
    if (data.bounds) spatial.bounds = data.bounds;
    if (data.radius) spatial.radius = data.radius;

    return Object.keys(spatial).length > 0 ? spatial : null;
  }
}

export class JudgeDecision {
  constructor(proposalId, winningAgentId, reasoning, confidence = 'medium', concerns = '') {
    this.id = this._generateId();
    this.proposalId = proposalId;
    this.winningAgentId = winningAgentId;
    this.reasoning = reasoning;
    this.confidence = confidence; // 'high', 'medium', 'low'
    this.concerns = concerns;
    this.timestamp = Date.now();

    this.metadata = {
      tokenCount: this._estimateTokens(reasoning + concerns),
      decisionTime: 0 // Will be set by judge panel
    };
  }

  /**
   * Convert decision to compact string for logging/feedback
   */
  toCompactString() {
    const concernsStr = this.concerns ? ` (concerns: ${this.concerns})` : '';
    return `Winner: ${this.winningAgentId} - ${this.reasoning}${concernsStr}`;
  }

  _generateId() {
    return `decision_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  _estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }
}

export class ProposalBatch {
  constructor(requestId, proposalType, context = {}) {
    this.id = this._generateId();
    this.requestId = requestId;
    this.proposalType = proposalType;
    this.context = context; // Story state, scene info, etc.
    this.proposals = new Map(); // agentId -> Proposal
    this.decision = null; // JudgeDecision when complete

    this.status = 'collecting'; // 'collecting', 'judging', 'decided', 'executed'
    this.createdAt = Date.now();
    this.decidedAt = null;

    this.metadata = {
      expectedAgents: context.expectedAgents || [],
      priority: context.priority || 3,
      timeout: context.timeout || 10000
    };
  }

  /**
   * Add a proposal to the batch
   */
  addProposal(proposal) {
    if (this.status !== 'collecting') {
      throw new Error(`Cannot add proposal to batch with status: ${this.status}`);
    }

    const validation = proposal.validate();
    if (!validation.valid) {
      throw new Error(`Invalid proposal: ${validation.errors.join(', ')}`);
    }

    this.proposals.set(proposal.agentId, proposal);

    // Check if batch is complete
    if (this._isBatchComplete()) {
      this.status = 'ready_for_judging';
    }

    return this;
  }

  /**
   * Set the judge decision for this batch
   */
  setDecision(decision) {
    if (this.status !== 'judging' && this.status !== 'ready_for_judging') {
      throw new Error(`Cannot set decision for batch with status: ${this.status}`);
    }

    this.decision = decision;
    this.status = 'decided';
    this.decidedAt = Date.now();

    // Mark winning proposal
    const winningProposal = this.proposals.get(decision.winningAgentId);
    if (winningProposal) {
      winningProposal.status = 'selected';
    }

    // Mark other proposals as rejected
    for (const [agentId, proposal] of this.proposals.entries()) {
      if (agentId !== decision.winningAgentId) {
        proposal.status = 'rejected';
      }
    }

    return this;
  }

  /**
   * Get the winning proposal
   */
  getWinningProposal() {
    if (!this.decision) return null;
    return this.proposals.get(this.decision.winningAgentId);
  }

  /**
   * Get summary for judge evaluation
   */
  getJudgingSummary() {
    const proposalSummaries = Array.from(this.proposals.values()).map(p => ({
      agentId: p.agentId,
      reasoning: p.reasoning,
      data: p.data,
      spatial: p.metadata.spatial,
      priority: p.metadata.priority
    }));

    return {
      batchId: this.id,
      proposalType: this.proposalType,
      context: this.context,
      proposals: proposalSummaries,
      totalTokens: this._calculateTotalTokens()
    };
  }

  /**
   * Check if batch has timed out
   */
  isTimedOut() {
    return Date.now() - this.createdAt > this.metadata.timeout;
  }

  // ========== Private Methods ==========

  _generateId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  _isBatchComplete() {
    const expectedAgents = this.metadata.expectedAgents;

    if (expectedAgents.length === 0) {
      // If no specific agents expected, wait for at least 2 proposals
      return this.proposals.size >= 2;
    }

    // Check if all expected agents have submitted
    return expectedAgents.every(agentId => this.proposals.has(agentId));
  }

  _calculateTotalTokens() {
    return Array.from(this.proposals.values())
      .reduce((total, proposal) => total + proposal.metadata.tokenCount, 0);
  }
}

export class ProposalManager {
  constructor(eventBus, options = {}) {
    this.eventBus = eventBus;
    this.options = {
      maxBatchHistory: options.maxBatchHistory || 100,
      defaultTimeout: options.defaultTimeout || 10000,
      enableMetrics: options.enableMetrics !== false,
      ...options
    };

    this.activeBatches = new Map(); // batchId -> ProposalBatch
    this.batchHistory = []; // Completed batches
    this.metrics = {
      batchesCreated: 0,
      batchesCompleted: 0,
      averageDecisionTime: 0,
      totalTokensUsed: 0
    };

    // Set up event listeners
    this._setupEventListeners();
  }

  /**
   * Create a new proposal batch
   */
  createBatch(requestId, proposalType, context = {}) {
    const batch = new ProposalBatch(requestId, proposalType, context);

    this.activeBatches.set(batch.id, batch);
    this.metrics.batchesCreated++;

    this.eventBus.emit('proposal:batch_created', {
      batchId: batch.id,
      proposalType,
      context
    });

    // Set timeout for batch completion
    setTimeout(() => {
      this._handleBatchTimeout(batch.id);
    }, batch.metadata.timeout);

    return batch;
  }

  /**
   * Add proposal to existing batch
   */
  addProposal(batchId, proposal) {
    const batch = this.activeBatches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    batch.addProposal(proposal);

    this.eventBus.emit('proposal:proposal_added', {
      batchId,
      proposalId: proposal.id,
      agentId: proposal.agentId
    });

    // If batch is ready, send for judging
    if (batch.status === 'ready_for_judging') {
      this._sendBatchForJudging(batch);
    }

    return batch;
  }

  /**
   * Set decision for a batch
   */
  setDecision(batchId, decision) {
    const batch = this.activeBatches.get(batchId);
    if (!batch) {
      throw new Error(`Batch not found: ${batchId}`);
    }

    batch.setDecision(decision);

    // Calculate decision time
    decision.metadata.decisionTime = Date.now() - batch.createdAt;

    this.eventBus.emit('proposal:decision_made', {
      batchId,
      decisionId: decision.id,
      winningAgentId: decision.winningAgentId
    });

    // Move to history and cleanup
    this._completeBatch(batch);

    return batch;
  }

  /**
   * Get batch status
   */
  getBatchStatus(batchId) {
    const batch = this.activeBatches.get(batchId);
    return batch ? {
      id: batch.id,
      status: batch.status,
      proposalCount: batch.proposals.size,
      expectedAgents: batch.metadata.expectedAgents,
      isTimedOut: batch.isTimedOut(),
      createdAt: batch.createdAt
    } : null;
  }

  /**
   * Get system metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      activeBatches: this.activeBatches.size,
      completedBatches: this.batchHistory.length
    };
  }

  // ========== Private Methods ==========

  _setupEventListeners() {
    // Listen for agent proposals
    this.eventBus.subscribe('agent:proposal', async (event) => {
      const { batchId, proposal } = event.payload;
      try {
        this.addProposal(batchId, proposal);
      } catch (error) {
        console.error('Failed to add proposal:', error);
      }
    });
  }

  _sendBatchForJudging(batch) {
    batch.status = 'judging';

    this.eventBus.emit('judge:evaluate_batch', {
      batchId: batch.id,
      summary: batch.getJudgingSummary()
    });
  }

  _handleBatchTimeout(batchId) {
    const batch = this.activeBatches.get(batchId);
    if (!batch || batch.status !== 'collecting') {
      return; // Already processed or doesn't exist
    }

    if (batch.proposals.size === 0) {
      // No proposals received, cancel batch
      this._cancelBatch(batch);
    } else {
      // Force judging with whatever proposals we have
      console.warn(`Batch ${batchId} timed out, forcing evaluation with ${batch.proposals.size} proposals`);
      batch.status = 'ready_for_judging';
      this._sendBatchForJudging(batch);
    }
  }

  _completeBatch(batch) {
    // Update metrics
    this.metrics.batchesCompleted++;
    this.metrics.totalTokensUsed += batch._calculateTotalTokens();

    if (batch.decision) {
      const decisionTime = batch.decision.metadata.decisionTime;
      this.metrics.averageDecisionTime =
        (this.metrics.averageDecisionTime * (this.metrics.batchesCompleted - 1) + decisionTime) /
        this.metrics.batchesCompleted;
    }

    // Move to history
    this.batchHistory.push(batch);
    this.activeBatches.delete(batch.id);

    // Trim history if needed
    if (this.batchHistory.length > this.options.maxBatchHistory) {
      this.batchHistory = this.batchHistory.slice(-this.options.maxBatchHistory);
    }
  }

  _cancelBatch(batch) {
    batch.status = 'cancelled';

    this.eventBus.emit('proposal:batch_cancelled', {
      batchId: batch.id,
      reason: 'timeout_no_proposals'
    });

    this.activeBatches.delete(batch.id);
  }
}

export default { Proposal, JudgeDecision, ProposalBatch, ProposalManager };