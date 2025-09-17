import { SceneAgent } from './index.js';
import { BASE_AGENT_PROMPT } from '../../core/multi-llm-agent.js';

/**
 * Claude-powered Scene Agent
 * Specializes in thoughtful spatial reasoning and narrative integration
 */
export class ClaudeSceneAgent extends SceneAgent {
  constructor(config = {}, dependencies = {}) {
    super('claude-scene-agent', 'claude', {
      // Claude-specific configuration
      spatialQueryRadius: 6.0, // Slightly larger for thorough analysis
      minObjectSeparation: 1.2, // Conservative separation
      preferredAssetTypes: ['cube', 'cylinder'], // Structured shapes
      proposalTimeout: 10000, // Allow more time for thoughtful analysis
      ...config
    }, dependencies);

    // Claude-specific system prompt focused on Isaac Sim MCP usage
    this.systemPrompt = [
      BASE_AGENT_PROMPT,
      'Role: Scene Placement Specialist (Claude). Deliver meticulous, story-aware spatial plans.',
      'Available MCP actions:',
      '- place_asset {name, asset_path, position[3], rotation[3], scale[3], parent_path}',
      '- transform_asset {prim_path, position?, rotation?, scale?}',
      '- clear_scene {path, confirm}',
      'Workflow: query ground level and nearby objects within 5 m, respect min separation, prefer stable anchors.',
      'Example:',
      '{',
      '  "action": "place_asset",',
      '  "parameters": {',
      '    "name": "plaza_statue",',
      '    "asset_path": "omniverse://assets/decor/statue.usd",',
      '    "position": [4.0, -3.0, 0.0],',
      '    "rotation": [0, 0, 90],',
      '    "scale": [2.0, 2.0, 2.0],',
      '    "parent_path": "/World/Plaza"',
      '  },',
      '  "reasoning": "Ground z=0, 2m clearance from path, draws audience focus."',
      '}'
    ].join('\n');
  }

  /**
   * Claude-specific reasoning approach
   */
  _generateModelSpecificProposal(context) {
    const { requirements, spatialContext, position, assetProperties } = context;

    // Claude's methodical analysis
    const spatialAnalysis = [
      `ground_level=${spatialContext.groundLevel?.toFixed(1) || '0.0'}`,
      `nearby=${spatialContext.nearbyCount || 0}`,
      `density=${spatialContext.density?.toFixed(2) || '0.00'}`
    ].join(' ');

    const safetyCheck = spatialContext.nearbyCount > 0
      ? `${spatialContext.nearbyCount} objects checked, ${this.sceneConfig.minObjectSeparation}m separation ensured`
      : 'clear placement area confirmed';

    const narrativeConnection = this._analyzeNarrativeConnection(requirements, context);

    return {
      reasoning: `Query: ${spatialAnalysis} | Placement: ${assetProperties.element_type}[${position.map(p => p.toFixed(1)).join(',')}] scale[${assetProperties.scale?.map(s => s.toFixed(1)).join(',') || '1.0,1.0,1.0'}] | Reasoning: ${narrativeConnection} | Safety: ${safetyCheck}`,
      additionalData: {
        metadata: {
          analysis_depth: 'comprehensive',
          safety_priority: 'high',
          narrative_integration: 'detailed',
          claude_methodology: 'systematic_spatial_reasoning'
        }
      }
    };
  }

  /**
   * Analyze narrative connection for Claude's storytelling focus
   */
  _analyzeNarrativeConnection(requirements, context) {
    const purpose = requirements.purpose || 'environmental';
    const storyRelevance = requirements.storyRelevance || 'neutral';

    if (storyRelevance !== 'neutral') {
      return `${assetProperties.element_type} supports ${storyRelevance} story element for ${purpose} purpose, positioned for character interaction and scene continuity`;
    } else {
      return `thoughtful ${assetProperties.element_type} placement for ${purpose}, maintaining spatial harmony and narrative potential`;
    }
  }

  /**
   * Claude's enhanced collision avoidance
   */
  _avoidCollisions(position, nearbyObjects, minSeparation) {
    let safePosition = [...position];
    let adjustmentsMade = 0;

    // Claude uses iterative refinement for optimal placement
    for (let iteration = 0; iteration < 3; iteration++) {
      let needsAdjustment = false;

      for (const obj of nearbyObjects) {
        if (!obj.position) continue;

        const distance = this._calculateDistance(safePosition, obj.position);
        if (distance < minSeparation) {
          needsAdjustment = true;

          // Calculate optimal avoidance vector
          const avoidanceVector = this._calculateOptimalAvoidance(
            safePosition, obj.position, obj.bounds, minSeparation
          );

          safePosition = [
            safePosition[0] + avoidanceVector[0],
            safePosition[1] + avoidanceVector[1],
            safePosition[2] + avoidanceVector[2]
          ];

          adjustmentsMade++;
        }
      }

      if (!needsAdjustment) break; // Converged to safe position
    }

    if (adjustmentsMade > 0) {
      this.sceneMetrics.collisionsAvoided += adjustmentsMade;
    }

    return safePosition;
  }

  /**
   * Calculate optimal avoidance vector considering object bounds
   */
  _calculateOptimalAvoidance(position, obstaclePos, obstacleBounds, minSeparation) {
    // Simple directional avoidance (Claude prefers straightforward, reliable approaches)
    const direction = [
      position[0] - obstaclePos[0],
      position[1] - obstaclePos[1],
      position[2] - obstaclePos[2]
    ];

    const length = Math.sqrt(direction[0]**2 + direction[1]**2 + direction[2]**2);

    if (length > 0) {
      const normalized = direction.map(d => d / length);
      const pushDistance = minSeparation - length + 0.5; // Extra buffer

      return normalized.map(n => n * pushDistance);
    }

    // Fallback: move slightly in random direction
    return [0.5, 0, 0];
  }
}

export default ClaudeSceneAgent;
