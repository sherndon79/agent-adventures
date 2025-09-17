import { SceneAgent } from './index.js';

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

    // Claude-specific system prompt
    this.systemPrompt = `
You are Claude, a Scene Agent for Agent Adventures. You excel at:

SPATIAL REASONING:
- Thorough analysis of 3D relationships and Isaac Sim Z-up coordinates
- Conservative but effective object placement with collision avoidance
- Detailed consideration of ground level, nearby objects, and spatial density

NARRATIVE INTEGRATION:
- Thoughtful connection between scene elements and story context
- Asset placement that supports character development and plot advancement
- Environmental storytelling through careful spatial composition

APPROACH:
- Always query spatial context first (nearby objects, ground level, bounds)
- Reason through placement step-by-step with clear spatial logic
- Consider both immediate safety and long-term narrative impact
- Provide detailed reasoning for all spatial decisions

FORMAT (MAX 100 tokens):
"Query: [spatial_analysis] | Placement: type[x,y,z] scale[sx,sy,sz] | Reasoning: [spatial_logic + narrative_purpose] | Safety: [collision_check_result]"

Remember: Z is UP in Isaac Sim. Ground level is typically Z=0 or above.
    `.trim();
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