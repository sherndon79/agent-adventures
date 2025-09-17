import { SceneAgent } from './index.js';
import { BASE_AGENT_PROMPT } from '../../core/multi-llm-agent.js';

/**
 * Gemini-powered Scene Agent
 * Specializes in bold visual composition and dynamic spatial arrangements
 */
export class GeminiSceneAgent extends SceneAgent {
  constructor(config = {}, dependencies = {}) {
    super('gemini-scene-agent', 'gemini', {
      // Gemini-specific configuration
      spatialQueryRadius: 7.0, // Wider view for dramatic compositions
      minObjectSeparation: 0.8, // Closer placements for dynamic layouts
      preferredAssetTypes: ['sphere', 'cone', 'cylinder'], // Dynamic shapes
      proposalTimeout: 6000, // Faster, more intuitive decisions
      ...config
    }, dependencies);

    // Gemini-specific system prompt with compact MCP guidance
    this.systemPrompt = [
      BASE_AGENT_PROMPT,
      'Role: Scene Placement Specialist (Gemini). Favour bold visuals that energize the stream.',
      'Available MCP actions:',
      '- place_asset {name, asset_path, position[3], rotation[3], scale[3], parent_path}',
      '- transform_asset {prim_path, position?, rotation?, scale?}',
      '- clear_scene {path, confirm}',
      'Workflow: scout for dramatic elevation, colour contrast, and ensure safe clearances.',
      'Example:',
      '{',
      '  "action": "place_asset",',
      '  "parameters": {',
      '    "name": "sky_drone",',
      '    "asset_path": "omniverse://assets/drones/sky_cam.usd",',
      '    "position": [6.5, 2.0, 3.0],',
      '    "rotation": [0, -10, 45],',
      '    "scale": [1.2, 1.2, 1.2],',
      '    "parent_path": "/World/Showcase"',
      '  },',
      '  "reasoning": "Hovering focal sweep, clear of crowd, maximizes dynamic camera reveals."',
      '}'
    ].join('\n');
  }

  /**
   * Gemini-specific bold visual approach
   */
  _generateModelSpecificProposal(context) {
    const { requirements, spatialContext, position, assetProperties } = context;

    // Gemini's dynamic visual strategy
    const visualStrategy = this._determineVisualStrategy(spatialContext, position);
    const compositionEffect = this._calculateCompositionEffect(spatialContext, assetProperties);

    const boldPlacement = `${assetProperties.element_type}[${position.map(p => p.toFixed(1)).join(',')}] scale[${assetProperties.scale?.map(s => s.toFixed(1)).join(',') || '1.5,1.5,1.5'}] color[${assetProperties.color?.map(c => c.toFixed(1)).join(',') || '1.0,0.3,0.1'}]`;

    const visualReasoning = this._craftVisualReasoning(requirements, spatialContext, position);

    return {
      reasoning: `Dynamic: ${visualStrategy} | Bold: ${boldPlacement} | Impact: ${visualReasoning} | Energy: ${compositionEffect}`,
      additionalData: {
        metadata: {
          visual_strategy: visualStrategy,
          composition_type: 'dynamic',
          risk_level: 'calculated_bold',
          gemini_approach: 'visual_impact_maximization',
          dramatic_elements: this._identifyDramaticElements(position, assetProperties)
        }
      }
    };
  }

  /**
   * Determine visual strategy based on spatial context
   */
  _determineVisualStrategy(spatialContext, position) {
    const strategies = [];

    // Check for elevation opportunities
    if (position[2] > 2.0) {
      strategies.push('elevated_drama');
    }

    // Check for spatial density
    if (spatialContext.density < 0.1) {
      strategies.push('bold_statement');
    } else {
      strategies.push('dynamic_integration');
    }

    // Check for visual contrast opportunities
    if (spatialContext.nearbyCount > 0) {
      strategies.push('contrast_composition');
    }

    return strategies.join('+') || 'visual_focus';
  }

  /**
   * Calculate composition effect for visual impact
   */
  _calculateCompositionEffect(spatialContext, assetProperties) {
    const effects = [];

    // Scale impact
    const scale = assetProperties.scale || [1, 1, 1];
    const avgScale = scale.reduce((a, b) => a + b, 0) / scale.length;
    if (avgScale > 1.3) {
      effects.push('commanding_presence');
    } else if (avgScale < 0.8) {
      effects.push('delicate_accent');
    }

    // Color impact
    const color = assetProperties.color || [0.5, 0.5, 0.5];
    const colorIntensity = Math.max(...color);
    if (colorIntensity > 0.8) {
      effects.push('vibrant_focal_point');
    }

    // Spatial relationship
    if (spatialContext.nearbyCount === 0) {
      effects.push('standalone_monument');
    } else {
      effects.push('ensemble_harmony');
    }

    return effects.join('+') || 'visual_enhancement';
  }

  /**
   * Craft visual reasoning for Gemini's bold approach
   */
  _craftVisualReasoning(requirements, spatialContext, position) {
    const visualElements = [];

    // Emphasize bold choices
    if (position[2] > 1.5) {
      visualElements.push('elevated for dramatic silhouette');
    }

    // Highlight composition benefits
    if (spatialContext.nearbyCount > 0) {
      visualElements.push(`creates dynamic relationship with ${spatialContext.nearbyCount} nearby elements`);
    } else {
      visualElements.push('establishes commanding focal point');
    }

    // Connect to purpose
    const purpose = requirements.purpose || 'visual';
    visualElements.push(`maximizes ${purpose} impact for streaming audience`);

    return visualElements.join(', ') || 'enhances visual composition';
  }

  /**
   * Identify dramatic elements in the placement
   */
  _identifyDramaticElements(position, assetProperties) {
    const elements = [];

    // Height drama
    if (position[2] > 3.0) {
      elements.push('high_altitude');
    } else if (position[2] > 1.5) {
      elements.push('elevated_position');
    }

    // Scale drama
    const scale = assetProperties.scale || [1, 1, 1];
    const maxScale = Math.max(...scale);
    if (maxScale > 2.0) {
      elements.push('oversized_presence');
    } else if (maxScale > 1.5) {
      elements.push('bold_scaling');
    }

    // Color drama
    const color = assetProperties.color || [0.5, 0.5, 0.5];
    if (Math.max(...color) > 0.8) {
      elements.push('vivid_coloration');
    }

    return elements.length > 0 ? elements : ['subtle_elegance'];
  }

  /**
   * Gemini's bold asset selection
   */
  _selectAssetProperties(requirements, spatialContext, position) {
    // Get base properties
    const baseProperties = super._selectAssetProperties(requirements, spatialContext, position);

    // Gemini enhances for visual drama
    return {
      ...baseProperties,
      // Boost scale for impact
      scale: baseProperties.scale.map(s => s * 1.2), // 20% larger
      // Enhance colors for vibrancy
      color: this._enhanceColorVibrancy(baseProperties.color),
      properties: {
        ...baseProperties.properties,
        visual_priority: 'maximum',
        dramatic_emphasis: true,
        gemini_enhancement: 'visual_impact'
      }
    };
  }

  /**
   * Enhance color vibrancy for Gemini's bold style
   */
  _enhanceColorVibrancy(baseColor) {
    if (!baseColor || baseColor.length !== 3) {
      return [1.0, 0.4, 0.1]; // Default vibrant orange
    }

    // Increase saturation and brightness
    return baseColor.map(c => Math.min(1.0, c * 1.3));
  }

  /**
   * Gemini's dynamic collision avoidance
   */
  _avoidCollisions(position, nearbyObjects, minSeparation) {
    let safePosition = [...position];

    // Gemini prefers dramatic solutions to spatial conflicts
    for (const obj of nearbyObjects) {
      if (!obj.position) continue;

      const distance = this._calculateDistance(safePosition, obj.position);
      if (distance < minSeparation) {
        // Try vertical solution first (more dramatic)
        if (this._canMoveVertically(safePosition, obj)) {
          safePosition[2] += minSeparation; // Move up for drama
        } else {
          // Fall back to horizontal adjustment with style
          const avoidanceVector = this._calculateDynamicAvoidance(
            safePosition, obj.position, minSeparation
          );
          safePosition = [
            safePosition[0] + avoidanceVector[0],
            safePosition[1] + avoidanceVector[1],
            safePosition[2] + avoidanceVector[2]
          ];
        }

        this.sceneMetrics.collisionsAvoided++;
      }
    }

    return safePosition;
  }

  /**
   * Check if vertical movement is viable for dramatic effect
   */
  _canMoveVertically(position, obstacle) {
    // Gemini loves vertical drama when space allows
    const heightDifference = Math.abs(position[2] - (obstacle.position?.[2] || 0));
    return heightDifference < 1.0 && position[2] < 5.0; // Room to go up
  }

  /**
   * Calculate dynamic avoidance that maintains visual interest
   */
  _calculateDynamicAvoidance(position, obstaclePos, minSeparation) {
    // Gemini prefers angular, interesting avoidance patterns
    const baseDirection = [
      position[0] - obstaclePos[0],
      position[1] - obstaclePos[1],
      position[2] - obstaclePos[2]
    ];

    // Add angular component for more interesting placement
    const angle = Math.random() * Math.PI / 3; // Up to 60 degrees
    const rotatedDirection = [
      baseDirection[0] * Math.cos(angle) - baseDirection[1] * Math.sin(angle),
      baseDirection[0] * Math.sin(angle) + baseDirection[1] * Math.cos(angle),
      baseDirection[2] * 1.2 // Slight upward bias for drama
    ];

    const length = Math.sqrt(rotatedDirection[0]**2 + rotatedDirection[1]**2 + rotatedDirection[2]**2);

    if (length > 0) {
      const normalized = rotatedDirection.map(d => d / length);
      const pushDistance = minSeparation * 1.3; // Extra space for dramatic effect

      return normalized.map(n => n * pushDistance);
    }

    return [1.0, 0.5, 0.3]; // Fallback with slight drama
  }
}

export default GeminiSceneAgent;
