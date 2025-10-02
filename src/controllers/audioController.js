/**
 * Audio Controller for Agent Adventures
 *
 * Handles WebSocket communication with the audio generator container
 * and provides REST API endpoints for audio control.
 */

import WebSocket from 'ws';

// Store audio container connection
let audioSocket = null;
let dashboardSockets = new Set();

/**
 * Handle WebSocket connection from audio container
 */
export function handleAudioConnection(ws) {
  console.log('🎵 Audio Generator connected');
  audioSocket = ws;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'auth':
          handleAudioAuth(ws, data);
          break;
        case 'audio_status':
          handleAudioStatus(data);
          break;
        case 'audio_complete':
          handleAudioComplete(data);
          break;
        case 'audio_error':
          handleAudioError(data);
          break;
        default:
          console.warn('Unknown message type from audio container:', data.type);
      }
    } catch (error) {
      console.error('Error processing audio message:', error);
    }
  });

  ws.on('close', () => {
    console.log('🎵 Audio Generator disconnected');
    audioSocket = null;

    // Notify dashboards that audio is offline
    broadcastToDashboards({
      type: 'audio_status',
      status: 'disconnected',
      timestamp: new Date().toISOString()
    });
  });

  ws.on('error', (error) => {
    console.error('Audio WebSocket error:', error);
  });
}

/**
 * Handle authentication from audio container
 */
function handleAudioAuth(ws, data) {
  console.log(`Audio container authenticated:`, data);

  const response = {
    type: 'auth_response',
    status: 'connected',
    clientId: `audio-gen-${Date.now()}`,
    timestamp: new Date().toISOString()
  };

  ws.send(JSON.stringify(response));

  // Notify dashboards that audio is online
  broadcastToDashboards({
    type: 'audio_status',
    status: 'connected',
    capabilities: data.capabilities,
    timestamp: new Date().toISOString()
  });
}

/**
 * Handle audio status updates
 */
function handleAudioStatus(data) {
  // Forward to dashboards for monitoring
  broadcastToDashboards({
    type: 'audio_status_update',
    data: data
  });

  // Optionally update StoryState with audio status
  // storyState.update({ audio: data.channels });
}

/**
 * Handle audio generation completion
 */
function handleAudioComplete(data) {
  console.log(`✅ Audio complete: ${data.channel} (${data.result.generation_time_ms}ms)`);

  // Trigger next story beat if waiting for audio
  // eventBus.emit('audio:complete', data);
}

/**
 * Handle audio errors
 */
function handleAudioError(data) {
  console.error(`❌ Audio error [${data.severity}]:`, data.error.message);

  // Forward to monitoring/alerting
  // if (data.severity === 'critical') { ... }
}

/**
 * Send story update to audio container
 */
export function sendAudioUpdate(channel, data, metadata = {}) {
  if (!audioSocket || audioSocket.readyState !== WebSocket.OPEN) {
    console.warn('Audio container not connected, skipping update');
    return false;
  }

  const message = {
    type: 'story_update',
    channel,
    data,
    metadata: {
      ...metadata,
      timestamp: new Date().toISOString()
    }
  };

  audioSocket.send(JSON.stringify(message));
  return true;
}

/**
 * Send control command to audio container
 */
export function sendAudioControl(command, params = {}) {
  if (!audioSocket || audioSocket.readyState !== WebSocket.OPEN) {
    console.warn('Audio container not connected, cannot send command');
    return false;
  }

  const message = {
    type: 'control',
    command,
    ...params
  };

  audioSocket.send(JSON.stringify(message));
  return true;
}

/**
 * Register dashboard socket for audio status updates
 */
export function registerDashboard(socket) {
  dashboardSockets.add(socket);

  socket.on('close', () => {
    dashboardSockets.delete(socket);
  });
}

/**
 * Broadcast message to all dashboard clients
 */
function broadcastToDashboards(message) {
  const messageStr = JSON.stringify(message);
  dashboardSockets.forEach(socket => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(messageStr);
    }
  });
}

/**
 * Get audio container connection status
 */
export function getAudioStatus() {
  return {
    connected: audioSocket && audioSocket.readyState === WebSocket.OPEN,
    timestamp: new Date().toISOString()
  };
}

/**
 * REST API Handlers
 */

/**
 * Trigger narration
 * POST /api/audio/narration
 */
export async function triggerNarration(req, res) {
  const { text, voice, emotion, interrupt, volume, duck_background } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: 'Text is required'
    });
  }

  const success = sendAudioUpdate('narration', {
    text,
    voice: voice || 'narrator_default',
    emotion: emotion || 'neutral',
    interrupt: interrupt || false,
    volume: volume !== undefined ? volume : 0.6,  // 0.0 to 1.0, default 0.6 (Coqui is louder than pyttsx3)
    duck_background: duck_background !== undefined ? duck_background : true  // Auto-duck other channels
  });

  if (success) {
    res.json({ success: true, message: 'Narration queued' });
  } else {
    res.status(503).json({
      success: false,
      error: 'Audio container not connected'
    });
  }
}

/**
 * Update ambient scene
 * POST /api/audio/ambient
 */
export async function updateAmbient(req, res) {
  const { environment, time_of_day, weather, special_effects, transition, volume } = req.body;

  if (!environment) {
    return res.status(400).json({
      success: false,
      error: 'Environment is required'
    });
  }

  const success = sendAudioUpdate('ambient', {
    environment,
    time_of_day: time_of_day || 'day',
    weather: weather || 'clear',
    special_effects: special_effects || [],
    transition: transition || { type: 'crossfade', duration_ms: 3000 },
    volume: volume !== undefined ? volume : 0.3  // Default 0.3 for ambient (background)
  });

  if (success) {
    res.json({ success: true, message: 'Ambient scene updated' });
  } else {
    res.status(503).json({
      success: false,
      error: 'Audio container not connected'
    });
  }
}

/**
 * Update music intensity
 * POST /api/audio/music
 */
export async function updateMusic(req, res) {
  const { tension_level, intensity, genre, tempo, transition, volume } = req.body;

  const success = sendAudioUpdate('music', {
    tension_level: tension_level || 'neutral',
    intensity: intensity || 0.5,
    genre: genre || 'orchestral',
    tempo: tempo || 'moderate',
    transition: transition || { type: 'gradual', duration_ms: 5000 },
    volume: volume !== undefined ? volume : 0.4  // Default 0.4 for music
  });

  if (success) {
    res.json({ success: true, message: 'Music updated' });
  } else {
    res.status(503).json({
      success: false,
      error: 'Audio container not connected'
    });
  }
}

/**
 * Send commentary
 * POST /api/audio/commentary
 */
export async function sendCommentary(req, res) {
  const { text, voice, volume } = req.body;

  if (!text) {
    return res.status(400).json({
      success: false,
      error: 'Text is required'
    });
  }

  const success = sendAudioUpdate('commentary', {
    text,
    voice: voice || 'host_enthusiastic',
    volume: volume !== undefined ? volume : 0.7  // Default 0.7 for commentary (Coqui is loud)
  });

  if (success) {
    res.json({ success: true, message: 'Commentary queued' });
  } else {
    res.status(503).json({
      success: false,
      error: 'Audio container not connected'
    });
  }
}

/**
 * Get audio system status
 * GET /api/audio/status
 */
export async function getStatus(req, res) {
  const status = getAudioStatus();
  res.json(status);
}

/**
 * Control audio channels
 * POST /api/audio/control
 */
export async function controlAudio(req, res) {
  const { command, channel, params } = req.body;

  if (!command) {
    return res.status(400).json({
      success: false,
      error: 'Command is required'
    });
  }

  const success = sendAudioControl(command, { channel, params });

  if (success) {
    res.json({ success: true, message: `Command ${command} sent` });
  } else {
    res.status(503).json({
      success: false,
      error: 'Audio container not connected'
    });
  }
}
