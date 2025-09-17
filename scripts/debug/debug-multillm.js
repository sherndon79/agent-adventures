#!/usr/bin/env node

import { EventBus } from '../src/core/event-bus.js';
import { StoryState } from '../src/core/story-state.js';
import { MultiLLMAgent } from '../src/core/multi-llm-agent.js';

console.log('🔍 Testing MultiLLMAgent with EventBus...');

const eventBus = new EventBus();
const storyState = new StoryState();

// Test MultiLLMAgent with correct constructor signature
class TestMultiLLMAgent extends MultiLLMAgent {
  constructor() {
    super('test-multi-agent', 'test', 'claude', {}, {
      eventBus,
      storyState
    });
  }
}

const agent = new TestMultiLLMAgent();

console.log('MultiLLM Agent dependencies:', {
  hasEventBus: !!agent.dependencies.eventBus,
  eventBusType: typeof agent.dependencies.eventBus,
  hasSubscribe: typeof agent.dependencies.eventBus?.subscribe
});

try {
  await agent.initialize();
  console.log('✅ MultiLLMAgent initialized successfully');
} catch (error) {
  console.error('❌ MultiLLMAgent initialization failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

process.exit(0);