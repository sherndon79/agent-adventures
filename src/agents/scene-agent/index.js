import { MultiLLMAgent } from '../../core/multi-llm-agent.js';
import { Proposal } from '../../core/proposal-system.js';
import { config } from '../../config/environment.js';
import { SCENE_AGENT_PERSONAS } from './personas.js';

/**
 * Scene Agent Implementation - Multi-LLM competitive agent for 3D scene design
 * Handles asset placement, spatial reasoning, and environment creation in Isaac Sim
 */
export class SceneAgent extends MultiLLMAgent {
  constructor(id, llmModel, config = {}, dependencies = {}) {
    super(id, 'scene', llmModel, config, dependencies);

    // Scene-specific configuration
    this.sceneConfig = {
      maxProposalsPerBatch: config.maxProposalsPerBatch || 3,
      spatialQueryRadius: config.spatialQueryRadius || 5.0,
      minObjectSeparation: config.minObjectSeparation || 1.0,
      enableCollisionAvoidance: config.enableCollisionAvoidance !== false,
      preferredAssetTypes: config.preferredAssetTypes || ['cube', 'sphere', 'cylinder'],
      ...config
    };

    // Scene-specific metrics
    this.sceneMetrics = {
      assetsPlaced: 0,
      collisionsAvoided: 0,
      spatialQueriesPerformed: 0,
      averagePlacementTime: 0,
      successfulPlacements: 0
    };

    // Asset tracking
    this.placedAssets = new Map(); // assetId -> placement info
    this.pendingPlacements = new Set();
  }

  // ========== Scene Agent Specific Methods ==========

  /**
   * Generate asset placement proposal
   */
  async generateAssetPlacementProposal(batchId, context) {
    const startTime = Date.now();

    try {
      // Step 1: Analyze placement requirements
      const placementRequirements = this._analyzePlacementRequirements(context);

      // Step 2: Query spatial context with enhanced scene analysis
      const spatialContext = await this._performEnhancedSpatialQuery(
        placementRequirements.targetArea,
        this.sceneConfig.spatialQueryRadius
      );

      // Step 3: Determine safe placement position
      const safePosition = await this._calculateSafePlacement(
        placementRequirements,
        spatialContext
      );

      // Step 4: Select appropriate asset type and properties
      const assetProperties = await this._selectAssetProperties(
        placementRequirements,
        spatialContext,
        safePosition
      );

      // Step 5: Generate LLM-specific proposal
      const proposalData = await this._generateSceneProposal(
        placementRequirements,
        spatialContext,
        safePosition,
        assetProperties
      );

      // Step 6: Validate proposal thoroughly
      const validation = await this._validateSceneProposal(proposalData, spatialContext);
      if (!validation.valid) {
        throw new Error(`Scene proposal validation failed: ${validation.errors.join(', ')}`);
      }

      // Create and submit proposal
      const proposal = new Proposal(
        this.id,
        this.agentType,
        'asset_placement',
        proposalData.data,
        proposalData.reasoning
      );

      // Track metrics
      const placementTime = Date.now() - startTime;
      this._updateSceneMetrics(placementTime, true);

      return proposal;

    } catch (error) {
      console.error(`[${this.id}] Asset placement proposal failed:`, error);
      this._updateSceneMetrics(Date.now() - startTime, false);
      throw error;
    }
  }

  /**
   * Enhanced spatial query for scene analysis
   */
  async _performEnhancedSpatialQuery(targetArea, radius) {
    this.sceneMetrics.spatialQueriesPerformed++;

    const spatialData = {
      scene: null,
      nearby: null,
      groundLevel: null,
      bounds: null,
      density: null
    };

    // Check if we should use mock mode for MCP specifically
    if (!this.platformSettings.mcpCalls || !this.mcpClients.worldBuilder) {
      console.log(`[${this.id}] Using mock spatial data (mcpCalls: ${this.platformSettings.mcpCalls}, mcpClient: ${!!this.mcpClients.worldBuilder})`);
      return this._getMockSpatialData(targetArea, radius);
    }

    try {
      // Get overall scene state
      if (this.mcpClients.worldBuilder) {
        const sceneResult = await this.mcpClients.worldBuilder.getScene(true);
        spatialData.scene = sceneResult.success ? sceneResult.result : {};
      }

      // Query objects near target area
      if (targetArea && this.mcpClients.worldBuilder) {
        const nearbyResult = await this.mcpClients.worldBuilder.queryObjectsNearPoint(
          targetArea, radius
        );
        spatialData.nearby = nearbyResult.success ? nearbyResult.result : {};
      }

      // Find ground level at target
      if (targetArea && this.mcpClients.worldBuilder) {
        const groundResult = await this.mcpClients.worldBuilder.findGroundLevel(targetArea);
        spatialData.groundLevel = groundResult.success ? groundResult.result : { ground_level: 0.0 };
      }

      // Calculate area bounds if we have nearby objects
      if (spatialData.nearby?.objects?.length > 0) {
        const objectPaths = spatialData.nearby.objects.map(obj => obj.usd_path).filter(Boolean);
        if (objectPaths.length > 0 && this.mcpClients.worldBuilder) {
          const boundsResult = await this.mcpClients.worldBuilder.calculateBounds(objectPaths);
          spatialData.bounds = boundsResult.success ? boundsResult.result : null;
        }
      }

      // Calculate spatial density
      spatialData.density = this._calculateSpatialDensity(spatialData.nearby, radius);

      return spatialData;

    } catch (error) {
      console.warn(`[${this.id}] Enhanced spatial query failed:`, error.message);
      return spatialData; // Return partial data
    }
  }

  /**
   * Analyze placement requirements from context
   */
  _analyzePlacementRequirements(context) {
    return {
      targetArea: context.target_position || context.focus_point || [0, 0, 0],
      assetType: context.asset_type || 'auto',
      purpose: context.purpose || 'decoration',
      storyRelevance: context.story_context || 'neutral',
      visualPriority: context.visual_priority || 'medium',
      interactionRequired: context.interaction_required || false,
      scaleConstraints: context.scale_constraints || [0.5, 3.0], // min, max scale
      colorPreference: context.color_preference || 'auto'
    };
  }

  /**
   * Calculate safe placement position avoiding collisions
   */
  async _calculateSafePlacement(requirements, spatialContext) {
    let candidatePosition = [...requirements.targetArea];

    // Ensure proper ground level
    if (spatialContext.groundLevel?.ground_level !== undefined) {
      const groundLevel = spatialContext.groundLevel.ground_level;
      candidatePosition[2] = Math.max(candidatePosition[2], groundLevel + 0.1);
    }

    // Avoid collisions with nearby objects
    if (this.sceneConfig.enableCollisionAvoidance && spatialContext.nearby?.objects) {
      candidatePosition = this._avoidCollisions(
        candidatePosition,
        spatialContext.nearby.objects,
        this.sceneConfig.minObjectSeparation
      );

      this.sceneMetrics.collisionsAvoided++;
    }

    // Ensure Z-up compliance
    if (candidatePosition[2] < 0) {
      console.warn(`[${this.id}] Correcting negative Z position:`, candidatePosition);
      candidatePosition[2] = Math.abs(candidatePosition[2]);
    }

    return candidatePosition;
  }

  /**
   * Select appropriate asset properties based on context
   */
  async _selectAssetProperties(requirements, spatialContext, position) {
    // Model-specific asset selection
    const modelPreferences = {
      claude: {
        preferredTypes: ['cube', 'cylinder'],
        colorTendency: 'muted',
        scaleTendency: 'conservative'
      },
      gemini: {
        preferredTypes: ['sphere', 'cone'],
        colorTendency: 'vibrant',
        scaleTendency: 'bold'
      },
      gpt: {
        preferredTypes: ['cube', 'sphere', 'cylinder'],
        colorTendency: 'balanced',
        scaleTendency: 'adaptive'
      }
    };

    const preferences = modelPreferences[this.llmModel] || modelPreferences.claude;

    // Select asset type
    let assetType = requirements.assetType;
    if (assetType === 'auto') {
      assetType = this._selectPreferredAssetType(preferences, spatialContext);
    }

    // Determine scale based on available space and purpose
    const scale = this._calculateAssetScale(
      requirements,
      spatialContext,
      preferences.scaleTendency
    );

    // Select color based on model preference and context
    const color = this._selectAssetColor(
      requirements,
      preferences.colorTendency,
      spatialContext
    );

    return {
      element_type: assetType,
      scale,
      color,
      properties: {
        purpose: requirements.purpose,
        story_relevance: requirements.storyRelevance,
        visual_priority: requirements.visualPriority
      }
    };
  }

  /**
   * Generate scene proposal using LLM-specific logic
   */
  async _generateSceneProposal(requirements, spatialContext, position, assetProperties) {
    // Prepare context for LLM
    const llmContext = {
      requirements,
      spatialContext: this._summarizeSpatialContext(spatialContext),
      position,
      assetProperties,
      sceneState: this.dependencies.storyState?.getPath('scene') || {},
      narrativeState: this.dependencies.storyState?.getPath('narrative') || {}
    };

    // Model-specific reasoning and approach
    const modelSpecificData = this._generateModelSpecificProposal(llmContext);

    return {
      data: {
        element_type: assetProperties.element_type,
        name: this._generateAssetName(assetProperties, requirements),
        position: position,
        scale: assetProperties.scale,
        color: assetProperties.color,
        ...modelSpecificData.additionalData
      },
      reasoning: modelSpecificData.reasoning
    };
  }

  /**
   * Generate model-specific proposal variations
   */
  _generateModelSpecificProposal(context) {
    const persona = SCENE_AGENT_PERSONAS[this.llmModel] || SCENE_AGENT_PERSONAS.default;

    const placeholders = this._buildPersonaPlaceholders(context);
    this._applyPersonaAugmentations(this.llmModel, context, placeholders);

    const reasoning = persona.reasoningTemplate
      ? this._fillPersonaTemplate(persona.reasoningTemplate, placeholders)
      : this._fillPersonaTemplate(SCENE_AGENT_PERSONAS.default.reasoningTemplate, placeholders);

    const metadata = {
      ...(persona.metadata || {}),
      ...(placeholders.metadataOverrides || {})
    };

    for (const key of Object.keys(metadata)) {
      if (metadata[key] === undefined || metadata[key] === null) {
        delete metadata[key];
      }
    }

    return {
      reasoning,
      additionalData: Object.keys(metadata).length > 0 ? { metadata } : {}
    };
  }

  _buildPersonaPlaceholders(context) {
    const { requirements, spatialContext, position, assetProperties } = context;

    const positionStr = position.map(p => Number.parseFloat(p || 0).toFixed(1)).join(',');
    const scale = assetProperties.scale || [1, 1, 1];
    const scaleStr = scale.map(s => Number.parseFloat(s || 1).toFixed(1)).join(',');
    const color = assetProperties.color || [];
    const colorStr = color.length > 0
      ? color.map(c => Number.parseFloat(c).toFixed(2)).join(',')
      : 'auto';

    const nearbyCount = spatialContext.nearby?.total_found
      ?? spatialContext.nearby?.count
      ?? 0;
    const densityValue = typeof spatialContext.density === 'number'
      ? spatialContext.density
      : 0;
    const densityStr = densityValue > 0 ? densityValue.toFixed(2) : 'unknown';
    const groundLevel = spatialContext.groundLevel?.ground_level;
    const groundLevelStr = typeof groundLevel === 'number'
      ? groundLevel.toFixed(1)
      : '0.0';

    const spatialAnalysis = `ground=${groundLevelStr} nearby=${nearbyCount} density=${densityStr}`;
    const safetyCheck = nearbyCount > 0
      ? `${nearbyCount} objects checked, ${this.sceneConfig.minObjectSeparation}m separation ensured`
      : 'clear placement area confirmed';

    return {
      elementType: assetProperties.element_type,
      position: positionStr,
      scale: scaleStr,
      color: colorStr,
      density: densityStr,
      nearbyCount,
      spatialAnalysis,
      safetyCheck,
      purpose: requirements.purpose,
      storyRelevance: requirements.storyRelevance || 'neutral',
      narrativeConnection: this._describeNarrativeConnection(requirements, assetProperties)
    };
  }

  _applyPersonaAugmentations(personaKey, context, placeholders) {
    const { spatialContext, position, assetProperties } = context;

    switch (personaKey) {
      case 'gemini': {
        const visualStrategy = this._determineVisualStrategy(spatialContext, position);
        const compositionEffect = this._calculateCompositionEffect(spatialContext, assetProperties);
        placeholders.visualStrategy = visualStrategy || 'visual_focus';
        placeholders.compositionEffect = compositionEffect || 'visual_enhancement';
        if (typeof this._identifyDramaticElements === 'function') {
          placeholders.dramaticElements = this._identifyDramaticElements(position, assetProperties);
        } else {
          placeholders.dramaticElements = 'dynamic_balance';
        }
        break;
      }
      case 'gpt': {
        if (typeof this._determineOptimizationStrategy === 'function') {
          placeholders.optimizationStrategy = this._determineOptimizationStrategy(spatialContext, context.requirements)
            || 'multi_factor_optimized';
        }
        if (typeof this._analyzePurposeBalance === 'function') {
          placeholders.purposeBalance = this._analyzePurposeBalance(context.requirements, spatialContext)
            || 'scene_enhancement';
        }
        if (typeof this._identifyAdaptiveElements === 'function') {
          placeholders.adaptiveElements = this._identifyAdaptiveElements(spatialContext, assetProperties)
            || 'adaptive_balance';
        }
        if (typeof this._getBalanceFactors === 'function' || typeof this._getAudienceConsiderations === 'function') {
          placeholders.metadataOverrides = {
            ...(placeholders.metadataOverrides || {}),
            balance_factors: typeof this._getBalanceFactors === 'function'
              ? this._getBalanceFactors(context.requirements, spatialContext)
              : undefined,
            audience_considerations: typeof this._getAudienceConsiderations === 'function'
              ? this._getAudienceConsiderations(context.requirements)
              : undefined
          };
        }
        if (typeof this._calculateAdaptabilityScore === 'function') {
          placeholders.adaptabilityScore = this._calculateAdaptabilityScore(spatialContext);
        }
        break;
      }
      case 'claude':
      default:
        break;
    }
  }

  _fillPersonaTemplate(template, placeholders) {
    return template.replace(/{{(.*?)}}/g, (_, key) => {
      const value = placeholders[key.trim()];
      return value !== undefined && value !== null ? String(value) : '';
    });
  }

  _describeNarrativeConnection(requirements, assetProperties) {
    const purpose = requirements.purpose || 'environmental';
    const storyRelevance = requirements.storyRelevance || 'neutral';
    const elementLabel = assetProperties?.element_type || 'element';

    if (storyRelevance !== 'neutral') {
      return `${elementLabel} supports ${storyRelevance} story element for ${purpose} purpose, positioned for character interaction and scene continuity`;
    }

    return `thoughtful ${elementLabel} placement for ${purpose}, maintaining spatial harmony and narrative potential`;
  }

  /**
   * Execute winning asset placement via MCP
   */
  async executeAssetPlacement(proposal, decision) {
    const startTime = Date.now();

    try {
      if (!this.mcpClients.worldBuilder) {
        throw new Error('WorldBuilder MCP client not available');
      }

      // Track placement start
      this.pendingPlacements.add(proposal.id);

      // Execute placement via MCP
      const result = await this.mcpClients.worldBuilder.addElement(
        proposal.data.element_type,
        proposal.data.name,
        proposal.data.position,
        {
          scale: proposal.data.scale,
          color: proposal.data.color
        }
      );

      if (!result.success) {
        throw new Error(`MCP placement failed: ${result.error}`);
      }

      // Track successful placement
      this.placedAssets.set(proposal.data.name, {
        proposal,
        decision,
        mcpResult: result.result,
        placementTime: Date.now() - startTime,
        timestamp: Date.now()
      });

      this.sceneMetrics.assetsPlaced++;
      this.sceneMetrics.successfulPlacements++;

      // Emit success event
      this.emitEvent('scene:asset_placed', {
        agentId: this.id,
        assetName: proposal.data.name,
        position: proposal.data.position,
        usdPath: result.result.usd_path
      });

      console.log(`[${this.id}] Successfully placed asset: ${proposal.data.name}`);

    } catch (error) {
      console.error(`[${this.id}] Asset placement execution failed:`, error);

      this.emitEvent('scene:placement_failed', {
        agentId: this.id,
        proposalId: proposal.id,
        error: error.message
      });

      throw error;
    } finally {
      this.pendingPlacements.delete(proposal.id);
    }
  }

  // ========== Utility Methods ==========

  _calculateSpatialDensity(nearbyData, radius) {
    if (!nearbyData?.objects) return 0;

    const objectCount = nearbyData.objects.length;
    const searchVolume = (4/3) * Math.PI * Math.pow(radius, 3); // Sphere volume
    return objectCount / searchVolume; // Objects per unit volume
  }

  _avoidCollisions(position, nearbyObjects, minSeparation) {
    let safePosition = [...position];

    for (const obj of nearbyObjects) {
      if (!obj.position) continue;

      const distance = this._calculateDistance(safePosition, obj.position);
      if (distance < minSeparation) {
        // Move away from collision
        const direction = [
          safePosition[0] - obj.position[0],
          safePosition[1] - obj.position[1],
          safePosition[2] - obj.position[2]
        ];

        const length = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);
        if (length > 0) {
          const normalized = direction.map(d => d / length);
          safePosition = [
            obj.position[0] + normalized[0] * minSeparation,
            obj.position[1] + normalized[1] * minSeparation,
            obj.position[2] + normalized[2] * minSeparation
          ];
        }
      }
    }

    return safePosition;
  }

  _selectPreferredAssetType(preferences, spatialContext) {
    // Simple selection based on model preferences and scene context
    const available = this.sceneConfig.preferredAssetTypes.filter(type =>
      preferences.preferredTypes.includes(type)
    );

    if (available.length === 0) {
      return this.sceneConfig.preferredAssetTypes[0];
    }

    // Add some variety based on existing scene content
    const existingTypes = spatialContext.scene?.objects?.map(obj => obj.type) || [];
    const lessUsedTypes = available.filter(type =>
      !existingTypes.includes(type)
    );

    return lessUsedTypes.length > 0
      ? lessUsedTypes[Math.floor(Math.random() * lessUsedTypes.length)]
      : available[Math.floor(Math.random() * available.length)];
  }

  _calculateAssetScale(requirements, spatialContext, scaleTendency) {
    const baseScale = [1, 1, 1];
    const [minScale, maxScale] = requirements.scaleConstraints;

    let multiplier = 1.0;

    switch (scaleTendency) {
      case 'conservative':
        multiplier = 0.8 + Math.random() * 0.4; // 0.8 - 1.2
        break;
      case 'bold':
        multiplier = 1.2 + Math.random() * 0.8; // 1.2 - 2.0
        break;
      case 'adaptive':
      default:
        // Adapt to spatial density
        const density = spatialContext.density || 0;
        multiplier = density > 0.1 ? 0.7 : 1.3; // Smaller in dense areas
        multiplier += Math.random() * 0.4 - 0.2; // ±0.2 variation
        break;
    }

    // Apply constraints
    multiplier = Math.max(minScale, Math.min(maxScale, multiplier));

    return baseScale.map(s => s * multiplier);
  }

  _selectAssetColor(requirements, colorTendency, spatialContext) {
    const colorPalettes = {
      muted: [[0.6, 0.5, 0.4], [0.5, 0.6, 0.5], [0.4, 0.4, 0.6]],
      vibrant: [[1.0, 0.3, 0.1], [0.1, 1.0, 0.3], [0.3, 0.1, 1.0]],
      balanced: [[0.7, 0.4, 0.2], [0.2, 0.7, 0.4], [0.4, 0.2, 0.7]]
    };

    const palette = colorPalettes[colorTendency] || colorPalettes.balanced;
    return palette[Math.floor(Math.random() * palette.length)];
  }

  _generateAssetName(assetProperties, requirements) {
    const prefix = `${this.llmModel}_${assetProperties.element_type}`;
    const purpose = requirements.purpose.replace(/\s+/g, '_').toLowerCase();
    const timestamp = Date.now().toString().slice(-6);

    return `${prefix}_${purpose}_${timestamp}`;
  }

  _summarizeSpatialContext(spatialContext) {
    return {
      groundLevel: spatialContext.groundLevel?.ground_level || 0.0,
      nearbyCount: spatialContext.nearby?.total_found || 0,
      density: spatialContext.density || 0,
      sceneComplexity: spatialContext.scene?.total_objects || 0
    };
  }

  _validateSceneProposal(proposalData, spatialContext) {
    const errors = [];

    // Debug: Log proposal data structure
    console.log(`[${this.id}] Validating proposal data:`, JSON.stringify(proposalData.data, null, 2));

    // Check required fields
    if (!proposalData.data.position || !Array.isArray(proposalData.data.position)) {
      errors.push('Invalid or missing position array');
    }

    // Validate and normalize element_type - critical for Isaac Sim
    if (!proposalData.data.element_type) {
      // Try to normalize from 'type' field if present
      if (proposalData.data.type) {
        proposalData.data.element_type = proposalData.data.type;
        console.log(`[${this.id}] Normalized 'type' to 'element_type': ${proposalData.data.type}`);
      } else {
        console.error(`[${this.id}] Missing element_type in proposal:`, proposalData.data);
        errors.push('Missing element_type - required for Isaac Sim object creation');
      }
    }

    if (!proposalData.data.name) {
      errors.push('Missing asset name');
    }

    // Check Z-up compliance
    if (proposalData.data.position && proposalData.data.position[2] < 0) {
      errors.push('Invalid Z position (must be >= 0 for Z-up system)');
    }

    // Check scale validity
    if (proposalData.data.scale && (!Array.isArray(proposalData.data.scale) || proposalData.data.scale.length !== 3)) {
      errors.push('Invalid scale array (must be [x, y, z])');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  _updateSceneMetrics(operationTime, success) {
    if (success) {
      const total = this.sceneMetrics.successfulPlacements + 1;
      this.sceneMetrics.averagePlacementTime =
        (this.sceneMetrics.averagePlacementTime * (total - 1) + operationTime) / total;
    }
  }

  // ========== Agent Lifecycle Overrides ==========

  async _handleEvent(eventType, payload, event) {
    switch (eventType) {
      case 'proposal:request':
        if (payload.agentType === 'scene' && payload.proposalType === 'asset_placement') {
          // Use the base generateProposal method which handles emission
          await this.generateProposal(payload.batchId, payload.proposalType, payload.context);
          return { handled: true };
        }
        break;

      case 'story:scene_change_required':
        // Handle story-driven scene changes
        // TODO: Implement story-driven scene modifications
        return { handled: true };

      case 'audience:environment_request':
        // Handle audience requests for specific environmental changes
        // TODO: Implement audience-driven environment requests
        return { handled: true };
    }

    // Fall back to parent handling
    return await super._handleEvent(eventType, payload, event);
  }

  async _executeProposal(proposal, decision) {
    if (!proposal || !proposal.data) {
      console.warn(`[${this.id}] Missing proposal payload during execution.`);
      return super._executeProposal(proposal, decision);
    }

    await this.executeAssetPlacement(proposal, decision);

    return super._executeProposal(proposal, decision);
  }

  getMetrics() {
    const baseMetrics = super.getMetrics();

    return {
      ...baseMetrics,
      scene: this.sceneMetrics,
      assets: {
        placed: this.placedAssets.size,
        pending: this.pendingPlacements.size
      },
      config: this.sceneConfig
    };
  }

  async _performHealthCheck() {
    const issues = await super._performHealthCheck() || [];

    // Scene-specific health checks
    // Only check MCP clients in non-mock mode
    if (!config.mcp.mockMode && !this.mcpClients?.worldBuilder) {
      issues.push({ type: 'mcp', message: 'WorldBuilder MCP client not available' });
    }

    if (this.pendingPlacements.size > 10) {
      issues.push({ type: 'performance', message: `High pending placements: ${this.pendingPlacements.size}` });
    }

    return issues;
  }

  /**
   * Get mock spatial data for development/testing
   */
  _getMockSpatialData(targetArea, radius) {
    const mockNearbyObjects = [
      {
        name: 'mock_cube_1',
        usd_path: '/World/mock_cube_1',
        position: [2.0, 1.5, 0.5],
        bounds: { min: [1.5, 1.0, 0.0], max: [2.5, 2.0, 1.0] },
        element_type: 'cube'
      },
      {
        name: 'mock_sphere_1',
        usd_path: '/World/mock_sphere_1',
        position: [-1.0, -2.0, 0.5],
        bounds: { min: [-1.5, -2.5, 0.0], max: [-0.5, -1.5, 1.0] },
        element_type: 'sphere'
      }
    ];

    return {
      scene: {
        total_objects: 5,
        scene_bounds: { min: [-10, -10, 0], max: [10, 10, 5] },
        metadata: { mock_mode: true }
      },
      nearby: {
        objects: mockNearbyObjects,
        count: mockNearbyObjects.length,
        search_radius: radius
      },
      groundLevel: { ground_level: 0.0, confidence: 1.0, mock_mode: true },
      bounds: {
        min: [-10, -10, 0],
        max: [10, 10, 5],
        center: [0, 0, 2.5]
      },
      density: this._calculateSpatialDensity({ objects: mockNearbyObjects }, radius)
    };
  }
}

// Export for plugin loading
export default SceneAgent;
