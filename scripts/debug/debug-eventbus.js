#!/usr/bin/env node

import { EventBus } from '../src/core/event-bus.js';

console.log('🔍 Testing EventBus creation...');

const eventBus = new EventBus();

console.log('EventBus type:', typeof eventBus);
console.log('EventBus constructor:', eventBus.constructor.name);
console.log('EventBus methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(eventBus)));
console.log('Has subscribe method:', typeof eventBus.subscribe);

// Test the subscribe method
let testResult = false;

eventBus.subscribe('test.event', (data) => {
  console.log('✅ Event received via subscribe:', data);
  testResult = true;
});

// Emit an event
eventBus.emit('test.event', { message: 'Hello from subscribe test' });

// Wait for event processing
setTimeout(() => {
  console.log('Test result:', testResult ? '✅ PASS' : '❌ FAIL');
  process.exit(testResult ? 0 : 1);
}, 100);