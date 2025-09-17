#!/usr/bin/env node

import { EventBus } from '../src/core/event-bus.js';
import { StoryState } from '../src/core/story-state.js';
import { BaseAgent } from '../src/core/base-agent.js';

console.log('🔍 Testing BaseAgent with EventBus...');

const eventBus = new EventBus();
const storyState = new StoryState();

// Test minimal BaseAgent
class TestAgent extends BaseAgent {
  constructor() {
    super('test-agent', {}, {
      eventBus,
      storyState
    });
  }

  getEventSubscriptions() {
    return [
      { eventType: 'test.event', priority: 1 }
    ];
  }
}

const agent = new TestAgent();

console.log('Agent dependencies:', {
  hasEventBus: !!agent.dependencies.eventBus,
  eventBusType: typeof agent.dependencies.eventBus,
  eventBusConstructor: agent.dependencies.eventBus?.constructor?.name,
  hasSubscribe: typeof agent.dependencies.eventBus?.subscribe
});

try {
  await agent.initialize();
  console.log('✅ Agent initialized successfully');
} catch (error) {
  console.error('❌ Agent initialization failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

process.exit(0);