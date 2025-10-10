import { BaseAgent } from './base-agent.js';
import { Proposal } from './proposal-system.js';
import { createLLMClient } from '../llm/llm-client.js';
import { config } from '../config/environment.js';

export const BASE_AGENT_PROMPT = [
  'You are part of the Agent Adventures control loop.',
  'Respond with a single JSON object: {"action": <string>, "parameters": <object>, "reasoning": <string>}.',
  'Use meters with Z-up coordinates, validate safety, and only include MCP-ready data.',
  'Keep wording concise; omit any prose outside the JSON.'
].join('\n');

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
    this.proposalRegistry = new Map(); // proposalId -> Proposal

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

    const now = Date.now();
    this.tokenBudgetState = {
      cycleUsed: 0,
      cycleStartedAt: now,
      dailyUsed: 0,
      dailyStamp: this._getDayStamp(now),
      lastUsageAt: null
    };
  }

  // ========== Core Multi-LLM Agent Interface ==========

  /**
   * Generate a proposal for the given context
   * Supports both challenge object format and individual parameters
   */
  async generateProposal(challenge) {
    if (this.state !== 'running') {
      throw new Error(`Agent ${this.id} not running`);
    }

    const { id: batchId, type: proposalType, ...context } = challenge;

    try {
      // Step 1: Query spatial context if needed
      const spatialContext = await this._querySpatialContext(proposalType, context);

      // Step 2: Prepare context for LLM
      const llmContext = this._prepareLLMContext(proposalType, context, spatialContext);

      // Step 3: Generate proposal via LLM
      const proposalData = await this._callLLM(llmContext);

      // Step 4: Validate and enhance proposal
      const enhancedData = await this._enhanceProposal(proposalData, spatialContext);

      // Step 5: Create proposal object
      const proposal = new Proposal(
        this.id,
        this.agentType,
        proposalType,
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
      this.proposalRegistry.set(proposal.id, proposal);
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

    const proposal = this.proposalRegistry.get(proposalId);
    if (!proposal) {
      console.warn(`[${this.id}] Proposal ${proposalId} missing from registry during decision phase.`);
    }

    const won = decision.winningAgentId === this.id;

    if (won) {
      this.competitionMetrics.proposalsWon++;

      // If we won, execute the proposal
      await this._executeProposal(proposal, decision);

    } else {
      this.competitionMetrics.proposalsRejected++;

      // Learn from loss (optional - for future ML enhancement)
      await this._handleProposalLoss(proposal, decision);
    }

    // Update win rate
    this._updateWinRate();

    // Clean up
    this.activeProposals.delete(batchId);
    if (proposalId) {
      this.proposalRegistry.delete(proposalId);
    }

    // Store in history
    this.proposalHistory.push({
      batchId,
      proposalId,
      won,
      decision,
      proposalSnapshot: proposal ? {
        agentId: proposal.agentId,
        proposalType: proposal.proposalType,
        data: proposal.data,
        reasoning: proposal.reasoning
      } : null,
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
      const responseFormat = this._getProposalResponseFormat(llmContext.proposalType);

      // Scene generation (asset_placement) gets significantly more tokens - this is the PRIMARY feature
      const maxTokens = llmContext.proposalType === 'asset_placement'
        ? config.llm[this.llmModel]?.maxTokens || 6000  // Use model-specific max tokens for scenes
        : config.tokens.maxPerProposal;  // Other proposal types use standard budget

      const budgetAllowance = this._ensureTokenBudget(maxTokens);
      if (!budgetAllowance.allowed) {
        console.warn(`[${this.id}] Skipping ${this.llmModel} call: ${budgetAllowance.reason}`);
        return this._budgetFallbackResponse(llmContext, budgetAllowance.reason);
      }

      console.log(`[${this.id}] Making ${this.llmModel} API call (maxTokens: ${maxTokens})...`);

      const startTime = Date.now();
      const response = await this.llmClient.generateCompletion(
        systemPrompt,
        userPrompt,
        {
          maxTokens,
          responseFormat
        }
      );

      // Track token usage
      this._recordTokenUsage(response.usage);
      const totalTokens = response.usage?.totalTokens
        ?? ((response.usage?.promptTokens || 0) + (response.usage?.completionTokens || 0));
      this.competitionMetrics.totalTokensUsed = (this.competitionMetrics.totalTokensUsed || 0) + totalTokens;
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
    return BASE_AGENT_PROMPT;
  }

  /**
   * Format the user prompt for LLM from context
   */
  _formatLLMPrompt(llmContext) {
    const { proposalType, context, spatialContext, agentInfo } = llmContext;

    let prompt = `Task: Generate a ${proposalType} proposal.\n\n`;

    // Add special emphasis for scene/asset_placement tasks
    if (proposalType === 'asset_placement') {
      prompt += `🎯 CRITICAL: This is scene generation - the MOST IMPORTANT part of Agent Adventures. Invest maximum effort here.\n\n`;
      prompt += `Your scene proposal will directly determine the visual quality and audience engagement. Go beyond basic placement - think like a film production designer creating an unforgettable set.\n\n`;
    }

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
        prompt += `\n\nCREATE A COMPLETE SCENE WITH MULTIPLE BATCHES:`;
        prompt += `\n\nYou must organize your scene into 3-5 thematic batches (minimum 3). Each batch should serve a distinct purpose:`;
        prompt += `\n- Foreground/Hero Elements: Primary focal points (2-4 elements)`;
        prompt += `\n- Midground/Structural: Framing, architecture, context (2-6 elements)`;
        prompt += `\n- Background/Atmospheric: Depth, atmosphere, environment (2-4 elements)`;
        prompt += `\n- Optional: Detail layers, lighting elements, narrative props`;
        prompt += `\n\nEach element needs: element_type (cube/sphere/cylinder/cone), name, position [x,y,z], scale [x,y,z], color [r,g,b]`;
        prompt += `\n\nIMPORTANT: Provide rich, thoughtful reasoning explaining:`;
        prompt += `\n- Overall compositional strategy across all batches`;
        prompt += `\n- How each batch layer contributes to depth and visual hierarchy`;
        prompt += `\n- Color palette and lighting design across the full scene`;
        prompt += `\n- Narrative story told through spatial arrangement`;
        prompt += `\n- Emotional journey from foreground to background`;
        break;

      case 'camera_planning':
        prompt += `\n\n🎬 DESIGN CAMERA CHOREOGRAPHY (3-5 shots):`;
        prompt += `\n\nCRITICAL: Create a COHESIVE SHOT SEQUENCE that flows cinematically from shot to shot.`;
        prompt += `\nYour shots should CHAIN TOGETHER - the end of one shot should naturally lead into the start of the next.`;
        prompt += `\n\nAvailable shot types:`;
        prompt += `\n- smoothMove: Linear camera movement between positions with easing`;
        prompt += `\n- arcShot: Cinematic arc movement (standard or dramatic style)`;
        prompt += `\n- orbitShot: Orbital movement around a center point`;
        prompt += `\n\nFor each shot provide:`;
        prompt += `\n- shotType: "smoothMove" | "arcShot" | "orbitShot"`;
        prompt += `\n- start_position: [x, y, z] (starting camera position)`;
        prompt += `\n- end_position: [x, y, z] (ending camera position)`;
        prompt += `\n- start_target: [x, y, z] (what camera looks at initially)`;
        prompt += `\n- end_target: [x, y, z] (what camera looks at finally)`;
        prompt += `\n- duration: number (seconds - vary for pacing)`;
        prompt += `\n- description: string (shot purpose and transition to next)`;
        prompt += `\n- easingType (smoothMove): "ease_in" | "ease_out" | "ease_in_out" | "linear"`;
        prompt += `\n- movementStyle (arcShot): "standard" | "dramatic"`;
        prompt += `\n\nFor orbitShot, also provide:`;
        prompt += `\n- center: [x, y, z] (orbit center point)`;
        prompt += `\n- distance: number (orbit radius)`;
        prompt += `\n- start_azimuth: number (starting angle in degrees)`;
        prompt += `\n- end_azimuth: number (ending angle in degrees)`;
        prompt += `\n- elevation: number (camera height angle)`;
        prompt += `\n\n🎯 SHOT SEQUENCING PRINCIPLES:`;
        prompt += `\n1. ESTABLISH → REVEAL → FOCUS (classic progression)`;
        prompt += `\n   - Start wide to show context, move closer to reveal details, finish on emotional focus`;
        prompt += `\n2. SMOOTH TRANSITIONS: Each shot's end_position should flow into the next shot's start_position`;
        prompt += `\n   - If shot 1 ends at [5, -3, 2], shot 2 should start near [5, -3, 2]`;
        prompt += `\n3. VARY SHOT DURATION: Create rhythm (fast action vs slow reveal)`;
        prompt += `\n   - Quick cuts: 2-3 seconds, Contemplative shots: 4-6 seconds`;
        prompt += `\n4. MAINTAIN VISUAL CONTINUITY: Keep the subject in frame across shots`;
        prompt += `\n   - Don't jump from looking at [0,0,0] to suddenly looking at [10,10,10]`;
        prompt += `\n5. BUILD EMOTIONAL JOURNEY: Each shot should advance the visual story`;
        prompt += `\n\nExample 3-shot sequence:`;
        prompt += `\n• Shot 1 (Wide Establishing): smoothMove from [10, -8, 4] to [8, -6, 3], looking at scene center [0,0,1]`;
        prompt += `\n  Duration: 4s, ease_in_out - "Establish the full environment and spatial context"`;
        prompt += `\n• Shot 2 (Medium Reveal): arcShot from [8, -6, 3] to [5, -4, 2.5], revealing hero element`;
        prompt += `\n  Duration: 3s, dramatic arc - "Sweep closer to reveal the central focal point"`;
        prompt += `\n• Shot 3 (Close Focus): smoothMove from [5, -4, 2.5] to [3, -2, 2], tight on key detail`;
        prompt += `\n  Duration: 3s, ease_out - "Draw viewer's attention to the emotional core"`;
        prompt += `\n\nNotice: Each shot FLOWS into the next, creating one continuous visual narrative`;
        break;

      case 'audio_narration':
        prompt += `\n\nDESIGN AUDIO EXPERIENCE:`;
        prompt += `\n\nCreate atmospheric audio that brings the PLACE to life:`;
        prompt += `\n\n1. NARRATION (story-driven, NOT technical):`;
        prompt += `\n- tone: string (e.g., "contemplative", "mysterious", "awe-inspiring")`;
        prompt += `\n- script: string (the actual narration text)`;
        prompt += `\n  CRITICAL: Narration describes the SETTING and ATMOSPHERE`;
        prompt += `\n  - Focus on what the environment feels like, sounds like, breathes like`;
        prompt += `\n  - May reference implied history/inhabitants without showing them`;
        prompt += `\n  - Think documentary/nature film style - evoke emotion and wonder`;
        prompt += `\n  - DO NOT describe technical design decisions or element placement`;
        prompt += `\n  - DO NOT explain compositional strategy or color theory`;
        prompt += `\n\n2. MUSIC:`;
        prompt += `\n- style: string (genre/mood description)`;
        prompt += `\n- intensity: number (0.0-1.0, how prominent the music is)`;
        prompt += `\n- notes: string (specific musical direction)`;
        prompt += `\n\n3. AMBIENT:`;
        prompt += `\n- environment: string (environmental sound description)`;
        prompt += `\n- effects: array of strings (specific sound effects)`;
        prompt += `\n- volume: number (0.0-1.0, how loud ambient sounds are)`;
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

    console.log(`[${this.id}] 🔍 Parsing ${proposalType} response...`);

    try {
      const structured = this._deserializeLLMContent(content);
      console.log(`[${this.id}] ✓ Deserialized:`, structured ? 'SUCCESS' : 'FAILED');

      if (structured) {
        console.log(`[${this.id}] Structured keys:`, Object.keys(structured));
        if (structured.data) {
          console.log(`[${this.id}] Data keys:`, Object.keys(structured.data));
        }

        const normalized = this._normalizeStructuredResponse(structured, proposalType);
        console.log(`[${this.id}] ✓ Normalized:`, normalized ? 'SUCCESS' : 'FAILED');

        if (normalized) {
          console.log(`[${this.id}] ✅ Using normalized LLM response for ${proposalType}`);
          return {
            ...normalized,
            rawResponse: structured
          };
        } else {
          console.warn(`[${this.id}] ⚠️ Normalization failed for ${proposalType}, falling back to heuristic extraction`);
        }
      } else {
        console.warn(`[${this.id}] ⚠️ Deserialization failed for ${proposalType}, falling back to heuristic extraction`);
      }

      // Fallback to heuristic extraction from text content
      console.log(`[${this.id}] 🔄 Using heuristic extraction for ${proposalType}`);
      const data = this._extractStructuredData(content, proposalType);
      const reasoning = this._extractReasoning(content);

      return {
        data,
        reasoning,
        rawResponse: content
      };
    } catch (error) {
      console.warn(`[${this.id}] ❌ Failed to parse LLM response, using fallback:`, error.message);

      // Fallback to a basic structure
      return this._createFallbackResponse(content, proposalType);
    }
  }

  _deserializeLLMContent(content) {
    if (!content) {
      return null;
    }

    if (typeof content === 'object') {
      return content;
    }

    if (typeof content !== 'string') {
      return null;
    }

    const stripped = this._stripCodeFences(content);
    if (!stripped) {
      return null;
    }

    try {
      return JSON.parse(stripped);
    } catch (error) {
      // Attempt to parse substring containing JSON braces
      const jsonStart = stripped.indexOf('{');
      const jsonEnd = stripped.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const candidate = stripped.slice(jsonStart, jsonEnd + 1);
        try {
          return JSON.parse(candidate);
        } catch (innerError) {
          return null;
        }
      }
      return null;
    }
  }

  _stripCodeFences(text) {
    if (typeof text !== 'string') {
      return '';
    }

    const trimmed = text.trim();
    if (trimmed.startsWith('```')) {
      const fenceEnd = trimmed.lastIndexOf('```');
      if (fenceEnd > 3) {
        return trimmed.slice(trimmed.indexOf('\n') + 1, fenceEnd).trim();
      }
    }
    return trimmed;
  }

  _normalizeStructuredResponse(payload, proposalType) {
    if (!payload || typeof payload !== 'object') {
      console.log(`[${this.id}] Normalization: payload is not an object`);
      return null;
    }

    let reasoning = payload.reasoning || payload.explanation || payload.analysis;
    let data = payload.data || payload.parameters || payload.proposal || null;

    if (!data && payload.action && payload.parameters) {
      data = {
        action: payload.action,
        ...payload.parameters
      };
    }

    if (!data) {
      const proposalData =
        payload.proposal_data ||
        payload.proposalData ||
        (payload.result && (payload.result.data || payload.result.proposal_data));
      if (proposalData && typeof proposalData === 'object') {
        data = proposalData;
      }
    }

    if (!data && this._looksLikeDirectData(payload, proposalType)) {
      data = payload;
    }

    // Some models (e.g., Claude) nest the structured response under the proposalType key
    const altKey = proposalType
      ? proposalType.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
      : null;

    const typedSectionCandidate = proposalType
      ? (payload[proposalType] ?? (altKey ? payload[altKey] : undefined))
      : undefined;

    if ((!data || typeof data !== 'object') && typedSectionCandidate) {
      const typedSection = typedSectionCandidate;
      if (typedSection && typeof typedSection === 'object') {
        const innerData = typedSection.data;
        if (!data && innerData && typeof innerData === 'object') {
          data = innerData;
        } else if (!data) {
          data = typedSection;
        }
        if (!reasoning && typeof typedSection.reasoning === 'string') {
          reasoning = typedSection.reasoning;
        }

        if (proposalType === 'camera_planning' && data) {
          if (data.camera_planning && typeof data.camera_planning === 'object') {
            data = data.camera_planning;
          }

          const resolveShots = () => {
            if (Array.isArray(data.shots)) return data.shots;
            if (Array.isArray(typedSection.shots)) return typedSection.shots;
            if (Array.isArray(typedSection.camera_planning?.shots)) return typedSection.camera_planning.shots;
            if (Array.isArray(typedSection.cameraPlanning?.shots)) return typedSection.cameraPlanning.shots;
            if (Array.isArray(payload.shots)) return payload.shots;
            return null;
          };

          const shots = resolveShots();
          if (shots) {
            const allowedShotKeys = new Set([
              'shotType',
              'start_position',
              'end_position',
              'start_target',
              'end_target',
              'duration',
              'description',
              'easingType',
              'movementStyle',
              'center',
              'distance',
              'start_azimuth',
              'end_azimuth',
              'elevation'
            ]);

            const sanitisedShots = shots
              .filter(shot => shot && typeof shot === 'object')
              .map(shot => {
                const entry = {};
                const resolveValue = (primary, aliases = []) => {
                  if (shot[primary] !== undefined) return shot[primary];
                  for (const alias of aliases) {
                    if (shot[alias] !== undefined) return shot[alias];
                  }
                  return undefined;
                };

                entry.shotType = resolveValue('shotType', ['shot_type']);
                entry.start_position = resolveValue('start_position', ['startPosition']);
                entry.end_position = resolveValue('end_position', ['endPosition']);
                entry.start_target = resolveValue('start_target', ['startTarget']);
                entry.end_target = resolveValue('end_target', ['endTarget']);
                entry.duration = resolveValue('duration');
                entry.description = resolveValue('description');
                entry.easingType = resolveValue('easingType', ['easing_type']);
                entry.movementStyle = resolveValue('movementStyle', ['movement_style']);
                entry.center = resolveValue('center');
                entry.distance = resolveValue('distance');
                entry.start_azimuth = resolveValue('start_azimuth', ['startAzimuth']);
                entry.end_azimuth = resolveValue('end_azimuth', ['endAzimuth']);
                entry.elevation = resolveValue('elevation');

                const sanitised = {};
                for (const key of allowedShotKeys) {
                  if (entry[key] !== undefined) {
                    sanitised[key] = entry[key];
                  }
                }
                return sanitised;
              })
              .filter(shot => Object.keys(shot).length > 0);

            if (sanitisedShots.length > 0) {
              data = { shots: sanitisedShots };
            }
          }
        }
      }
    }

    if (!data || typeof data !== 'object') {
      console.log(`[${this.id}] Normalization: data is not an object or missing`);
      return null;
    }

    // Ensure element_type is present when provided via action context
    if (!data.element_type && data.type) {
      data.element_type = data.type;
    }

    const schema = this._getProposalSchema(proposalType);
    if (schema) {
      // Minimal validation: check that required properties exist
      const required = schema.properties?.data?.required || [];
      const missing = required.filter(key => data[key] === undefined);
      if (missing.length > 0) {
        console.log(`[${this.id}] Normalization: Missing required fields for ${proposalType}:`, missing);
        console.log(`[${this.id}] Normalization: Available data keys:`, Object.keys(data));
        return null;
      }
    }

    console.log(`[${this.id}] Normalization: ✅ All validations passed for ${proposalType}`);
    return {
      data,
      reasoning: reasoning || 'LLM response (structured)'
    };
  }

  _getProposalResponseFormat(proposalType) {
    const schema = this._getProposalSchema(proposalType);

    if (!schema) {
      return null;
    }

    const example = this._getProposalExample(proposalType);
    const name = `${proposalType}_response`.replace(/[^a-zA-Z0-9_]/g, '_');

    return {
      type: 'json_schema',
      name,
      strict: true,
      schema,
      ...(example ? { examples: [example] } : {})
    };
  }

  _getProposalSchema(proposalType) {
    switch (proposalType) {
      case 'asset_placement':
        return {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'reasoning'],
          properties: {
            data: {
              type: 'object',
              additionalProperties: false,
              required: ['batches'],
              properties: {
                batches: {
                  type: 'array',
                  description: 'Array of batch groups - organize your scene into 3-5 thematic batches',
                  minItems: 3,
                  maxItems: 12,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['batch_name', 'elements'],
                    properties: {
                      batch_name: {
                        type: 'string',
                        description: 'Descriptive name for this batch group (e.g., "foreground_hero_elements", "background_atmosphere", "environmental_details")'
                      },
                      elements: {
                        type: 'array',
                        description: 'Elements within this batch',
                        minItems: 1,
                        maxItems: 8,
                        items: {
                          type: 'object',
                          additionalProperties: true,
                          required: ['element_type', 'name', 'position'],
                          properties: {
                            element_type: { type: 'string', description: 'Type: cube, sphere, cylinder, cone' },
                            name: { type: 'string', description: 'Unique descriptive name' },
                            position: {
                              type: 'array',
                              description: 'World position [x, y, z] in meters (Z-up)',
                              minItems: 3,
                              maxItems: 3,
                              items: { type: 'number' }
                            },
                            scale: {
                              type: 'array',
                              description: 'Scale multipliers [x, y, z]',
                              minItems: 3,
                              maxItems: 3,
                              items: { type: 'number' }
                            },
                            color: {
                              type: 'array',
                              description: 'RGB color [r, g, b] normalized 0-1',
                              minItems: 3,
                              maxItems: 3,
                              items: {
                                type: 'number',
                                minimum: 0,
                                maximum: 1
                              }
                            },
                            parent_path: {
                              type: 'string',
                              description: 'USD parent path (default: /World)'
                            }
                          }
                        }
                      },
                      description: {
                        type: 'string',
                        description: 'Purpose and role of this batch in the overall scene'
                      }
                    }
                  }
                }
              }
            },
            reasoning: { type: 'string' },
            metadata: {
              type: 'object',
              additionalProperties: true
            }
          }
        };

      case 'camera_move':
        return {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'reasoning'],
          properties: {
            data: {
              type: 'object',
              additionalProperties: true,
              required: ['target_position', 'target_look_at', 'movement_duration'],
              properties: {
                target_position: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 3,
                  items: { type: 'number' }
                },
                target_look_at: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 3,
                  items: { type: 'number' }
                },
                movement_duration: { type: 'number', minimum: 0 }
              }
            },
            reasoning: { type: 'string' },
            metadata: {
              type: 'object',
              additionalProperties: true
            }
          }
        };

      case 'camera_planning':
        return {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'reasoning'],
          properties: {
            data: {
              type: 'object',
              additionalProperties: false,
              required: ['shots'],
              properties: {
                shots: {
                  type: 'array',
                  description: 'Array of camera shots for cinematography',
                  minItems: 3,
                  maxItems: 5,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['shotType', 'duration', 'description'],
                    properties: {
                      shotType: { type: 'string', enum: ['smoothMove', 'arcShot', 'orbitShot'] },
                      start_position: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
                      end_position: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
                      start_target: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
                      end_target: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
                      duration: { type: 'number', minimum: 0.5 },
                      description: { type: 'string' },
                      easingType: { type: 'string', enum: ['ease_in', 'ease_out', 'ease_in_out', 'linear'] },
                      movementStyle: { type: 'string', enum: ['standard', 'dramatic'] },
                      center: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'number' } },
                      distance: { type: 'number' },
                      start_azimuth: { type: 'number' },
                      end_azimuth: { type: 'number' },
                      elevation: { type: 'number' }
                    }
                  }
                }
              }
            },
            reasoning: { type: 'string' }
          }
        };

      case 'audio_narration':
        return {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'reasoning'],
          properties: {
            data: {
              type: 'object',
              additionalProperties: false,
              required: ['narration', 'music', 'ambient'],
              properties: {
                narration: {
                  type: 'object',
                  required: ['tone', 'script'],
                  properties: {
                    tone: { type: 'string' },
                    script: { type: 'string' }
                  }
                },
                music: {
                  type: 'object',
                  required: ['style', 'intensity', 'notes'],
                  properties: {
                    style: { type: 'string' },
                    intensity: { type: 'number', minimum: 0, maximum: 1 },
                    notes: { type: 'string' }
                  }
                },
                ambient: {
                  type: 'object',
                  required: ['environment', 'effects', 'volume'],
                  properties: {
                    environment: { type: 'string' },
                    effects: { type: 'array', items: { type: 'string' } },
                    volume: { type: 'number', minimum: 0, maximum: 1 }
                  }
                }
              }
            },
            reasoning: { type: 'string' }
          }
        };

      case 'story_advance':
        return {
          type: 'object',
          additionalProperties: false,
          required: ['data', 'reasoning'],
          properties: {
            data: {
              type: 'object',
              additionalProperties: true,
              required: ['story_beat', 'choices'],
              properties: {
                story_beat: { type: 'string' },
                choices: {
                  type: 'array',
                  items: {
                    oneOf: [
                      { type: 'string' },
                      {
                        type: 'object',
                        additionalProperties: true,
                        required: ['id', 'text'],
                        properties: {
                          id: { type: 'string' },
                          text: { type: 'string' },
                          consequence: { type: 'string' }
                        }
                      }
                    ]
                  }
                }
              }
            },
            reasoning: { type: 'string' },
            metadata: {
              type: 'object',
              additionalProperties: true
            }
          }
        };

      default:
        return null;
    }
  }

  _getProposalExample(proposalType) {
    switch (proposalType) {
      case 'asset_placement':
        return {
          data: {
            batches: [
              {
                batch_name: 'foreground_hero_elements',
                description: 'Primary focal points that draw immediate attention',
                elements: [
                  {
                    element_type: 'cube',
                    name: 'hero_pedestal',
                    position: [0, 0, 0.5],
                    scale: [2.0, 2.0, 1.0],
                    color: [0.7, 0.6, 0.5]
                  },
                  {
                    element_type: 'sphere',
                    name: 'mystical_orb',
                    position: [0, 0, 2.0],
                    scale: [0.8, 0.8, 0.8],
                    color: [0.2, 0.6, 0.9]
                  }
                ]
              },
              {
                batch_name: 'architectural_framing',
                description: 'Structural elements that frame the scene and establish scale',
                elements: [
                  {
                    element_type: 'cylinder',
                    name: 'left_pillar',
                    position: [-3.0, 0, 2.5],
                    scale: [0.5, 0.5, 5.0],
                    color: [0.5, 0.5, 0.6]
                  },
                  {
                    element_type: 'cylinder',
                    name: 'right_pillar',
                    position: [3.0, 0, 2.5],
                    scale: [0.5, 0.5, 5.0],
                    color: [0.5, 0.5, 0.6]
                  }
                ]
              },
              {
                batch_name: 'atmospheric_background',
                description: 'Environmental details that create depth and atmosphere',
                elements: [
                  {
                    element_type: 'cube',
                    name: 'distant_platform',
                    position: [0, -8.0, 0.2],
                    scale: [6.0, 4.0, 0.4],
                    color: [0.3, 0.3, 0.4]
                  },
                  {
                    element_type: 'sphere',
                    name: 'ambient_light_source',
                    position: [0, -5.0, 8.0],
                    scale: [1.5, 1.5, 1.5],
                    color: [1.0, 0.9, 0.7]
                  }
                ]
              }
            ]
          },
          reasoning: 'Three-layer composition: foreground hero elements create focus with contrasting cube/sphere shapes, architectural pillars frame the scene and establish scale, background elements add depth and atmospheric lighting. The blue mystical orb draws the eye upward while warm background lighting creates inviting ambiance.'
        };

      case 'camera_move':
        return {
          data: {
            target_position: [4.5, -3.2, 2.1],
            target_look_at: [0, 0, 1.5],
            movement_duration: 2.5
          },
          reasoning: 'Sweeps toward the artifact to highlight magical glow while maintaining viewer orientation.'
        };

      case 'story_advance':
        return {
          data: {
            story_beat: 'artifact_choice',
            choices: [
              { id: 'investigate', text: 'Approach the artifact closely', consequence: 'risk_high_reward' },
              { id: 'observe', text: 'Study from a distance', consequence: 'info_gain' },
              { id: 'retreat', text: 'Call for reinforcements', consequence: 'delay' }
            ]
          },
          reasoning: 'Offers three divergent paths balancing danger, information, and safety for audience voting.'
        };

      default:
        return null;
    }
  }

  _ensureTokenBudget(requestedTokens) {
    if (!config.tokens.enforceBudgets) {
      return { allowed: true };
    }

    this._refreshTokenWindows();

    const { cycleBudget, dailyBudget } = config.tokens;

    if (cycleBudget > 0 && requestedTokens > cycleBudget) {
      return { allowed: false, reason: 'requested tokens exceed cycle budget' };
    }

    if (cycleBudget > 0 && this.tokenBudgetState.cycleUsed + requestedTokens > cycleBudget) {
      return { allowed: false, reason: 'cycle token budget exceeded' };
    }

    if (dailyBudget > 0 && this.tokenBudgetState.dailyUsed + requestedTokens > dailyBudget) {
      return { allowed: false, reason: 'daily token budget exceeded' };
    }

    return { allowed: true };
  }

  _refreshTokenWindows() {
    const now = Date.now();

    if (config.tokens.cycleWindowMs > 0) {
      const elapsed = now - this.tokenBudgetState.cycleStartedAt;
      if (elapsed >= config.tokens.cycleWindowMs) {
        this.tokenBudgetState.cycleStartedAt = now;
        this.tokenBudgetState.cycleUsed = 0;
      }
    }

    const currentStamp = this._getDayStamp(now);
    if (currentStamp !== this.tokenBudgetState.dailyStamp) {
      this.tokenBudgetState.dailyStamp = currentStamp;
      this.tokenBudgetState.dailyUsed = 0;
    }
  }

  _recordTokenUsage(usage = {}) {
    if (!config.tokens.enableTracking) {
      return;
    }

    const total = usage.totalTokens
      ?? ((usage.promptTokens || 0) + (usage.completionTokens || 0));

    if (!total || total <= 0) {
      return;
    }

    this.tokenBudgetState.cycleUsed += total;
    this.tokenBudgetState.dailyUsed += total;
    this.tokenBudgetState.lastUsageAt = Date.now();
  }

  _getDayStamp(reference = Date.now()) {
    return new Date(reference).toISOString().slice(0, 10);
  }

  _budgetFallbackResponse(llmContext, reason) {
    const fallback = this._mockLLMResponse(llmContext);
    fallback.reasoning = `${fallback.reasoning} (fallback due to ${reason})`;
    return {
      ...fallback,
      rawResponse: { fallback: true, reason }
    };
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
      case 'camera_planning':
        // camera_planning should come as structured JSON from LLM
        // If we reach here, parsing failed - return minimal fallback
        console.warn(`[${this.id}] camera_planning fell through to heuristic extraction - this should not happen`);
        return { shots: [] };
      case 'audio_narration':
        // audio_narration should come as structured JSON from LLM
        // If we reach here, parsing failed - return minimal fallback
        console.warn(`[${this.id}] audio_narration fell through to heuristic extraction - this should not happen`);
        return {
          narration: { tone: 'neutral', script: 'Scene introduction' },
          music: { style: 'ambient', intensity: 0.3, notes: 'Background music' },
          ambient: { environment: 'Indoor space', effects: [], volume: 0.2 }
        };
      case 'story_advance':
        return this._parseStoryAdvanceData(content);
      default:
        throw new Error(`Unknown proposal type: ${proposalType}`);
    }
  }

  _looksLikeDirectData(payload, proposalType) {
    if (!payload || typeof payload !== 'object') {
      return false;
    }

    switch (proposalType) {
      case 'camera_planning':
        return Array.isArray(payload.shots);
      case 'audio_narration':
        return (
          typeof payload.narration === 'object' ||
          typeof payload.music === 'object' ||
          typeof payload.ambient === 'object'
        );
      case 'asset_placement':
        return Array.isArray(payload.batches);
      default:
        return false;
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
    if (content && typeof content === 'object') {
      return content.reasoning || content.explanation || content.analysis || 'Structured response';
    }

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
        batches: [
          {
            batch_name: 'fallback_batch',
            description: 'Fallback scene elements',
            elements: [
              {
                element_type: 'cube',
                name: `fallback_cube_${Date.now()}`,
                position: [0, 0, 0.5],
                scale: [1, 1, 1],
                color: [0.5, 0.5, 0.5]
              }
            ]
          }
        ]
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
            batches: [
              {
                batch_name: 'claude_thoughtful_composition',
                description: 'Carefully considered placement with narrative flow',
                elements: [
                  {
                    element_type: 'cube',
                    name: `thoughtful_cube_${Date.now()}`,
                    position: [5, 3, 0.5],
                    scale: [1, 1, 1],
                    color: [0.6, 0.4, 0.7]
                  },
                  {
                    element_type: 'sphere',
                    name: `accent_sphere_${Date.now()}`,
                    position: [3, 5, 1.0],
                    scale: [0.8, 0.8, 0.8],
                    color: [0.4, 0.6, 0.8]
                  }
                ]
              },
              {
                batch_name: 'claude_background_elements',
                description: 'Supporting elements for depth',
                elements: [
                  {
                    element_type: 'cylinder',
                    name: `support_pillar_${Date.now()}`,
                    position: [0, 8, 2.5],
                    scale: [0.3, 0.3, 5.0],
                    color: [0.5, 0.5, 0.5]
                  }
                ]
              },
              {
                batch_name: 'claude_atmospheric_layer',
                description: 'Atmospheric depth elements',
                elements: [
                  {
                    element_type: 'cube',
                    name: `platform_${Date.now()}`,
                    position: [0, 10, 0.1],
                    scale: [4.0, 2.0, 0.2],
                    color: [0.3, 0.3, 0.4]
                  }
                ]
              }
            ]
          },
          reasoning: 'Three-layer composition: foreground focal points, structural supports, and atmospheric depth'
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
            batches: [
              {
                batch_name: 'gemini_bold_centerpiece',
                description: 'Dynamic visual statement',
                elements: [
                  {
                    element_type: 'sphere',
                    name: `dynamic_sphere_${Date.now()}`,
                    position: [0, 0, 2.0],
                    scale: [1.5, 1.5, 1.5],
                    color: [1.0, 0.3, 0.1]
                  },
                  {
                    element_type: 'cone',
                    name: `accent_cone_${Date.now()}`,
                    position: [-2, 2, 1.5],
                    scale: [0.8, 0.8, 1.5],
                    color: [0.9, 0.6, 0.2]
                  }
                ]
              },
              {
                batch_name: 'gemini_framing_structure',
                description: 'Architectural framing elements',
                elements: [
                  {
                    element_type: 'cube',
                    name: `frame_left_${Date.now()}`,
                    position: [-4, 0, 1.0],
                    scale: [0.5, 0.5, 2.0],
                    color: [0.7, 0.4, 0.2]
                  },
                  {
                    element_type: 'cube',
                    name: `frame_right_${Date.now()}`,
                    position: [4, 0, 1.0],
                    scale: [0.5, 0.5, 2.0],
                    color: [0.7, 0.4, 0.2]
                  }
                ]
              },
              {
                batch_name: 'gemini_background_atmosphere',
                description: 'Environmental depth and lighting',
                elements: [
                  {
                    element_type: 'sphere',
                    name: `light_source_${Date.now()}`,
                    position: [0, -5, 5.0],
                    scale: [1.0, 1.0, 1.0],
                    color: [1.0, 0.9, 0.7]
                  }
                ]
              }
            ]
          },
          reasoning: 'Bold central sphere creates focal point, framing cubes establish boundaries, background lighting adds atmospheric depth'
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
  async _executeProposal(proposalOrId, decision) {
    const proposalId = typeof proposalOrId === 'string'
      ? proposalOrId
      : proposalOrId?.id;

    console.log(`[${this.id}] Executing winning proposal: ${proposalId}`);

    this.emitEvent('agent:proposal_executed', {
      agentId: this.id,
      proposalId,
      proposal: typeof proposalOrId === 'object' ? proposalOrId : null,
      decision
    });
  }

  /**
   * Handle proposal loss - learn for future improvements
   */
  async _handleProposalLoss(proposalOrId, decision) {
    const proposalId = typeof proposalOrId === 'string'
      ? proposalOrId
      : proposalOrId?.id;
    // Optional: Store loss information for future ML training
    console.log(`[${this.id}] Proposal lost to ${decision.winningAgentId}: ${decision.reasoning}`);
    if (proposalId) {
      console.log(`[${this.id}] Losing proposal id: ${proposalId}`);
    }
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
          await this.generateProposal({
            id: payload.batchId,
            type: payload.proposalType,
            ...payload.context
          });
        }
        return { handled: true };

      case 'proposal:decision_made':
        await this.handleProposalDecision(payload.batchId, payload);
        return { handled: true };

      default:
        return { handled: false };
    }
  }



  // ========== Utility Methods ==========

  _loadSystemPrompt(agentType) {
    // In real implementation, would load from configuration or files
    const prompts = {
      scene: `You are a Scene Agent for Agent Adventures, responsible for the MOST CRITICAL aspect of the entire workflow: creating compelling, detailed 3D scenes.

IMPORTANCE: Scene generation is the PRIMARY FEATURE of this system. Dedicate maximum effort and creativity to crafting rich, immersive environments. This is where you should invest the most thought, detail, and computational resources.

Your scene proposals should be:
- Highly detailed with thoughtful spatial composition
- Visually striking and narratively meaningful
- Demonstrating sophisticated spatial reasoning with Z-up coordinates
- Creating multiple interconnected elements that tell a story
- Showing deep consideration of lighting, scale, color harmony, and spatial relationships

Always query spatial context first and create scenes that viewers will remember. This is the cornerstone of Agent Adventures - make it exceptional.`,

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
