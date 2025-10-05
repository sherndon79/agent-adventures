export const SCENE_AGENT_PERSONAS = {
  claude: {
    reasoningTemplate: 'Query: {{spatialAnalysis}} | Placement: {{elementType}}[{{position}}] scale[{{scale}}] | Reasoning: {{narrativeConnection}} | Safety: {{safetyCheck}}',
    metadata: {
      analysis_depth: 'comprehensive',
      safety_priority: 'high',
      narrative_integration: 'detailed',
      claude_methodology: 'systematic_spatial_reasoning'
    }
  },
  gemini: {
    reasoningTemplate: 'Bold {{elementType}} placement for maximum visual impact! Position [{{position}}] builds {{visualStrategy}} with density {{density}}. Color {{color}} enhances scene drama and {{compositionEffect}}. Dramatic elements: {{dramaticElements}}.',
    metadata: {
      visual_emphasis: 'high',
      composition_style: 'dynamic',
      color_impact: 'strong'
    }
  },
  gpt: {
    reasoningTemplate: 'Balanced {{elementType}} placement at [{{position}}] optimizes story support and audience engagement. Scale {{scale}} suits {{purpose}} while considering {{nearbyCount}} surrounding elements. Strategy: {{optimizationStrategy}}. Purpose balance: {{purposeBalance}}. Adaptation: {{adaptiveElements}}.',
    metadata: {
      optimization_focus: 'balanced',
      audience_consideration: 'high',
      adaptability: 'flexible'
    }
  },
  default: {
    reasoningTemplate: 'Proposed {{elementType}} placement at [{{position}}] with scale {{scale}} for {{purpose}}. Nearby count {{nearbyCount}}, density {{density}}.',
    metadata: {
      rationale: 'generic'
    }
  }
};
