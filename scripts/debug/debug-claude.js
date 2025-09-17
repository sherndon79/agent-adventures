#!/usr/bin/env node

import { EventBus } from '../src/core/event-bus.js';
import { StoryState } from '../src/core/story-state.js';
import { ClaudeSceneAgent } from '../src/agents/scene-agent/claude-scene-agent.js';

console.log('🔍 Testing ClaudeSceneAgent with EventBus...');

const eventBus = new EventBus();
const storyState = new StoryState();

const dependencies = {
  eventBus,
  storyState
};

// Test ClaudeSceneAgent with correct constructor signature
const agent = new ClaudeSceneAgent({}, dependencies);

console.log('Claude Agent dependencies:', {
  hasEventBus: !!agent.dependencies.eventBus,
  eventBusType: typeof agent.dependencies.eventBus,
  hasSubscribe: typeof agent.dependencies.eventBus?.subscribe
});

try {
  await agent.initialize();
  console.log('✅ ClaudeSceneAgent initialized successfully');
} catch (error) {
  console.error('❌ ClaudeSceneAgent initialization failed:', error.message);
  console.error('Stack:', error.stack);
  process.exit(1);
}

process.exit(0);