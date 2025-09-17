import { BaseAgent } from './base-agent.js';
import { Proposal } from './proposal-system.js';
import { createLLMClient } from '../llm/llm-client.js';
import { config } from '../config/environment.js';

/**
 * Base class for multi-LLM competitive agents
 * Handles LLM interaction, proposal generation, and spatial awareness
 */
export class MultiLLMAgent extends BaseAgent {
  constructor(id, agentType, llmModel, config = {}, dependencies = {}) {
    super(id, config, dependencies);

    this.agentType = agentType; // 'scene', 'camera', 'story'
    this.llmModel = llmModel; // 'claude', 'gemini', 'gpt', etc.
    this.systemPrompt = this._loadSystemPrompt(agentType);

    // Initialize LLM client
    this.llmClient = createLLMClient(llmModel);

    // MCP clients for Isaac Sim interaction
    this.mcpClients = dependencies.mcpClients || {};

    // Proposal management
    this.activeProposals = new Map(); // batchId -> proposalId
    this.proposalHistory = [];

    // Agent-specific metrics
    this.competitionMetrics = {
      proposalsSubmitted: 0,
      proposalsWon: 0,
      proposalsRejected: 0,
      averageConfidence: 0,
      spatialQueries: 0,
      winRate: 0
    };

    // Current platform settings (updated via events)
    this.platformSettings = {
      llmApis: true,
      mcpCalls: true,
      streaming: true,
      judgePanel: true
    };
  }

  // ========== Core Multi-LLM Agent Interface ==========

  /**
   * Generate a proposal for the given context
   * Supports both challenge object format and individual parameters
   */
  async generateProposal(batchIdOrChallenge, proposalType, context) {
    if (this.state !== 'running') {
      throw new Error(`Agent ${this.id} not running`);
    }

    // Handle challenge object format
    let batchId, actualProposalType, actualContext;
    if (typeof batchIdOrChallenge === 'object' && batchIdOrChallenge.type) {
      // Challenge object format: generateProposal(challenge)
      const challenge = batchIdOrChallenge;
      batchId = challenge.id || 'challenge-' + Date.now();
      actualProposalType = challenge.type;
      actualContext = challenge;
    } else {
      // Individual parameters format: generateProposal(batchId, proposalType, context)
      batchId = batchIdOrChallenge;
      actualProposalType = proposalType;
      actualContext = context;
    }

    try {
      // Step 1: Query spatial context if needed
      const spatialContext = await this._querySpatialContext(actualProposalType, actualContext);

      // Step 2: Prepare context for LLM
      const llmContext = this._prepareLLMContext(actualProposalType, actualContext, spatialContext);

      // Step 3: Generate proposal via LLM
      const proposalData = await this._callLLM(llmContext);

      // Step 4: Validate and enhance proposal
      const enhancedData = await this._enhanceProposal(proposalData, spatialContext);

      // Step 5: Create proposal object
      const proposal = new Proposal(
        this.id,
        this.agentType,
        actualProposalType,
        enhancedData.data,
        enhancedData.reasoning
      );

      // Step 6: Validate proposal
      const validation = proposal.validate();
      if (!validation.valid) {
        throw new Error(`Invalid proposal: ${validation.errors.join(', ')}`);
      }

      // Track proposal
      this.activeProposals.set(batchId, proposal.id);
      this.competitionMetrics.proposalsSubmitted++;

      // Emit proposal for batch collection
      this.emitEvent('agent:proposal', {
        batchId,
        proposal
      });

      return proposal;

    } catch (error) {
      console.error(`[${this.id}] Failed to generate proposal:`, error);
      this.metrics.errorsEncountered++;
      throw error;
    }
  }

  /**
   * Handle proposal decision results
   */
  async handleProposalDecision(batchId, decision) {
    const proposalId = this.activeProposals.get(batchId);
    if (!proposalId) {
      return; // Not our batch
    }

    const won = decision.winningAgentId === this.id;

    if (won) {
      this.competitionMetrics.proposalsWon++;

      // If we won, execute the proposal
      await this._executeProposal(proposalId, decision);

    } else {
      this.competitionMetrics.proposalsRejected++;

      // Learn from loss (optional - for future ML enhancement)
      await this._handleProposalLoss(proposalId, decision);
    }

    // Update win rate
    this._updateWinRate();

    // Clean up
    this.activeProposals.delete(batchId);

    // Store in history
    this.proposalHistory.push({
      batchId,
      proposalId,
      won,
      decision,
      timestamp: Date.now()
    });

    // Trim history
    if (this.proposalHistory.length > 50) {
      this.proposalHistory = this.proposalHistory.slice(-50);
    }
  }

  // ========== Spatial Context Querying ==========

  /**
   * Query spatial context based on proposal type
   */
  async _querySpatialContext(proposalType, context) {
    const spatialContext = {};

    try {
      switch (proposalType) {
        case 'asset_placement':
          spatialContext.scene = await this._querySceneContext(context);
          if (context.target_position) {
            spatialContext.nearby = await this._queryNearbyObjects(context.target_position);
            spatialContext.groundLevel = await this._queryGroundLevel(context.target_position);
          }
          break;

        case 'camera_move':
          spatialContext.camera = await this._queryCameraContext();
          if (context.target_objects) {
            spatialContext.assets = await this._queryAssetTransforms(context.target_objects);
          }
          break;

        case 'story_advance':
          // Story agents might need scene context for narrative decisions
          spatialContext.scene = await this._querySceneOverview();
          break;
      }

      this.competitionMetrics.spatialQueries++;
      return spatialContext;

    } catch (error) {
      console.warn(`[${this.id}] Spatial query failed:`, error.message);
      return {}; // Continue without spatial context
    }
  }

  async _querySceneContext(context) {
    if (!this.mcpClients.worldBuilder) return {};

    const sceneResult = await this.mcpClients.worldBuilder.getScene(true);
    return sceneResult.success ? sceneResult.result : {};
  }

  async _queryNearbyObjects(position, radius = 5) {
    if (!this.mcpClients.worldBuilder) return {};

    const nearbyResult = await this.mcpClients.worldBuilder.queryObjectsNearPoint(position, radius);
    return nearbyResult.success ? nearbyResult.result : {};
  }

  async _queryGroundLevel(position) {
    if (!this.mcpClients.worldBuilder) return { ground_level: 0.0 };

    const groundResult = await this.mcpClients.worldBuilder.findGroundLevel(position);
    return groundResult.success ? groundResult.result : { ground_level: 0.0 };
  }

  async _queryCameraContext() {
    if (!this.mcpClients.worldViewer) return {};

    const cameraResult = await this.mcpClients.worldViewer.getCameraStatus();
    return cameraResult.success ? cameraResult.result : {};
  }

  async _queryAssetTransforms(objectPaths) {
    if (!this.mcpClients.worldViewer || !Array.isArray(objectPaths)) return {};

    const transforms = {};
    for (const path of objectPaths) {
      try {
        const result = await this.mcpClients.worldViewer.getAssetTransform(path);
        if (result.success) {
          transforms[path] = result.result;
        }
      } catch (error) {
        console.warn(`Failed to get transform for ${path}:`, error.message);
      }
    }

    return transforms;
  }

  async _querySceneOverview() {
    // Simplified scene overview for story context
    if (!this.mcpClients.worldBuilder) return {};

    try {
      const sceneResult = await this.mcpClients.worldBuilder.getScene(false);
      const statusResult = await this.mcpClients.worldBuilder.getSceneStatus();

      return {
        scene: sceneResult.success ? sceneResult.result : {},
        status: statusResult.success ? statusResult.result : {}
      };
    } catch (error) {
      return {};
    }
  }

  // ========== LLM Interaction ==========

  /**
   * Prepare context for LLM call
   */
  _prepareLLMContext(proposalType, context, spatialContext) {
    // Get current story state
    const storyState = this.dependencies.storyState?.getState() || {};

    return {
      systemPrompt: this.systemPrompt,
      proposalType,
      context,
      spatialContext,
      storyState,
      agentInfo: {
        id: this.id,
        model: this.llmModel,
        winRate: this.competitionMetrics.winRate
      }
    };
  }

  /**
   * Call LLM to generate proposal using real API
   */
  async _callLLM(llmContext) {
    // Check both config mock mode and platform settings for LLM specifically
    if (config.tokens.mockLLMMode || !this.platformSettings.llmApis) {
      console.log(`[${this.id}] Using mock LLM response (mockLLM: ${config.tokens.mockLLMMode}, llmApis: ${this.platformSettings.llmApis})`);
      return this._mockLLMResponse(llmContext);
    }

    try {
      const systemPrompt = this.systemPrompt || this._getDefaultSystemPrompt();
      const userPrompt = this._formatLLMPrompt(llmContext);

      console.log(`[${this.id}] Making ${this.llmModel} API call...`);

      const startTime = Date.now();
      const response = await this.llmClient.generateCompletion(
        systemPrompt,
        userPrompt,
        { maxTokens: config.tokens.maxPerProposal }
      );

      // Track token usage
      this.competitionMetrics.totalTokensUsed = (this.competitionMetrics.totalTokensUsed || 0) + response.usage.totalTokens;
      this.competitionMetrics.totalCost = (this.competitionMetrics.totalCost || 0) + this._calculateCost(response.usage);
      this.competitionMetrics.averageResponseTime = Date.now() - startTime;

      // Parse the LLM response into structured data
      return this._parseProposalResponse(response.content, llmContext);

    } catch (error) {
      console.error(`[${this.id}] LLM API call failed:`, error.message);

      // Fall back to mock on API failure for development
      if (config.isDevelopment) {
        console.warn(`[${this.id}] Falling back to mock response`);
        return this._mockLLMResponse(llmContext);
      }

      throw error;
    }
  }

  /**
   * Get default system prompt if none provided
   */
  _getDefaultSystemPrompt() {
    return `You are a ${this.llmModel} agent specialized in ${this.agentType} tasks for Agent Adventures.
Provide structured responses that can be parsed into valid proposals.`;
  }

  /**
   * Format the user prompt for LLM from context
   */
  _formatLLMPrompt(llmContext) {
    const { proposalType, context, spatialContext, agentInfo } = llmContext;

    let prompt = `Task: Generate a ${proposalType} proposal.\n\n`;

    if (context) {
      prompt += `Context: ${JSON.stringify(context, null, 2)}\n\n`;
    }

    if (spatialContext && Object.keys(spatialContext).length > 0) {
      prompt += `Spatial Context: ${JSON.stringify(spatialContext, null, 2)}\n\n`;
    }

    prompt += `Please provide a structured response with your reasoning and specific data for the ${proposalType} proposal.`;

    // Add format guidance based on proposal type
    switch (proposalType) {
      case 'asset_placement':
        prompt += `\n\nResponse should include: position [x,y,z], element_type, name, scale [x,y,z], and reasoning.`;
        break;
      case 'camera_move':
        prompt += `\n\nResponse should include: target_position [x,y,z], target_look_at [x,y,z], movement_duration, and reasoning.`;
        break;
      case 'story_advance':
        prompt += `\n\nResponse should include: choice_selected, narrative_impact, and reasoning.`;
        break;
    }

    return prompt;
  }

  /**
   * Parse LLM response into structured proposal data
   */
  _parseProposalResponse(content, llmContext) {
    const { proposalType } = llmContext;

    try {
      // Try to extract structured data from the response
      const data = this._extractStructuredData(content, proposalType);
      const reasoning = this._extractReasoning(content);

      return {
        data,
        reasoning,
        rawResponse: content
      };
    } catch (error) {
      console.warn(`[${this.id}] Failed to parse LLM response, using fallback:`, error.message);

      // Fallback to a basic structure
      return this._createFallbackResponse(content, proposalType);
    }
  }

  /**
   * Extract structured data from LLM response based on proposal type
   */
  _extractStructuredData(content, proposalType) {
    // Simple parsing - look for JSON-like patterns or key phrases
    switch (proposalType) {
      case 'asset_placement':
        return this._parseAssetPlacementData(content);
      case 'camera_move':
        return this._parseCameraMovementData(content);
      case 'story_advance':
        return this._parseStoryAdvanceData(content);
      default:
        throw new Error(`Unknown proposal type: ${proposalType}`);
    }
  }

  /**
   * Parse asset placement data from LLM response
   */
  _parseAssetPlacementData(content) {
    // Look for position coordinates
    const positionMatch = content.match(/position[:\s]*\[?(-?\d+\.?\d*),?\s*(-?\d+\.?\d*),?\s*(-?\d+\.?\d*)\]?/i);
    const position = positionMatch ?
      [parseFloat(positionMatch[1]), parseFloat(positionMatch[2]), parseFloat(positionMatch[3])] :
      [Math.random() * 10 - 5, Math.random() * 10 - 5, Math.max(0, Math.random() * 3)]; // Ensure Z >= 0

    // Look for element type
    const elementMatch = content.match(/element_type[:\s]*['"]*(\w+)['"]*|type[:\s]*['"]*(\w+)['"]*|(cube|sphere|cylinder|cone)/i);
    const element_type = elementMatch ? (elementMatch[1] || elementMatch[2] || elementMatch[3]).toLowerCase() : 'cube';

    // Look for name
    const nameMatch = content.match(/name[:\s]*['"]*([^'"]+)['"]*|named[:\s]*['"]*([^'"]+)['"]*/) || [`${element_type}_${Date.now()}`];
    const name = nameMatch[1] || nameMatch[2] || `${element_type}_${Date.now()}`;

    // Look for scale
    const scaleMatch = content.match(/scale[:\s]*\[?(-?\d+\.?\d*),?\s*(-?\d+\.?\d*),?\s*(-?\d+\.?\d*)\]?/i);
    const scale = scaleMatch ?
      [parseFloat(scaleMatch[1]), parseFloat(scaleMatch[2]), parseFloat(scaleMatch[3])] :
      [1.0, 1.0, 1.0];

    return {
      position,
      element_type,
      name: name.replace(/[^a-zA-Z0-9_]/g, '_'), // Clean name
      scale
    };
  }

  /**
   * Parse camera movement data from LLM response
   */
  _parseCameraMovementData(content) {
    const positionMatch = content.match(/target_position[:\s]*\[?(-?\d+\.?\d*),?\s*(-?\d+\.?\d*),?\s*(-?\d+\.?\d*)\]?/i);
    const target_position = positionMatch ?
      [parseFloat(positionMatch[1]), parseFloat(positionMatch[2]), parseFloat(positionMatch[3])] :
      [0, 0, 5];

    const lookAtMatch = content.match(/(?:target_look_at|look_at|target)[:\s]*\[?(-?\d+\.?\d*),?\s*(-?\d+\.?\d*),?\s*(-?\d+\.?\d*)\]?/i);
    const target_look_at = lookAtMatch ?
      [parseFloat(lookAtMatch[1]), parseFloat(lookAtMatch[2]), parseFloat(lookAtMatch[3])] :
      [0, 0, 0];

    const durationMatch = content.match(/(?:movement_duration|duration)[:\s]*(-?\d+\.?\d*)/i);
    const movement_duration = durationMatch ? parseFloat(durationMatch[1]) : 2.0;

    return {
      target_position,
      target_look_at,
      movement_duration
    };
  }

  /**
   * Parse story advancement data from LLM response
   */
  _parseStoryAdvanceData(content) {
    // Look for story beat information
    const storyBeatMatch = content.match(/story_beat[:\s]*['"]*([^'"]+)['"]*|beat[:\s]*['"]*([^'"]+)['"]*|story[:\s]*['"]*([^'"]+)['"]*/) || ['continuation'];
    const story_beat = storyBeatMatch[1] || storyBeatMatch[2] || storyBeatMatch[3] || 'story_continuation';

    // Look for choices (could be array or single choice)
    const choiceMatch = content.match(/choices[:\s]*\[([^\]]+)\]|choice[:\s]*['"]*([^'"]+)['"]*/) || ['continue_adventure'];
    let choices;
    if (choiceMatch[1]) {
      // Parse array of choices
      choices = choiceMatch[1].split(',').map(c => c.trim().replace(/['"]/g, ''));
    } else {
      // Single choice
      choices = [choiceMatch[2] || 'continue_adventure'];
    }

    return {
      story_beat,
      choices
    };
  }

  /**
   * Extract reasoning from LLM response
   */
  _extractReasoning(content) {
    // Look for reasoning section
    const reasoningMatch = content.match(/reasoning[:\s]*([^$]+)/i) ||
                          content.match(/because[:\s]*([^$]+)/i) ||
                          [null, content.substring(0, 200)]; // Fallback to first 200 chars

    return reasoningMatch[1] ? reasoningMatch[1].trim() : content.substring(0, 200) + '...';
  }

  /**
   * Create fallback response when parsing fails
   */
  _createFallbackResponse(content, proposalType) {
    const data = {
      asset_placement: {
        position: [0, 0, 0.5],
        element_type: 'cube',
        name: `fallback_cube_${Date.now()}`,
        scale: [1, 1, 1]
      },
      camera_move: {
        target_position: [0, 0, 5],
        target_look_at: [0, 0, 0],
        movement_duration: 2.0
      },
      story_advance: {
        choice_selected: 'choice_1',
        narrative_impact: 'medium'
      }
    };

    return {
      data: data[proposalType] || data.asset_placement,
      reasoning: `Fallback response based on: ${content.substring(0, 100)}...`,
      rawResponse: content
    };
  }

  /**
   * Calculate API cost based on token usage
   */
  _calculateCost(usage) {
    // Rough cost estimates (per 1000 tokens)
    const costPer1k = {
      claude: 0.015, // Claude Haiku approximate
      gpt: 0.03, // GPT-4 approximate
      gemini: 0.001 // Gemini Pro approximate
    };

    const rate = costPer1k[this.llmModel] || 0.02;
    return (usage.totalTokens / 1000) * rate;
  }

  /**
   * Mock LLM responses for testing
   */
  _mockLLMResponse(llmContext) {
    const { proposalType, agentInfo } = llmContext;

    // Different models have different "personalities"
    const responses = {
      claude: {
        asset_placement: {
          data: {
            element_type: 'cube',
            name: `thoughtful_cube_${Date.now()}`,
            position: [5, 3, 0.5],
            scale: [1, 1, 1],
            color: [0.6, 0.4, 0.7]
          },
          reasoning: 'Carefully considered placement avoiding conflicts, supports narrative flow'
        },
        camera_move: {
          data: {
            target_position: [8, -12, 3],
            look_at: [0, 0, 1.5],
            duration: 3.0,
            movement_type: 'smooth_move'
          },
          reasoning: 'Elegant transition maintaining visual continuity and dramatic tension'
        },
        story_advance: {
          data: {
            story_beat: 'character_revelation',
            choices: [
              { id: 'A', text: 'Confront directly', consequence: 'conflict escalation' },
              { id: 'B', text: 'Ask gentle questions', consequence: 'gradual revelation' },
              { id: 'C', text: 'Wait and observe', consequence: 'tension building' }
            ]
          },
          reasoning: 'Balanced choices offering meaningful narrative branches with clear stakes'
        }
      },
      gemini: {
        asset_placement: {
          data: {
            element_type: 'sphere',
            name: `dynamic_sphere_${Date.now()}`,
            position: [0, 0, 2.0],
            scale: [1.5, 1.5, 1.5],
            color: [1.0, 0.3, 0.1]
          },
          reasoning: 'Bold visual statement with strong spatial presence and color impact'
        },
        camera_move: {
          data: {
            target_position: [15, -5, 8],
            look_at: [2, 5, 0],
            duration: 2.0,
            movement_type: 'arc_shot'
          },
          reasoning: 'Dynamic arc movement creating visual excitement and spatial drama'
        },
        story_advance: {
          data: {
            story_beat: 'action_sequence',
            choices: [
              { id: 'A', text: 'Fight with magic', consequence: 'spectacular battle' },
              { id: 'B', text: 'Use environment', consequence: 'creative problem solving' },
              { id: 'C', text: 'Attempt escape', consequence: 'chase sequence' }
            ]
          },
          reasoning: 'High-energy options maximizing visual potential and audience excitement'
        }
      }
    };

    const modelResponses = responses[agentInfo.model] || responses.claude;
    const response = modelResponses[proposalType] || modelResponses.asset_placement;

    // Add some randomness to positions and names
    if (response.data.position) {
      response.data.position = response.data.position.map(coord =>
        coord + (Math.random() - 0.5) * 2
      );
    }

    return response;
  }

  // ========== Proposal Enhancement and Execution ==========

  /**
   * Enhance proposal with additional validation and spatial safety
   */
  async _enhanceProposal(proposalData, spatialContext) {
    const enhanced = { ...proposalData };

    // Add spatial safety checks
    if (enhanced.data.position && spatialContext.nearby) {
      enhanced.data = await this._ensureSpatialSafety(enhanced.data, spatialContext);
    }

    // Add Isaac Sim coordinate system corrections
    enhanced.data = this._applyCoordinateSystemFixes(enhanced.data);

    return enhanced;
  }

  async _ensureSpatialSafety(data, spatialContext) {
    // Check for collisions with nearby objects
    if (spatialContext.nearby?.objects?.length > 0) {
      const minDistance = 1.0; // Minimum separation
      let position = [...data.position];

      for (const nearbyObject of spatialContext.nearby.objects) {
        const distance = this._calculateDistance(position, nearbyObject.position);
        if (distance < minDistance) {
          // Adjust position to avoid collision
          position = this._adjustPosition(position, nearbyObject.position, minDistance);
        }
      }

      data.position = position;
    }

    // Ensure proper ground level
    if (spatialContext.groundLevel?.ground_level !== undefined) {
      const groundLevel = spatialContext.groundLevel.ground_level;
      if (data.position[2] < groundLevel + 0.1) {
        data.position[2] = groundLevel + 0.5; // Place safely above ground
      }
    }

    return data;
  }

  _applyCoordinateSystemFixes(data) {
    // Ensure Z-up coordinate system compliance
    if (data.position && data.position[2] < 0) {
      console.warn(`[${this.id}] Correcting negative Z position:`, data.position);
      data.position[2] = Math.abs(data.position[2]);
    }

    return data;
  }

  /**
   * Execute winning proposal via MCP
   */
  async _executeProposal(proposalId, decision) {
    // Find the proposal in our history or recreate context
    console.log(`[${this.id}] Executing winning proposal: ${proposalId}`);

    // Implementation would execute via appropriate MCP client
    // This is where the actual Isaac Sim commands would be sent

    this.emitEvent('agent:proposal_executed', {
      agentId: this.id,
      proposalId,
      decision
    });
  }

  /**
   * Handle proposal loss - learn for future improvements
   */
  async _handleProposalLoss(proposalId, decision) {
    // Optional: Store loss information for future ML training
    console.log(`[${this.id}] Proposal lost to ${decision.winningAgentId}: ${decision.reasoning}`);
  }

  // ========== Agent Lifecycle Overrides ==========

  async _initialize() {
    // Load agent-type specific system prompts
    this.systemPrompt = this._loadSystemPrompt(this.agentType);

    // Set up proposal decision listener
    this.eventBus?.subscribe('proposal:decision_made', async (event) => {
      await this.handleProposalDecision(event.payload.batchId, event.payload.decision);
    });

    // Set up settings update listener
    this.eventBus?.subscribe('platform:settings_updated', (event) => {
      this.updatePlatformSettings(event.payload.settings);
    });
  }

  getEventSubscriptions() {
    return [
      { eventType: 'proposal:request', priority: 1 },
      { eventType: 'proposal:decision_made', priority: 2 }
    ];
  }

  /**
   * Update platform settings from dashboard
   */
  updatePlatformSettings(settings) {
    console.log(`[${this.id}] Updating platform settings:`, settings);
    this.platformSettings = { ...this.platformSettings, ...settings };

    // Log the specific changes that affect this agent
    if (settings.llmApis !== undefined) {
      console.log(`[${this.id}] LLM APIs now ${settings.llmApis ? 'ENABLED' : 'DISABLED (using mock)'}`);
    }
    if (settings.mcpCalls !== undefined) {
      console.log(`[${this.id}] MCP calls now ${settings.mcpCalls ? 'ENABLED' : 'DISABLED (simulated)'}`);
    }
  }

  async _handleEvent(eventType, payload, event) {
    switch (eventType) {
      case 'proposal:request':
        if (payload.targetAgents?.includes(this.id) || payload.agentType === this.agentType) {
          await this.generateProposal(payload.batchId, payload.proposalType, payload.context);
        }
        return { handled: true };

      case 'proposal:decision_made':
        await this.handleProposalDecision(payload.batchId, payload);
        return { handled: true };

      default:
        return { handled: false };
    }
  }

  getMetrics() {
    const baseMetrics = super.getMetrics();
    return {
      ...baseMetrics,
      competition: this.competitionMetrics,
      activeProposals: this.activeProposals.size,
      proposalHistory: this.proposalHistory.length
    };
  }

  // ========== Utility Methods ==========

  _loadSystemPrompt(agentType) {
    // In real implementation, would load from configuration or files
    const prompts = {
      scene: "You are a Scene Agent for Agent Adventures. Focus on spatial reasoning and asset placement with Z-up coordinates. Always query spatial context first.",
      camera: "You are a Camera Agent for Agent Adventures. Create cinematic shots with proper Isaac Sim Z-up coordinates. Query asset transforms before framing.",
      story: "You are a Story Agent for Agent Adventures. Generate engaging narrative choices that integrate with 3D scene elements."
    };

    return prompts[agentType] || prompts.scene;
  }

  _updateWinRate() {
    const total = this.competitionMetrics.proposalsWon + this.competitionMetrics.proposalsRejected;
    this.competitionMetrics.winRate = total > 0 ? (this.competitionMetrics.proposalsWon / total) * 100 : 0;
  }

  _calculateDistance(pos1, pos2) {
    const dx = pos1[0] - pos2[0];
    const dy = pos1[1] - pos2[1];
    const dz = pos1[2] - pos2[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  _adjustPosition(position, obstaclePos, minDistance) {
    // Simple adjustment: move away from obstacle
    const direction = [
      position[0] - obstaclePos[0],
      position[1] - obstaclePos[1],
      position[2] - obstaclePos[2]
    ];

    const length = Math.sqrt(direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2);
    if (length > 0) {
      const normalized = direction.map(d => d / length);
      return [
        obstaclePos[0] + normalized[0] * minDistance,
        obstaclePos[1] + normalized[1] * minDistance,
        obstaclePos[2] + normalized[2] * minDistance
      ];
    }

    return position;
  }

  // ========== Health Check Override ==========

  async _performHealthCheck() {
    const issues = [];

    // Check LLM client connectivity
    if (this.llmClient && config.tokens.mockLLMMode === false) {
      try {
        // Quick connectivity test - don't count against error metrics
        const testResponse = await this.llmClient.testConnection();
        if (!testResponse.success) {
          issues.push({ type: 'llm-connectivity', message: `${this.llmModel} API not responding` });
        }
      } catch (error) {
        issues.push({ type: 'llm-connectivity', message: `${this.llmModel} connection test failed: ${error.message}` });
      }
    }

    // Check proposal generation capabilities
    if (this.competitionMetrics.proposalsSubmitted === 0 && this.metrics.eventsHandled > 5) {
      issues.push({ type: 'proposal-generation', message: 'No proposals generated despite receiving events' });
    }

    // Be more forgiving with error rates during development
    if (this.metrics.errorsEncountered > 0 && config.isDevelopment) {
      const errorRate = (this.metrics.errorsEncountered / this.metrics.eventsHandled) * 100;
      if (errorRate > 50) { // Much higher threshold in development
        issues.push({ type: 'errors', message: `High error rate: ${errorRate.toFixed(1)}% (development mode)` });
      }
    }

    return issues;
  }

  // ========== Metrics Override ==========

  getMetrics() {
    const baseMetrics = super.getMetrics();
    return {
      ...baseMetrics,
      ...this.competitionMetrics,
      totalTokensUsed: this.competitionMetrics.totalTokensUsed || 0,
      totalCost: this.competitionMetrics.totalCost || 0
    };
  }
}

export default MultiLLMAgent;