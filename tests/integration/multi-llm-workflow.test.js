/**
 * Multi-LLM Agent Workflow Integration Test
 * Tests complete agent competition workflow with real APIs
 */

import { config } from '../../src/config/environment.js';
import { EventBus } from '../../src/core/event-bus.js';
import { StoryState } from '../../src/core/story-state.js';
import { JudgePanel } from '../../src/core/judge-panel.js';
import { ClaudeSceneAgent } from '../../src/agents/scene-agent/claude-scene-agent.js';
import { GeminiSceneAgent } from '../../src/agents/scene-agent/gemini-scene-agent.js';
import { GPTSceneAgent } from '../../src/agents/scene-agent/gpt-scene-agent.js';

describe('Multi-LLM Agent Workflow', () => {
  let eventBus;
  let storyState;
  let judgePanel;
  let agents;
  let testTimeout = 60000; // 60 second timeout for API calls

  beforeAll(async () => {
    console.log('🚀 Starting Multi-LLM Workflow Test');
    console.log(`Environment: ${config.nodeEnv}`);
    console.log(`Mock LLM Mode: ${config.tokens.mockLLMMode}`);
    console.log(`Mock MCP Mode: ${config.mcp.mockMode}`);

    // Initialize core systems
    eventBus = new EventBus();
    storyState = new StoryState();
    judgePanel = new JudgePanel();

    // Initialize agents
    agents = {
      claude: new ClaudeSceneAgent('claude-1', eventBus, storyState),
      gemini: new GeminiSceneAgent('gemini-1', eventBus, storyState),
      gpt: new GPTSceneAgent('gpt-1', eventBus, storyState)
    };

    // Start all agents
    await Promise.all(Object.values(agents).map(agent => agent.start()));

    console.log('✅ All systems initialized');
  }, testTimeout);

  afterAll(async () => {
    // Cleanup
    await Promise.all(Object.values(agents).map(agent => agent.stop()));
    eventBus.destroy();
    console.log('🧹 Test cleanup completed');
  });

  test('Agent Health Check', async () => {
    console.log('🔍 Testing agent health...');

    for (const [name, agent] of Object.entries(agents)) {
      const health = await agent.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.capabilities).toContain('spatial_reasoning');
      console.log(`✅ ${name} agent healthy`);
    }
  });

  test('Story State Management', async () => {
    console.log('🔍 Testing story state management...');

    const initialState = {
      scene: {
        objects: [],
        camera: { position: [0, 0, 5], target: [0, 0, 0] },
        lighting: 'default'
      },
      narrative: {
        currentChapter: 1,
        tension: 0.3,
        focus: 'character_introduction'
      }
    };

    await storyState.updateState(initialState);
    const currentState = storyState.getCurrentState();

    expect(currentState.scene.objects).toHaveLength(0);
    expect(currentState.narrative.currentChapter).toBe(1);

    console.log('✅ Story state management working');
  });

  test('Asset Placement Competition', async () => {
    console.log('🏆 Starting Asset Placement Competition...');

    const competitionType = 'asset_placement';
    const challenge = {
      type: competitionType,
      parameters: {
        assetCount: 1,
        targetTheme: 'mystical_forest',
        constraints: {
          maxObjects: 5,
          safetyDistance: 2.0,
          groundLevel: 0.0
        }
      },
      context: 'A mysterious grove where ancient magic still lingers'
    };

    // Generate proposals from all agents
    console.log('📝 Generating agent proposals...');
    const proposals = {};

    for (const [name, agent] of Object.entries(agents)) {
      try {
        console.log(`Requesting proposal from ${name}...`);
        const proposal = await agent.generateProposal(challenge);
        proposals[name] = proposal;
        expect(proposal.reasoning).toBeDefined();
        expect(proposal.confidence).toBeGreaterThan(0);
        console.log(`✅ ${name} proposal received: ${proposal.reasoning.substring(0, 100)}...`);
      } catch (error) {
        console.error(`❌ ${name} proposal failed:`, error.message);
        throw error;
      }
    }

    expect(Object.keys(proposals)).toHaveLength(3);

    // Judge the proposals
    console.log('⚖️ Judging proposals...');
    const decision = await judgePanel.judgeProposals(proposals, challenge);

    expect(decision.winner).toBeDefined();
    expect(['claude', 'gemini', 'gpt']).toContain(decision.winner);
    expect(decision.reasoning).toBeDefined();
    expect(decision.confidence).toBeDefined();

    console.log(`🏆 Winner: ${decision.winner}`);
    console.log(`📋 Reasoning: ${decision.reasoning}`);
    console.log(`🎯 Confidence: ${decision.confidence}`);

    // Update story state with winning proposal
    const winningProposal = proposals[decision.winner];
    const updatedState = {
      scene: {
        ...storyState.getCurrentState().scene,
        lastPlacement: winningProposal,
        placementHistory: [winningProposal]
      }
    };

    await storyState.updateState(updatedState);
    const finalState = storyState.getCurrentState();
    expect(finalState.scene.lastPlacement).toBeDefined();

  }, testTimeout);

  test('Camera Movement Competition', async () => {
    console.log('🎥 Starting Camera Movement Competition...');

    const challenge = {
      type: 'camera_move',
      parameters: {
        currentPosition: [5, 3, 2],
        currentTarget: [0, 0, 1],
        sceneContext: 'forest_grove_with_mystical_elements',
        desiredMood: 'dramatic_revelation'
      },
      context: 'Reveal the hidden magical artifact in the grove'
    };

    const proposals = {};

    for (const [name, agent] of Object.entries(agents)) {
      try {
        const proposal = await agent.generateProposal(challenge);
        proposals[name] = proposal;
        console.log(`✅ ${name} camera proposal: ${proposal.reasoning.substring(0, 80)}...`);
      } catch (error) {
        console.error(`❌ ${name} camera proposal failed:`, error.message);
        throw error;
      }
    }

    const decision = await judgePanel.judgeProposals(proposals, challenge);

    expect(decision.winner).toBeDefined();
    console.log(`🎥 Camera winner: ${decision.winner}`);
    console.log(`📋 Camera reasoning: ${decision.reasoning}`);

  }, testTimeout);

  test('Story Advancement Competition', async () => {
    console.log('📚 Starting Story Advancement Competition...');

    const challenge = {
      type: 'story_advance',
      parameters: {
        currentNarrative: 'character_discovers_magical_grove',
        availableChoices: ['investigate_artifact', 'observe_from_distance', 'call_for_help'],
        audienceEngagement: 'high',
        streamingContext: true
      },
      context: 'The audience is highly engaged and expecting a pivotal moment'
    };

    const proposals = {};

    for (const [name, agent] of Object.entries(agents)) {
      try {
        const proposal = await agent.generateProposal(challenge);
        proposals[name] = proposal;
        console.log(`✅ ${name} story proposal: ${proposal.reasoning.substring(0, 80)}...`);
      } catch (error) {
        console.error(`❌ ${name} story proposal failed:`, error.message);
        throw error;
      }
    }

    const decision = await judgePanel.judgeProposals(proposals, challenge);

    expect(decision.winner).toBeDefined();
    console.log(`📚 Story winner: ${decision.winner}`);
    console.log(`📋 Story reasoning: ${decision.reasoning}`);

  }, testTimeout);

  test('Event Bus Communication', async () => {
    console.log('📡 Testing event bus communication...');

    let eventReceived = false;
    const testData = { message: 'test_event', timestamp: Date.now() };

    // Subscribe to test event
    eventBus.subscribe('workflow.test', (data) => {
      expect(data).toEqual(testData);
      eventReceived = true;
    });

    // Emit test event
    await eventBus.emitAsync('workflow.test', testData);

    // Wait for event processing
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(eventReceived).toBe(true);
    console.log('✅ Event bus communication working');
  });

  test('Agent Performance Metrics', async () => {
    console.log('📊 Testing agent performance metrics...');

    for (const [name, agent] of Object.entries(agents)) {
      const metrics = await agent.getMetrics();

      expect(metrics.proposalsGenerated).toBeGreaterThanOrEqual(0);
      expect(metrics.totalTokensUsed).toBeGreaterThanOrEqual(0);
      expect(metrics.averageResponseTime).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeGreaterThanOrEqual(0);
      expect(metrics.successRate).toBeLessThanOrEqual(1);

      console.log(`📊 ${name} metrics:`, {
        proposals: metrics.proposalsGenerated,
        tokens: metrics.totalTokensUsed,
        avgTime: `${metrics.averageResponseTime}ms`,
        successRate: `${(metrics.successRate * 100).toFixed(1)}%`
      });
    }
  });

  test('Token Usage Tracking', async () => {
    console.log('🔤 Testing token usage tracking...');

    const initialMetrics = {};
    for (const [name, agent] of Object.entries(agents)) {
      initialMetrics[name] = await agent.getMetrics();
    }

    // Generate a simple proposal to track token usage
    const simpleChallenge = {
      type: 'asset_placement',
      parameters: { assetCount: 1 },
      context: 'Simple test challenge'
    };

    for (const [name, agent] of Object.entries(agents)) {
      await agent.generateProposal(simpleChallenge);
    }

    // Check that token usage increased
    for (const [name, agent] of Object.entries(agents)) {
      const finalMetrics = await agent.getMetrics();
      if (!config.tokens.mockLLMMode) {
        expect(finalMetrics.totalTokensUsed).toBeGreaterThan(initialMetrics[name].totalTokensUsed);
      }
      console.log(`🔤 ${name} token usage: ${finalMetrics.totalTokensUsed} total`);
    }
  });

  test('Error Handling and Recovery', async () => {
    console.log('🛡️ Testing error handling and recovery...');

    // Test with invalid challenge
    const invalidChallenge = {
      type: 'invalid_type',
      parameters: null,
      context: ''
    };

    for (const [name, agent] of Object.entries(agents)) {
      try {
        await agent.generateProposal(invalidChallenge);
        // Should not reach here if error handling works
        expect(false).toBe(true);
      } catch (error) {
        expect(error).toBeDefined();
        expect(error.message).toContain('Invalid challenge type');
        console.log(`✅ ${name} properly handled invalid challenge`);
      }

      // Verify agent is still healthy after error
      const health = await agent.getHealth();
      expect(health.status).toBe('healthy');
    }
  });

  test('Competition Summary and Statistics', async () => {
    console.log('📈 Generating competition summary...');

    const summary = {
      totalCompetitions: 3,
      agentStats: {},
      overallMetrics: {
        totalTokens: 0,
        totalCost: 0,
        averageResponseTime: 0
      }
    };

    for (const [name, agent] of Object.entries(agents)) {
      const metrics = await agent.getMetrics();
      summary.agentStats[name] = {
        proposals: metrics.proposalsGenerated,
        tokens: metrics.totalTokensUsed,
        successRate: metrics.successRate,
        avgResponseTime: metrics.averageResponseTime
      };

      summary.overallMetrics.totalTokens += metrics.totalTokensUsed;
      summary.overallMetrics.totalCost += metrics.totalCost || 0;
      summary.overallMetrics.averageResponseTime += metrics.averageResponseTime;
    }

    summary.overallMetrics.averageResponseTime /= Object.keys(agents).length;

    console.log('📊 Competition Summary:', JSON.stringify(summary, null, 2));

    expect(summary.totalCompetitions).toBe(3);
    expect(Object.keys(summary.agentStats)).toHaveLength(3);
    expect(summary.overallMetrics.totalTokens).toBeGreaterThanOrEqual(0);
  });
});

// Test helper functions
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generateRandomChallenge(type) {
  const challenges = {
    asset_placement: {
      type: 'asset_placement',
      parameters: {
        assetCount: Math.floor(Math.random() * 3) + 1,
        theme: ['mystical', 'technological', 'natural'][Math.floor(Math.random() * 3)],
        constraints: {
          maxObjects: 10,
          safetyDistance: 1.5,
          groundLevel: 0.0
        }
      },
      context: 'Random test challenge for agent testing'
    }
  };

  return challenges[type] || challenges.asset_placement;
}