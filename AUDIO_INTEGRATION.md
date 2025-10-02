# Audio Integration Guide

This guide shows how to integrate the audio generator with Agent Adventures.

## Files Created

- `src/controllers/audioController.js` - Audio WebSocket and REST API handlers
- `src/routes/audioRoutes.js` - Audio REST routes

## Integration Steps

### 1. Update `src/index.js`

Add audio routes to the Express app:

```javascript
import audioRoutes from './routes/audioRoutes.js';

// ... in your app setup ...
app.use('/api/audio', audioRoutes);
```

### 2. Update WebSocket Server Setup

Modify your `setupWebSocketServer` function to handle audio connections:

```javascript
import { handleAudioConnection } from './controllers/audioController.js';

export function setupWebSocketServer(server) {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname;

    if (path === '/ws/bridge') {
      handleBridgeConnection(ws);
    } else if (path === '/ws/audio') {
      // NEW: Handle audio container connection
      handleAudioConnection(ws);
    } else {
      handleDashboardConnection(ws);
    }
  });
}
```

### 3. Integrate with StoryState

Hook story state events to trigger audio updates:

```javascript
import { sendAudioUpdate } from '../controllers/audioController.js';

// When story state changes
storyState.on('narration:update', (narration) => {
  sendAudioUpdate('narration', {
    text: narration.text,
    voice: narration.voice || 'narrator_default',
    emotion: narration.emotion || 'neutral'
  }, {
    scene_id: storyState.current.scene_id,
    story_beat: storyState.current.tension_level
  });
});

storyState.on('scene:change', (scene) => {
  sendAudioUpdate('ambient', {
    environment: scene.environment,
    time_of_day: scene.time_of_day,
    weather: scene.weather,
    special_effects: scene.special_effects || []
  }, {
    scene_id: scene.id
  });
});

storyState.on('tension:change', (tension) => {
  const intensityMap = {
    'exposition': 0.3,
    'rising_action': 0.6,
    'climax': 0.9,
    'resolution': 0.4
  };

  sendAudioUpdate('music', {
    tension_level: tension.level,
    intensity: intensityMap[tension.level],
    genre: storyState.current.genre + '_orchestral',
    tempo: 'moderate'
  });
});

storyState.on('audience:decision', (decision) => {
  const commentaryText = `The audience has spoken! ${decision.percentage}% chose to ${decision.choice}.`;

  sendAudioUpdate('commentary', {
    text: commentaryText,
    voice: 'host_enthusiastic'
  }, {
    poll_id: decision.poll_id
  });
});
```

## REST API Endpoints

### POST /api/audio/narration
```json
{
  "text": "The hero approaches the ancient altar...",
  "voice": "narrator_default",
  "emotion": "mysterious",
  "interrupt": false
}
```

### POST /api/audio/ambient
```json
{
  "environment": "forest",
  "time_of_day": "evening",
  "weather": "calm",
  "special_effects": ["glowing_crystals", "ethereal_mist"],
  "transition": {
    "type": "crossfade",
    "duration_ms": 3000
  }
}
```

### POST /api/audio/music
```json
{
  "tension_level": "rising_action",
  "intensity": 0.6,
  "genre": "fantasy_orchestral",
  "tempo": "moderate",
  "transition": {
    "type": "gradual",
    "duration_ms": 5000
  }
}
```

### POST /api/audio/commentary
```json
{
  "text": "The audience has voted!",
  "voice": "host_enthusiastic"
}
```

### GET /api/audio/status
Returns current audio system status.

### POST /api/audio/control
```json
{
  "command": "pause",
  "channel": "music",
  "params": {
    "fade_out_ms": 2000
  }
}
```

Commands: `pause`, `resume`, `clear_queue`

## Testing

### 1. Start Audio Container
```bash
cd ~/agent-world/docker/audio-generator
docker compose up
```

### 2. Start Agent Adventures
```bash
cd ~/agent-adventures
npm start
```

### 3. Test Endpoints
```bash
# Trigger narration
curl -X POST http://localhost:3001/api/audio/narration \
  -H "Content-Type: application/json" \
  -d '{"text": "Testing narration from API"}'

# Update ambient
curl -X POST http://localhost:3001/api/audio/ambient \
  -H "Content-Type: application/json" \
  -d '{"environment": "forest", "time_of_day": "evening", "weather": "calm"}'

# Check status
curl http://localhost:3001/api/audio/status
```

## OBS Setup

Configure 4 Media Sources in OBS with SRT:

1. **Narration** - `srt://localhost:9001?mode=listener` (80% volume)
2. **Ambient** - `srt://localhost:9002?mode=listener` (30% volume)
3. **Music** - `srt://localhost:9003?mode=listener` (40% volume)
4. **Commentary** - `srt://localhost:9004?mode=listener` (100% volume)

## Monitoring

Audio status updates are automatically broadcast to dashboard websockets. Listen for:

```javascript
{
  "type": "audio_status_update",
  "data": {
    "status": "active",
    "channels": [
      {
        "id": "narration",
        "status": "streaming",
        "queue_depth": 2,
        ...
      }
    ]
  }
}
```
