#!/usr/bin/env node

import { WebSocket } from 'ws';

console.log('🏆 Testing Agent Competition Workflow...');

const ws = new WebSocket('ws://localhost:3001');

ws.on('open', function open() {
  console.log('✅ Connected to dashboard WebSocket');

  // Send competition start command
  const command = {
    type: 'command',
    module: 'competition',
    command: 'start',
    data: { type: 'asset_placement' }
  };

  console.log('📤 Sending competition start command:', JSON.stringify(command, null, 2));
  ws.send(JSON.stringify(command));
});

ws.on('message', function message(data) {
  try {
    const parsed = JSON.parse(data.toString());
    console.log('📥 Received:', JSON.stringify(parsed, null, 2));

    if (parsed.type === 'competition:started') {
      console.log('🎯 Competition started successfully!');
      console.log('   Batch ID:', parsed.data.batchId);
      console.log('   Type:', parsed.data.type);

      // Close after successful start
      setTimeout(() => {
        ws.close();
      }, 2000);
    }
  } catch (error) {
    console.log('📥 Raw message:', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket error:', err);
});

ws.on('close', function close() {
  console.log('🔌 Disconnected from dashboard');
});

// Timeout after 10 seconds
setTimeout(() => {
  console.log('⏰ Test timeout - closing connection');
  ws.close();
}, 10000);