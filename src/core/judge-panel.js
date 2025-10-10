import { JudgeDecision } from './proposal-system.js';
import { createLLMClient } from '../llm/llm-client.js';
import { config } from '../config/environment.js';

/**
 * Individual Judge for evaluating agent proposals
 * Each judge has a specialty and evaluation criteria
 */
export class Judge {
  constructor(id, specialty, judgeConfig = {}) {
    this.id = id;
    this.specialty = specialty; // 'technical', 'story', 'audience', 'visual'
    this.config = {
      weight: judgeConfig.weight || 1.0,
      strictness: judgeConfig.strictness || 'medium', // 'strict', 'medium', 'lenient'
      maxTokens: judgeConfig.maxTokens || config.tokens.maxPerDecision || 2000,
      enableLogging: judgeConfig.enableLogging !== false,
      llmModel: judgeConfig.llmModel || 'claude', // Which LLM to use for judging
      mockMode: judgeConfig.mockMode !== undefined ? judgeConfig.mockMode : false,
      ...judgeConfig
    };

    // Initialize LLM client for real judging
    this.llmClient = createLLMClient(this.config.llmModel);

    this.metrics = {
      decisionsRendered: 0,
      averageDecisionTime: 0,
      averageConfidence: 0,
      specialtyFocus: specialty
    };

    this.systemPrompt = this._loadSystemPrompt(specialty);
  }

  /**
   * Evaluate a batch of proposals and provide judgment
   */
  async evaluate(batchSummary) {
    const startTime = Date.now();

    try {
      // Prepare evaluation context
      const evaluationContext = this._prepareEvaluationContext(batchSummary);

      // Generate evaluation via LLM or rule-based system
      const evaluation = await this._generateEvaluation(evaluationContext);

      // Update metrics
      const decisionTime = Date.now() - startTime;
      this._updateMetrics(decisionTime, evaluation.confidence);

      return {
        judgeId: this.id,
        specialty: this.specialty,
        evaluation,
        decisionTime,
        weight: this.config.weight
      };

    } catch (error) {
      console.error(`[Judge ${this.id}] Evaluation failed:`, error);

      // Return default/fallback evaluation
      return {
        judgeId: this.id,
        specialty: this.specialty,
        evaluation: {
          winner: null,
          reasoning: 'Evaluation failed: ' + error.message,
          confidence: 'low',
          concerns: 'Technical evaluation error'
        },
        decisionTime: Date.now() - startTime,
        weight: 0 // Zero weight for failed evaluations
      };
    }
  }

  /**
   * Prepare context for evaluation based on judge specialty
   */
  _prepareEvaluationContext(batchSummary) {
    const baseContext = {
      batchId: batchSummary.batchId,
      proposalType: batchSummary.proposalType,
      proposals: batchSummary.proposals,
      context: batchSummary.context
    };

    // Add specialty-specific focus
    switch (this.specialty) {
      case 'technical':
        return {
          ...baseContext,
          focus: 'spatial_feasibility_performance',
          criteria: ['collision_avoidance', 'coordinate_correctness', 'mcp_usage', 'performance_impact']
        };

      case 'story':
        return {
          ...baseContext,
          focus: 'narrative_coherence_flow',
          criteria: ['story_advancement', 'character_development', 'genre_consistency', 'tension_management']
        };

      case 'audience':
        return {
          ...baseContext,
          focus: 'engagement_accessibility',
          criteria: ['viewer_interest', 'choice_meaningfulness', 'platform_suitability', 'retention_potential']
        };

      case 'visual':
        return {
          ...baseContext,
          focus: 'cinematic_composition',
          criteria: ['shot_composition', 'visual_appeal', 'camera_work', 'scene_aesthetics']
        };

      default:
        return baseContext;
    }
  }

  /**
   * Generate evaluation - calls LLM or uses mock based on settings
   */
  async _generateEvaluation(context) {
    // Use mock mode if configured
    if (this.config.mockMode) {
      if (this.config.enableLogging) {
        console.log(`[Judge ${this.id}] Using mock evaluation (mockMode enabled)`);
      }
      return this._mockEvaluation(context);
    }

    try {
      // Call real LLM for evaluation
      if (this.config.enableLogging) {
        console.log(`[Judge ${this.id}] Calling ${this.config.llmModel} for evaluation...`);
      }

      const prompt = this._buildEvaluationPrompt(context);
      const response = await this.llmClient.generateCompletion(
        this.systemPrompt,
        prompt,
        { maxTokens: this.config.maxTokens }
      );

      // Parse LLM response
      const evaluation = this._parseEvaluationResponse(response.content, context);
      return evaluation;

    } catch (error) {
      console.error(`[Judge ${this.id}] LLM evaluation failed, falling back to mock:`, error.message);
      return this._mockEvaluation(context);
    }
  }

  /**
   * Build evaluation prompt for LLM
   */
  _buildEvaluationPrompt(context) {
    const { proposals, focus, criteria, proposalType } = context;

    let prompt = `You are evaluating ${proposals.length} proposals for ${proposalType}.\n\n`;
    prompt += `Your specialty is "${this.specialty}" with focus on: ${focus}\n`;
    prompt += `Evaluation criteria: ${criteria.join(', ')}\n\n`;

    prompt += `PROPOSALS TO EVALUATE:\n\n`;

    for (const proposal of proposals) {
      prompt += `--- Proposal from ${proposal.agentId} ---\n`;
      prompt += `Reasoning: ${proposal.reasoning}\n`;
      prompt += `Data Summary: ${JSON.stringify(proposal.data, null, 2).substring(0, 500)}...\n\n`;
    }

    prompt += `\nINSTRUCTIONS:\n`;
    prompt += `1. Evaluate each proposal based on your specialty criteria\n`;
    prompt += `2. Choose the BEST proposal (agentId)\n`;
    prompt += `3. Provide clear reasoning for your decision\n`;
    prompt += `4. Rate your confidence: high, medium, or low\n`;
    prompt += `5. Note any concerns\n\n`;

    prompt += `Respond in JSON format:\n`;
    prompt += `{\n`;
    prompt += `  "winner": "agent-id-here",\n`;
    prompt += `  "reasoning": "your detailed reasoning",\n`;
    prompt += `  "confidence": "high|medium|low",\n`;
    prompt += `  "concerns": "any concerns or empty string"\n`;
    prompt += `}\n`;

    return prompt;
  }

  /**
   * Parse LLM evaluation response
   */
  _parseEvaluationResponse(content, context) {
    try {
      // Try to parse as JSON
      let parsed;
      if (typeof content === 'string') {
        // Strip code fences if present
        const cleaned = content.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON found in response');
        }
      } else {
        parsed = content;
      }

      // Validate required fields
      if (!parsed.winner || !parsed.reasoning) {
        throw new Error('Missing required fields in LLM response');
      }

      return {
        winner: parsed.winner,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence || 'medium',
        concerns: parsed.concerns || ''
      };

    } catch (error) {
      console.warn(`[Judge ${this.id}] Failed to parse LLM response:`, error.message);
      console.warn('Raw content:', content);

      // Fallback to mock evaluation
      return this._mockEvaluation(context);
    }
  }

  /**
   * Mock evaluation logic for testing
   */
  _mockEvaluation(context) {
    const { proposals, specialty } = context;

    if (!proposals || proposals.length === 0) {
      return {
        winner: null,
        reasoning: 'No proposals to evaluate',
        confidence: 'low',
        concerns: 'Empty proposal batch'
      };
    }

    const scores = proposals.map(proposal => this._scoreProposal(proposal, specialty));

    // Find winner
    const winner = scores.reduce((best, current) =>
      current.score > best.score ? current : best
    );

    // Determine confidence based on score spread
    const maxScore = Math.max(...scores.map(s => s.score));
    const minScore = Math.min(...scores.map(s => s.score));
    const scoreSpread = maxScore - minScore;

    let confidence = 'medium';
    if (scoreSpread > 3) confidence = 'high';
    if (scoreSpread < 1) confidence = 'low';

    // Generate concerns
    const concerns = [];
    const lowScorers = scores.filter(s => s.score < 2);
    if (lowScorers.length > 0) {
      concerns.push(`${lowScorers.length} weak proposals`);
    }

    return {
      winner: winner.agentId,
      reasoning: `${specialty} evaluation: ${winner.reasoning}`,
      confidence,
      concerns: concerns.join(', ') || '',
      scores // Include individual scores for transparency
    };
  }

  _scoreProposal(proposal, specialty) {
    let score = 0;
    const reasoning = [];

    switch (specialty) {
      case 'technical':
        if (proposal.spatial?.position) {
          score += 3;
          reasoning.push('valid positioning');
        }
        if (proposal.data.element_type) {
          score += 2;
          reasoning.push('proper element type');
        }
        if (proposal.spatial?.position?.[2] >= 0) {
          score += 2;
          reasoning.push('Z-up compliance');
        } else {
          score -= 1;
          reasoning.push('coordinate issues');
        }
        break;
      case 'story':
        if (proposal.data.story_beat) {
          score += 3;
          reasoning.push('clear story advancement');
        }
        if (proposal.data.choices?.length > 0) {
          score += 2;
          reasoning.push('meaningful choices');
        }
        if (proposal.reasoning.includes('narrative') || proposal.reasoning.includes('story')) {
          score += 1;
          reasoning.push('story-focused');
        }
        break;
      case 'audience':
        if (proposal.reasoning.includes('engagement') || proposal.reasoning.includes('audience')) {
          score += 3;
          reasoning.push('audience-focused');
        }
        if (proposal.data.choices) {
          score += 2;
          reasoning.push('interactive elements');
        }
        if (proposal.reasoning.length > 50) {
          score += 1;
          reasoning.push('detailed consideration');
        }
        break;
      case 'visual':
        if (proposal.data.target_position || proposal.data.position) {
          score += 2;
          reasoning.push('spatial awareness');
        }
        if (proposal.data.color || proposal.data.scale) {
          score += 2;
          reasoning.push('visual properties');
        }
        if (proposal.reasoning.includes('visual') || proposal.reasoning.includes('dramatic')) {
          score += 2;
          reasoning.push('visual consideration');
        }
        break;
    }

    score += Math.random() * 2 - 1; // ±1 random adjustment

    return {
      agentId: proposal.agentId,
      score,
      reasoning: reasoning.join(', ') || 'basic compliance'
    };
  }

  /**
   * Update judge performance metrics
   */
  _updateMetrics(decisionTime, confidence) {
    this.metrics.decisionsRendered++;

    // Update average decision time
    const total = this.metrics.decisionsRendered;
    this.metrics.averageDecisionTime =
      (this.metrics.averageDecisionTime * (total - 1) + decisionTime) / total;

    // Update average confidence (convert to numeric)
    const confidenceValue = { 'low': 1, 'medium': 2, 'high': 3 }[confidence] || 2;
    this.metrics.averageConfidence =
      (this.metrics.averageConfidence * (total - 1) + confidenceValue) / total;
  }

  /**
   * Load system prompt for judge specialty
   */
  _loadSystemPrompt(specialty) {
    const prompts = {
      technical: `
You are a Technical Judge for Agent Adventures. Evaluate proposals for:
- Isaac Sim spatial feasibility (Z-up coordinates, collision avoidance)
- MCP tool usage correctness
- Performance impact
- Technical implementation quality
Format: "Winner: [AgentId] - [reasoning] (confidence: [high/medium/low])"`,

      story: `
You are a Story Judge for Agent Adventures. Evaluate proposals for:
- Narrative coherence and advancement
- Character development support
- Genre consistency maintenance
- Story tension and pacing
Format: "Winner: [AgentId] - [reasoning] (confidence: [high/medium/low])"`,

      audience: `
You are an Audience Judge for Agent Adventures. Evaluate proposals for:
- Viewer engagement potential
- Choice meaningfulness and impact
- Cross-platform accessibility (Twitch/YouTube)
- Entertainment value and retention
Format: "Winner: [AgentId] - [reasoning] (confidence: [high/medium/low])"`,

      visual: `
You are a Visual Judge for Agent Adventures. Evaluate proposals for:
- Cinematic composition and framing
- Visual appeal and aesthetics
- Camera work and movement quality
- Scene design and spatial arrangement
Format: "Winner: [AgentId] - [reasoning] (confidence: [high/medium/low])"`
    };

    return prompts[specialty] || prompts.technical;
  }

  /**
   * Get judge metrics and status
   */
  getMetrics() {
    return {
      ...this.metrics,
      config: this.config,
      systemPrompt: this.systemPrompt.substring(0, 100) + '...' // Truncated for brevity
    };
  }
}

/**
 * Judge Panel that coordinates multiple judges for proposal evaluation
 */
export class JudgePanel {
  constructor(eventBus, options = {}) {
    this.eventBus = eventBus;
    this.options = {
      enableLogging: options.enableLogging !== false,
      decisionTimeout: options.decisionTimeout || 15000,
      requireConsensus: options.requireConsensus || false,
      minConfidence: options.minConfidence || 'low',
      ...options
    };

    // Initialize judges
    this.judges = this._initializeJudges(options.judgeConfig || {});

    // Panel metrics
    this.panelMetrics = {
      batchesEvaluated: 0,
      averageEvaluationTime: 0,
      consensusRate: 0,
      overrideRate: 0
    };

    // Setup event listeners
    this._setupEventListeners();
  }

  /**
   * Initialize judge panel with different specialties
   */
  _initializeJudges(judgeConfig) {
    // Default: single Claude judge for cost efficiency
    // Can be overridden via judgeConfig.judges
    const defaultJudges = [
      { id: 'claude_judge', specialty: 'technical', weight: 1.0, llmModel: 'claude' }
    ];

    const judgeSpecs = judgeConfig.judges || defaultJudges;
    const judges = new Map();

    for (const spec of judgeSpecs) {
      const judge = new Judge(spec.id, spec.specialty, spec);
      judges.set(spec.id, judge);
    }

    return judges;
  }

  /**
   * Evaluate a proposal batch using all judges
   */
  async evaluateBatch(batchSummary) {
    const startTime = Date.now();

    try {
      if (this.options.enableLogging) {
        console.log(`[JudgePanel] Evaluating batch ${batchSummary.batchId} with ${batchSummary.proposals.length} proposals`);
      }

      // Get evaluations from all judges in parallel
      const judgeEvaluations = await Promise.allSettled(
        Array.from(this.judges.values()).map(judge =>
          judge.evaluate(batchSummary)
        )
      );

      // Process judge results
      const validEvaluations = judgeEvaluations
        .filter(result => result.status === 'fulfilled')
        .map(result => result.value)
        .filter(evaluation => evaluation.weight > 0); // Exclude failed evaluations

      if (validEvaluations.length === 0) {
        throw new Error('No valid judge evaluations received');
      }

      // Make final decision
      const finalDecision = this._makeFinalDecision(validEvaluations, batchSummary);

      // Update panel metrics
      const evaluationTime = Date.now() - startTime;
      this._updatePanelMetrics(evaluationTime, validEvaluations, finalDecision);

      // Emit decision
      this.eventBus.emit('judge:decision_made', {
        batchId: batchSummary.batchId,
        decision: finalDecision,
        judgeEvaluations: validEvaluations,
        evaluationTime
      });

      return finalDecision;

    } catch (error) {
      console.error('[JudgePanel] Evaluation failed:', error);

      // Return fallback decision
      const fallbackDecision = new JudgeDecision(
        batchSummary.batchId,
        batchSummary.proposals[0]?.agentId || null,
        'Panel evaluation failed: ' + error.message,
        'low',
        'Technical failure in judging process'
      );

      this.eventBus.emit('judge:evaluation_failed', {
        batchId: batchSummary.batchId,
        error: error.message,
        fallbackDecision
      });

      return fallbackDecision;
    }
  }

  /**
   * Make final decision based on all judge evaluations
   */
  _makeFinalDecision(evaluations, batchSummary) {
    // Weighted voting system
    const votes = new Map(); // agentId -> { totalWeight, reasons, confidences }

    for (const evaluation of evaluations) {
      // Handle different evaluation structures
      const evalData = evaluation.evaluation || evaluation;
      const winner = evalData.winner || evalData.winningAgentId;
      const reasoning = evalData.reasoning || 'No reasoning provided';
      const confidence = evalData.confidence || 'medium';
      const weight = evaluation.weight || evalData.weight || 1.0;

      if (!winner) continue;

      if (!votes.has(winner)) {
        votes.set(winner, { totalWeight: 0, reasons: [], confidences: [], judges: [] });
      }

      const vote = votes.get(winner);
      vote.totalWeight += weight;
      vote.reasons.push(`${evaluation.specialty}: ${reasoning}`);
      vote.confidences.push(confidence);
      vote.judges.push(evaluation.judgeId);
    }

    if (votes.size === 0) {
      // No winners identified, pick first proposal
      return new JudgeDecision(
        batchSummary.batchId,
        batchSummary.proposals[0]?.agentId,
        'Default selection - no clear winner identified',
        'low',
        'Judge panel could not identify clear winner'
      );
    }

    // Find winner with highest weighted vote
    let winner = null;
    let maxWeight = 0;

    for (const [agentId, vote] of votes.entries()) {
      if (vote && vote.totalWeight > maxWeight) {
        maxWeight = vote.totalWeight;
        winner = { agentId, vote };
      }
    }

    // Handle case where no winner is found
    if (!winner) {
      return new JudgeDecision(
        batchSummary.batchId,
        batchSummary.proposals[0]?.agentId,
        'No valid votes received from judge panel',
        'low',
        'Technical failure - no judge votes processed'
      );
    }

    // Calculate overall confidence
    const confidenceValues = { 'low': 1, 'medium': 2, 'high': 3 };
    const avgConfidence = winner.vote.confidences.reduce((sum, conf) =>
      sum + confidenceValues[conf], 0) / winner.vote.confidences.length;

    let overallConfidence = 'low';
    if (avgConfidence >= 2.5) overallConfidence = 'high';
    else if (avgConfidence >= 1.5) overallConfidence = 'medium';

    // Check for concerns
    const concerns = [];
    const secondBest = Array.from(votes.entries())
      .filter(([agentId]) => agentId !== winner.agentId)
      .sort(([,a], [,b]) => b.totalWeight - a.totalWeight)[0];

    if (secondBest && winner.vote.totalWeight - secondBest[1].totalWeight < 0.5) {
      concerns.push('Close decision - margin < 0.5');
    }

    if (winner.vote.judges.length < this.judges.size * 0.75) {
      concerns.push('Low judge consensus');
    }

    // Create final decision
    return new JudgeDecision(
      batchSummary.batchId,
      winner.agentId,
      this._formatDecisionReasoning(winner.vote.reasons),
      overallConfidence,
      concerns.join(', ')
    );
  }

  /**
   * Format reasoning from multiple judges
   */
  _formatDecisionReasoning(reasons) {
    if (reasons.length === 1) {
      return reasons[0];
    }

    // Combine reasoning from different judges
    const summary = reasons.map(reason => {
      const [judge, ...rest] = reason.split(': ');
      return `${judge}: ${rest.join(': ')}`;
    }).join(' | ');

    // Truncate if too long
    return summary.length > 150 ? summary.substring(0, 147) + '...' : summary;
  }

  /**
   * Update panel performance metrics
   */
  _updatePanelMetrics(evaluationTime, evaluations, decision) {
    this.panelMetrics.batchesEvaluated++;

    // Update average evaluation time
    const total = this.panelMetrics.batchesEvaluated;
    this.panelMetrics.averageEvaluationTime =
      (this.panelMetrics.averageEvaluationTime * (total - 1) + evaluationTime) / total;

    // Calculate consensus rate (all judges agree on winner)
    const winners = evaluations.map(e => e.evaluation.winner).filter(w => w);
    const uniqueWinners = new Set(winners);
    const hasConsensus = uniqueWinners.size === 1 && winners.length > 0;

    this.panelMetrics.consensusRate =
      (this.panelMetrics.consensusRate * (total - 1) + (hasConsensus ? 1 : 0)) / total;
  }

  /**
   * Setup event listeners for judge panel
   */
  _setupEventListeners() {
    this.eventBus.subscribe('judge:evaluate_batch', async (event) => {
      const { batchId, summary } = event.payload;

      try {
        await this.evaluateBatch(summary);
      } catch (error) {
        console.error(`[JudgePanel] Failed to evaluate batch ${batchId}:`, error);
      }
    });

    this.eventBus.subscribe('platform:settings_updated', (event) => {
      const { settings } = event.payload;
      if (settings.judgePanel !== undefined) {
        const useMock = !settings.judgePanel;
        this.options.mockMode = useMock;

        // Update all judges' mock mode
        for (const judge of this.judges.values()) {
          judge.config.mockMode = useMock;
        }

        console.log(`[JudgePanel] Judge panel ${settings.judgePanel ? 'ENABLED (real LLM)' : 'DISABLED (using mock)'}`);
      }
    });
  }

  /**
   * Get panel status and metrics
   */
  getStatus() {
    const judgeMetrics = {};
    for (const [id, judge] of this.judges.entries()) {
      judgeMetrics[id] = judge.getMetrics();
    }

    return {
      panel: this.panelMetrics,
      judges: judgeMetrics,
      config: this.options,
      activeJudges: this.judges.size
    };
  }

  /**
   * Add or update a judge
   */
  addJudge(id, specialty, config = {}) {
    const judge = new Judge(id, specialty, config);
    this.judges.set(id, judge);
    return judge;
  }

  /**
   * Remove a judge
   */
  removeJudge(id) {
    return this.judges.delete(id);
  }
}

export default JudgePanel;