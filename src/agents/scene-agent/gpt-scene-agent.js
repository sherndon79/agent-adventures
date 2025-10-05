import { SceneAgent } from './index.js';
import { BASE_AGENT_PROMPT } from '../../core/multi-llm-agent.js';

/**
 * GPT-powered Scene Agent
 * Specializes in balanced optimization and adaptive audience engagement
 */
export class GPTSceneAgent extends SceneAgent {
  constructor(config = {}, dependencies = {}) {
    super('gpt-scene-agent', 'gpt', {
      // GPT-specific configuration
      spatialQueryRadius: 5.0, // Balanced analysis scope
      minObjectSeparation: 1.0, // Standard safe separation
      preferredAssetTypes: ['cube', 'sphere', 'cylinder'], // Full variety
      proposalTimeout: 8000, // Balanced decision time
      ...config
    }, dependencies);

    // GPT-specific system prompt with compact MCP guidance
    this.systemPrompt = [
      BASE_AGENT_PROMPT,
      'Role: Scene Placement Specialist (GPT). Balance safety, story, and audience engagement.',
      'Available MCP actions:',
      '- place_asset {name, asset_path, position[3], rotation[3], scale[3], parent_path}',
      '- transform_asset {prim_path, position?, rotation?, scale?}',
      '- clear_scene {path, confirm}',
      'Workflow: gather spatial metrics, evaluate viewer impact, choose minimal action that satisfies both.',
      'Example:',
      '{',
      '  "action": "place_asset",',
      '  "parameters": {',
      '    "name": "market_awning",',
      '    "asset_path": "omniverse://assets/props/awning.usd",',
      '    "position": [2.5, 1.0, 0.0],',
      '    "rotation": [0, 0, 0],',
      '    "scale": [1.5, 1.2, 1.0],',
      '    "parent_path": "/World/Market"',
      '  },',
      '  "reasoning": "Creates shaded crowd hub, keeps 1m clearance, supports ongoing narrative tasks."',
      '}'
    ].join('\n');
  }

  /**
   * Determine optimization strategy based on context
   */
  _determineOptimizationStrategy(spatialContext, requirements) {
    const factors = [];

    // Spatial optimization
    if (spatialContext.density > 0.15) {
      factors.push('space_efficient');
    } else if (spatialContext.density < 0.05) {
      factors.push('creative_expansion');
    } else {
      factors.push('spatial_balanced');
    }

    // Story optimization
    if (requirements.storyRelevance !== 'neutral') {
      factors.push('narrative_focused');
    }

    // Audience optimization
    if (requirements.visualPriority === 'high') {
      factors.push('engagement_maximized');
    } else {
      factors.push('sustainable_interest');
    }

    return factors.slice(0, 2).join('+') || 'multi_factor_optimized';
  }

  /**
   * Analyze purpose balance for audience and story value
   */
  _analyzePurposeBalance(requirements, spatialContext) {
    const benefits = [];

    // Story value assessment
    const storyValue = this._assessStoryValue(requirements, spatialContext);
    if (storyValue) {
      benefits.push(storyValue);
    }

    // Audience engagement assessment
    const audienceValue = this._assessAudienceValue(requirements, spatialContext);
    if (audienceValue) {
      benefits.push(audienceValue);
    }

    return benefits.join(' + ') || 'scene_enhancement';
  }

  /**
   * Assess story value contribution
   */
  _assessStoryValue(requirements, spatialContext) {
    const purpose = requirements.purpose || 'environmental';
    const storyRelevance = requirements.storyRelevance || 'neutral';

    if (storyRelevance !== 'neutral') {
      return `${storyRelevance}_story_support`;
    }

    if (purpose === 'character_interaction') {
      return 'character_development_enabler';
    }

    if (spatialContext.sceneComplexity < 5) {
      return 'world_building_foundation';
    }

    return 'narrative_continuity';
  }

  /**
   * Assess audience engagement value
   */
  _assessAudienceValue(requirements, spatialContext) {
    const visualPriority = requirements.visualPriority || 'medium';
    const interactionRequired = requirements.interactionRequired || false;

    if (interactionRequired) {
      return 'interactive_focal_point';
    }

    if (visualPriority === 'high') {
      return 'streaming_visual_anchor';
    }

    if (spatialContext.nearbyCount === 0) {
      return 'scene_establishment';
    }

    return 'viewer_retention_support';
  }

  /**
   * Identify adaptive elements for flexibility
   */
  _identifyAdaptiveElements(spatialContext, assetProperties) {
    const adaptiveFeatures = [];

    // Spatial adaptability
    if (spatialContext.density > 0.1) {
      adaptiveFeatures.push('density_responsive');
    }

    // Scale adaptability
    const scale = assetProperties.scale || [1, 1, 1];
    const avgScale = scale.reduce((a, b) => a + b, 0) / scale.length;
    if (avgScale > 0.8 && avgScale < 1.2) {
      adaptiveFeatures.push('scale_flexible');
    }

    // Composition adaptability
    if (spatialContext.nearbyCount > 0 && spatialContext.nearbyCount < 3) {
      adaptiveFeatures.push('composition_harmonious');
    }

    return adaptiveFeatures.join('+') || 'contextually_adaptive';
  }

  /**
   * Get balance factors for metadata
   */
  _getBalanceFactors(requirements, spatialContext) {
    return {
      spatial_safety: spatialContext.nearbyCount > 0 ? 'collision_aware' : 'open_placement',
      story_integration: requirements.storyRelevance || 'neutral',
      visual_impact: requirements.visualPriority || 'medium',
      audience_accessibility: 'multi_platform_optimized'
    };
  }

  /**
   * Get audience considerations
   */
  _getAudienceConsiderations(requirements) {
    return {
      streaming_friendly: true,
      interaction_potential: requirements.interactionRequired || false,
      cross_platform_appeal: true,
      retention_supportive: requirements.visualPriority !== 'low'
    };
  }

  /**
   * Calculate adaptability score
   */
  _calculateAdaptabilityScore(spatialContext) {
    let score = 0.5; // Base adaptability

    // Spatial flexibility
    if (spatialContext.density > 0.05 && spatialContext.density < 0.15) {
      score += 0.2; // Sweet spot for adaptation
    }

    // Scene complexity flexibility
    if (spatialContext.sceneComplexity > 2 && spatialContext.sceneComplexity < 10) {
      score += 0.2;
    }

    // Nearby object balance
    if (spatialContext.nearbyCount > 0 && spatialContext.nearbyCount < 5) {
      score += 0.1;
    }

    return Math.min(1.0, score);
  }

  /**
   * GPT's balanced asset selection
   */
  _selectAssetProperties(requirements, spatialContext, position) {
    // Get base properties
    const baseProperties = super._selectAssetProperties(requirements, spatialContext, position);

    // GPT applies balanced optimization
    return {
      ...baseProperties,
      // Optimize scale for context
      scale: this._optimizeScaleForContext(baseProperties.scale, spatialContext),
      // Balance color for broad appeal
      color: this._balanceColorForAudience(baseProperties.color, requirements),
      properties: {
        ...baseProperties.properties,
        optimization_target: 'balanced_engagement',
        audience_tested: true,
        gpt_balanced: 'multi_factor_optimized'
      }
    };
  }

  /**
   * Optimize scale based on spatial context
   */
  _optimizeScaleForContext(baseScale, spatialContext) {
    if (!baseScale || baseScale.length !== 3) {
      baseScale = [1.0, 1.0, 1.0];
    }

    let scaleFactor = 1.0;

    // Adapt to spatial density
    if (spatialContext.density > 0.15) {
      scaleFactor = 0.8; // Smaller in dense areas
    } else if (spatialContext.density < 0.05) {
      scaleFactor = 1.2; // Larger in open areas
    }

    // Adapt to scene complexity
    if (spatialContext.sceneComplexity > 10) {
      scaleFactor *= 0.9; // Slightly smaller in complex scenes
    }

    return baseScale.map(s => s * scaleFactor);
  }

  /**
   * Balance color for broad audience appeal
   */
  _balanceColorForAudience(baseColor, requirements) {
    if (!baseColor || baseColor.length !== 3) {
      return [0.7, 0.5, 0.3]; // Balanced default
    }

    // Adjust saturation for streaming friendliness
    const maxIntensity = Math.max(...baseColor);
    const minIntensity = Math.min(...baseColor);

    // Ensure good contrast but not overwhelming
    if (maxIntensity > 0.9) {
      return baseColor.map(c => c * 0.8); // Tone down very bright colors
    }

    if (maxIntensity < 0.3) {
      return baseColor.map(c => c * 1.4); // Boost very dull colors
    }

    return baseColor; // Already balanced
  }

  /**
   * GPT's balanced collision avoidance
   */
  _avoidCollisions(position, nearbyObjects, minSeparation) {
    let safePosition = [...position];

    // GPT uses systematic optimization approach
    const avoidanceOptions = this._generateAvoidanceOptions(position, nearbyObjects, minSeparation);

    if (avoidanceOptions.length > 0) {
      // Select best balanced option
      const optimalAvoidance = this._selectOptimalAvoidance(avoidanceOptions, position);
      safePosition = optimalAvoidance.position;

      this.sceneMetrics.collisionsAvoided += optimalAvoidance.adjustmentCount;
    }

    return safePosition;
  }

  /**
   * Generate multiple avoidance options for optimization
   */
  _generateAvoidanceOptions(position, nearbyObjects, minSeparation) {
    const options = [];

    for (const obj of nearbyObjects) {
      if (!obj.position) continue;

      const distance = this._calculateDistance(position, obj.position);
      if (distance < minSeparation) {
        // Generate multiple avoidance vectors
        const baseVector = [
          position[0] - obj.position[0],
          position[1] - obj.position[1],
          position[2] - obj.position[2]
        ];

        // Option 1: Direct avoidance
        options.push({
          type: 'direct',
          vector: baseVector,
          adjustmentCount: 1,
          qualityScore: 0.7
        });

        // Option 2: Diagonal avoidance (potentially more interesting)
        const diagonalVector = [
          baseVector[0] * 1.2,
          baseVector[1] * 0.8,
          baseVector[2] * 1.1
        ];
        options.push({
          type: 'diagonal',
          vector: diagonalVector,
          adjustmentCount: 1,
          qualityScore: 0.8
        });

        // Option 3: Vertical adjustment (if space allows)
        if (position[2] < 4.0) {
          const verticalVector = [
            baseVector[0] * 0.5,
            baseVector[1] * 0.5,
            baseVector[2] + minSeparation
          ];
          options.push({
            type: 'vertical',
            vector: verticalVector,
            adjustmentCount: 1,
            qualityScore: 0.9 // Prefer vertical for visual interest
          });
        }
      }
    }

    return options;
  }

  /**
   * Select optimal avoidance based on multiple criteria
   */
  _selectOptimalAvoidance(options, originalPosition) {
    if (options.length === 0) {
      return { position: originalPosition, adjustmentCount: 0 };
    }

    // Score each option
    const scoredOptions = options.map(option => {
      const newPosition = [
        originalPosition[0] + (option.vector[0] / Math.sqrt(option.vector[0]**2 + option.vector[1]**2 + option.vector[2]**2)) * option.adjustmentCount,
        originalPosition[1] + (option.vector[1] / Math.sqrt(option.vector[0]**2 + option.vector[1]**2 + option.vector[2]**2)) * option.adjustmentCount,
        originalPosition[2] + (option.vector[2] / Math.sqrt(option.vector[0]**2 + option.vector[1]**2 + option.vector[2]**2)) * option.adjustmentCount
      ];

      return {
        position: newPosition,
        adjustmentCount: option.adjustmentCount,
        totalScore: option.qualityScore
      };
    });

    // Return highest scoring option
    return scoredOptions.reduce((best, current) =>
      current.totalScore > best.totalScore ? current : best
    );
  }
}

export default GPTSceneAgent;
