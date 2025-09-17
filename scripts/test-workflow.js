#!/usr/bin/env node
/**
 * Multi-LLM Workflow Test Runner
 * Executes the complete agent competition workflow test
 */

import { config, getEnvironmentSummary } from '../src/config/environment.js';
import { EventBus } from '../src/core/event-bus.js';
import { StoryState } from '../src/core/story-state.js';
import { JudgePanel } from '../src/core/judge-panel.js';
import { ClaudeSceneAgent } from '../src/agents/scene-agent/claude-scene-agent.js';
import { GeminiSceneAgent } from '../src/agents/scene-agent/gemini-scene-agent.js';
import { GPTSceneAgent } from '../src/agents/scene-agent/gpt-scene-agent.js';

class WorkflowTestRunner {
  constructor() {
    this.eventBus = null;
    this.storyState = null;
    this.judgePanel = null;
    this.agents = {};
    this.testResults = {
      passed: 0,
      failed: 0,
      errors: []
    };
  }

  async initialize() {
    console.log('🚀 Initializing Agent Adventures Workflow Test');
    console.log('================================================');

    const envSummary = getEnvironmentSummary();
    console.log('Environment Summary:');
    console.log(JSON.stringify(envSummary, null, 2));
    console.log('================================================');

    // Initialize core systems
    this.eventBus = new EventBus();
    this.storyState = new StoryState();
    this.judgePanel = new JudgePanel(this.eventBus);

    // Initialize agents with proper config and dependencies
    const agentDependencies = {
      eventBus: this.eventBus,
      storyState: this.storyState
    };

    this.agents = {
      claude: new ClaudeSceneAgent({}, agentDependencies),
      gemini: new GeminiSceneAgent({}, agentDependencies),
      gpt: new GPTSceneAgent({}, agentDependencies)
    };

    console.log('🔧 Initializing agent systems...');
    await Promise.all(Object.values(this.agents).map(agent => agent.initialize()));

    console.log('🔧 Starting agent systems...');
    await Promise.all(Object.values(this.agents).map(agent => agent.start()));

    console.log('✅ All systems initialized successfully');
  }

  async runTest(testName, testFunction) {
    console.log(`\n🧪 Running test: ${testName}`);
    console.log('─'.repeat(50));

    try {
      const startTime = Date.now();
      await testFunction();
      const duration = Date.now() - startTime;

      console.log(`✅ PASSED: ${testName} (${duration}ms)`);
      this.testResults.passed++;
    } catch (error) {
      console.error(`❌ FAILED: ${testName}`);
      console.error(`Error: ${error.message}`);
      this.testResults.failed++;
      this.testResults.errors.push({ test: testName, error: error.message });
    }
  }

  async testAgentHealth() {
    for (const [name, agent] of Object.entries(this.agents)) {
      const health = await agent.performHealthCheck();
      if (health.status !== 'healthy') {
        throw new Error(`Agent ${name} is not healthy: ${health.status}`);
      }
      console.log(`  ✓ ${name} agent is healthy`);
    }
  }

  async testAssetPlacementCompetition() {
    const challenge = {
      type: 'asset_placement',
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

    console.log('  📝 Generating agent proposals...');
    const proposals = {};

    for (const [name, agent] of Object.entries(this.agents)) {
      console.log(`    Requesting proposal from ${name}...`);
      const proposal = await agent.generateProposal(challenge);
      proposals[name] = proposal;

      if (!proposal.reasoning) {
        throw new Error(`${name} proposal missing reasoning`);
      }

      console.log(`    ✓ ${name}: "${proposal.reasoning.substring(0, 60)}..."`);
    }

    console.log('  ⚖️ Judging proposals...');
    const batchSummary = {
      batchId: challenge.id || 'challenge-' + Date.now(),
      proposals: Object.values(proposals),
      challenge
    };
    const decision = await this.judgePanel.evaluateBatch(batchSummary);

    const winner = decision.winner || decision.winningAgentId;
    const validAgents = ['claude', 'gemini', 'gpt', 'claude-scene-agent', 'gemini-scene-agent', 'gpt-scene-agent'];
    if (!winner || !validAgents.includes(winner)) {
      throw new Error(`Invalid judge decision winner: ${winner}`);
    }

    console.log(`  🏆 Winner: ${winner}`);
    console.log(`  📋 Reasoning: ${decision.reasoning.substring(0, 100)}...`);

    return decision;
  }

  async testCameraMovementCompetition() {
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

    console.log('  🎥 Generating camera movement proposals...');
    const proposals = {};

    for (const [name, agent] of Object.entries(this.agents)) {
      const proposal = await agent.generateProposal(challenge);
      proposals[name] = proposal;
      console.log(`    ✓ ${name}: "${proposal.reasoning.substring(0, 50)}..."`);
    }

    const batchSummary = {
      batchId: challenge.id || 'challenge-' + Date.now(),
      proposals: Object.values(proposals),
      challenge
    };
    const decision = await this.judgePanel.evaluateBatch(batchSummary);
    const winner = decision.winner || decision.winningAgentId;
    console.log(`  🎥 Camera winner: ${winner}`);

    return decision;
  }

  async testStoryAdvancementCompetition() {
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

    console.log('  📚 Generating story advancement proposals...');
    const proposals = {};

    for (const [name, agent] of Object.entries(this.agents)) {
      const proposal = await agent.generateProposal(challenge);
      proposals[name] = proposal;
      console.log(`    ✓ ${name}: "${proposal.reasoning.substring(0, 50)}..."`);
    }

    const batchSummary = {
      batchId: challenge.id || 'challenge-' + Date.now(),
      proposals: Object.values(proposals),
      challenge
    };
    const decision = await this.judgePanel.evaluateBatch(batchSummary);
    const winner = decision.winner || decision.winningAgentId;
    console.log(`  📚 Story winner: ${winner}`);

    return decision;
  }

  async testTokenUsageTracking() {
    console.log('  🔤 Checking token usage tracking...');

    let totalTokens = 0;
    let totalCost = 0;

    for (const [name, agent] of Object.entries(this.agents)) {
      const metrics = await agent.getMetrics();
      totalTokens += metrics.totalTokensUsed;
      totalCost += metrics.totalCost || 0;

      console.log(`    ✓ ${name}: ${metrics.totalTokensUsed} tokens, $${(metrics.totalCost || 0).toFixed(4)}`);
    }

    console.log(`  📊 Total tokens used: ${totalTokens}`);
    console.log(`  💰 Total estimated cost: $${totalCost.toFixed(4)}`);

    if (!config.tokens.mockLLMMode && totalTokens === 0) {
      throw new Error('No tokens were tracked in real API mode');
    }
  }

  async generateSummaryReport() {
    console.log('\n📊 FINAL SUMMARY REPORT');
    console.log('========================');

    const summary = {
      testResults: this.testResults,
      agentMetrics: {},
      totalTokens: 0,
      totalCost: 0,
      timestamp: new Date().toISOString()
    };

    for (const [name, agent] of Object.entries(this.agents)) {
      const metrics = await agent.getMetrics();
      summary.agentMetrics[name] = metrics;
      summary.totalTokens += metrics.totalTokensUsed;
      summary.totalCost += metrics.totalCost || 0;
    }

    console.log(`Tests Passed: ${this.testResults.passed}`);
    console.log(`Tests Failed: ${this.testResults.failed}`);
    console.log(`Total Tokens Used: ${summary.totalTokens}`);
    console.log(`Total Estimated Cost: $${summary.totalCost.toFixed(4)}`);

    if (this.testResults.errors.length > 0) {
      console.log('\nErrors:');
      this.testResults.errors.forEach(error => {
        console.log(`  - ${error.test}: ${error.error}`);
      });
    }

    return summary;
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    await Promise.all(Object.values(this.agents).map(agent => agent.stop()));
    this.eventBus.destroy();
    console.log('✅ Cleanup completed');
  }

  async run() {
    try {
      await this.initialize();

      await this.runTest('Agent Health Check', () => this.testAgentHealth());
      await this.runTest('Asset Placement Competition', () => this.testAssetPlacementCompetition());
      await this.runTest('Camera Movement Competition', () => this.testCameraMovementCompetition());
      await this.runTest('Story Advancement Competition', () => this.testStoryAdvancementCompetition());
      await this.runTest('Token Usage Tracking', () => this.testTokenUsageTracking());

      const summary = await this.generateSummaryReport();

      if (this.testResults.failed === 0) {
        console.log('\n🎉 ALL TESTS PASSED! Agent Adventures is ready!');
        process.exit(0);
      } else {
        console.log('\n⚠️  Some tests failed. Check the errors above.');
        process.exit(1);
      }

    } catch (error) {
      console.error('\n💥 Test runner failed:', error.message);
      console.error('Error stack:', error.stack);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  const runner = new WorkflowTestRunner();
  runner.run().catch(console.error);
}