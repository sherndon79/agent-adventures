#!/usr/bin/env node

/**
 * Test YouTube Chat Integration
 *
 * Tests YouTubeChatListener and ChatMessagePoster with a live YouTube stream
 */

import { EventEmitter } from 'eventemitter3';
import { YouTubeChatListener } from '../src/services/youtube/youtube-chat-listener.js';
import { ChatMessagePoster } from '../src/services/chat/chat-message-poster.js';

// Configuration from environment
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_BROADCAST_ID = process.env.YOUTUBE_LIVE_BROADCAST_ID;

if (!YOUTUBE_API_KEY) {
  console.error('❌ YOUTUBE_API_KEY environment variable is required');
  process.exit(1);
}

if (!YOUTUBE_BROADCAST_ID) {
  console.error('❌ YOUTUBE_LIVE_BROADCAST_ID environment variable is required');
  process.exit(1);
}

console.log('🧪 Testing YouTube Chat Integration\n');
console.log(`API Key: ${YOUTUBE_API_KEY.substring(0, 10)}...`);
console.log(`Broadcast ID: ${YOUTUBE_BROADCAST_ID}\n`);

// Create event bus
const eventBus = new EventEmitter();

// Create YouTube Chat Listener
const chatListener = new YouTubeChatListener({
  eventBus,
  apiKey: YOUTUBE_API_KEY,
  broadcastId: YOUTUBE_BROADCAST_ID,
  pollIntervalMs: 5000 // Poll every 5 seconds
});

// Track messages for testing
let messageCount = 0;
const seenMessages = new Set();

// Subscribe to chat messages
eventBus.on('chat:message', (message) => {
  if (seenMessages.has(message.messageId)) {
    return;
  }
  seenMessages.add(message.messageId);
  messageCount++;

  console.log(`\n📨 Message #${messageCount}`);
  console.log(`   Author: ${message.author.name}`);
  console.log(`   Text: ${message.text}`);
  console.log(`   Type: ${message.type}`);
  console.log(`   Time: ${message.publishedAt}`);
});

// Start listener
(async () => {
  try {
    console.log('🚀 Starting YouTube Chat Listener...\n');
    await chatListener.start();

    console.log('✅ Chat listener started successfully!');
    console.log('📊 Listening for messages... (Press Ctrl+C to stop)\n');

    // Show metrics every 30 seconds
    setInterval(() => {
      const metrics = chatListener.getMetrics();
      console.log('\n📊 Metrics Update:');
      console.log(`   Messages Received: ${metrics.messagesReceived}`);
      console.log(`   Messages Emitted: ${metrics.messagesEmitted}`);
      console.log(`   Poll Count: ${metrics.pollCount}`);
      console.log(`   Errors: ${metrics.errors}`);
      console.log(`   Average Poll Latency: ${metrics.averagePollLatency.toFixed(2)}ms`);
      console.log(`   Unique Messages: ${messageCount}\n`);
    }, 30000);

    // Optional: Test posting a message after 10 seconds
    setTimeout(async () => {
      try {
        console.log('\n🧪 Testing message posting...');

        const liveChatId = chatListener.liveChatId;
        const poster = new ChatMessagePoster({
          apiKey: YOUTUBE_API_KEY,
          liveChatId
        });

        await poster.postMessage('🤖 Test message from Agent Adventures!');
        console.log('✅ Test message posted successfully!\n');
      } catch (error) {
        console.error('❌ Failed to post test message:', error.message);
      }
    }, 10000);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n\n🛑 Shutting down...');
      await chatListener.stop();

      const finalMetrics = chatListener.getMetrics();
      console.log('\n📊 Final Metrics:');
      console.log(`   Total Messages: ${messageCount}`);
      console.log(`   Total Polls: ${finalMetrics.pollCount}`);
      console.log(`   Total Errors: ${finalMetrics.errors}`);

      console.log('\n👋 Goodbye!');
      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Failed to start chat listener:', error);
    process.exit(1);
  }
})();
