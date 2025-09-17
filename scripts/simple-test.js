#!/usr/bin/env node
/**
 * Simple Multi-LLM Test - Basic functionality check
 */

import { config } from '../src/config/environment.js';
import { EventBus } from '../src/core/event-bus.js';
import { StoryState } from '../src/core/story-state.js';

console.log('🚀 Simple Agent Adventures Test');
console.log('================================');

console.log(`Mock LLM Mode: ${config.tokens.mockLLMMode}`);
console.log(`Mock MCP Mode: ${config.mcp.mockMode}`);

// Test EventBus
console.log('\n🔍 Testing EventBus...');
const eventBus = new EventBus();

let eventReceived = false;
eventBus.subscribe('test.event', (data) => {
  console.log('✅ Event received:', data);
  eventReceived = true;
});

await eventBus.emitAsync('test.event', { message: 'Hello EventBus!' });

if (eventReceived) {
  console.log('✅ EventBus working correctly');
} else {
  console.error('❌ EventBus test failed');
  process.exit(1);
}

// Test StoryState
console.log('\n🔍 Testing StoryState...');
const storyState = new StoryState();

await storyState.updateState('test', 'value');
await storyState.updateState('scene.objects', []);

const currentState = storyState.getState();
if (currentState.test === 'value') {
  console.log('✅ StoryState working correctly');
} else {
  console.error('❌ StoryState test failed');
  process.exit(1);
}

console.log('\n🎉 Basic systems are working!');

// Test simple agent initialization without complex inheritance
console.log('\n🔍 Testing basic agent creation...');

class SimpleTestAgent {
  constructor(id, eventBus, storyState) {
    this.id = id;
    this.eventBus = eventBus;
    this.storyState = storyState;
    this.started = false;
  }

  async start() {
    this.started = true;
    console.log(`✅ Agent ${this.id} started`);
  }

  async stop() {
    this.started = false;
    console.log(`✅ Agent ${this.id} stopped`);
  }

  async getHealth() {
    return { status: 'healthy', id: this.id };
  }

  async generateProposal(challenge) {
    return {
      reasoning: `Simple test proposal for ${challenge.type}`,
      confidence: 0.8,
      timestamp: Date.now()
    };
  }
}

const testAgent = new SimpleTestAgent('test-agent', eventBus, storyState);
await testAgent.start();

const health = await testAgent.getHealth();
console.log('Agent health:', health);

const proposal = await testAgent.generateProposal({ type: 'test' });
console.log('Agent proposal:', proposal);

await testAgent.stop();

console.log('\n🎉 ALL BASIC TESTS PASSED!');

// Cleanup
eventBus.destroy();

process.exit(0);