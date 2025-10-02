# YouTube Live Streaming Integration

**Agent Adventures** streams Isaac Sim using the custom *media bridge* stack:

```
Isaac Sim (SRT) ──► Media Bridge (ffmpeg/NVENC)
                      ├─► YouTube RTMP primary/backup
                      ├─► Audio endpoint (HTTP ingest)
                      └─► WebRTC preview (GStreamer)
```

The dashboard triggers the bridge via `/api/streaming/youtube/start` and `/stop`.  Streams require a valid YouTube stream key (fixed or provided in the API call). No Google API interaction is required—the broadcast must already exist in YouTube Studio.

## Prerequisites
- `docker` and `docker compose` available on the host.
- Media bridge directory (default `../agent-world/docker/stream-bridge`) accessible to the Node service.
- `.env` values:
  ```bash
  PRIMARY_STREAM_KEY=your_primary_key
  BACKUP_STREAM_KEY=your_backup_key   # optional
  PRIMARY_RTMP_URL=rtmp://a.rtmp.youtube.com/live2
  BACKUP_RTMP_URL=rtmp://b.rtmp.youtube.com/live2?backup=1
  MEDIA_BRIDGE_DIR=../agent-world/docker/stream-bridge
  MEDIA_BRIDGE_AUDIO_SOURCE=http://audio-endpoint:9000/stream
  MEDIA_BRIDGE_AUDIO_TOKEN=secure-bearer-token
  MEDIA_BRIDGE_VIDEO_BITRATE_K=4500
  MEDIA_BRIDGE_AUDIO_BITRATE_K=160
  MEDIA_BRIDGE_FPS=30
  WEBRTC_PORT=8081
  AUDIO_TOKEN=auto_generated_or_custom
  ```
- To use live narration/music, POST AAC audio to `http://localhost:9000/ingest?token=...`. Otherwise the bridge emits a silent track by default.

## API Endpoints

### Start Stream
**POST** `/api/streaming/youtube/start`

```json
{
  "streamKey": "kbj7-5vd6-tshf-j6hc-54zs",
  "backupStreamKey": "kbj7-5vd6-tshf-j6hc-54zs",
  "primaryUrl": "rtmp://a.rtmp.youtube.com/live2",
  "backupUrl": "rtmp://b.rtmp.youtube.com/live2?backup=1",
  "audioSource": "http://audio-endpoint:9000/stream",
  "audioToken": "secure-bearer-token"
}
```
*All fields optional – defaults come from environment variables.*

**Response**
```json
{
  "success": true,
  "session": {
    "id": "media_bridge_1_1706221234567",
    "status": "live",
    "youtubeWatchUrl": null,
    "webRTCMonitorUrl": "http://localhost:8081/",
    "startTime": "2025-09-26T02:45:00.123Z",
    "audioSource": "http://audio-endpoint:9000/stream",
    "videoBitrateK": 4500,
    "audioBitrateK": 160,
    "fps": 30
  }
}
```

### Stop Stream
**POST** `/api/streaming/youtube/{sessionId}/stop`

### Stream Status
**GET** `/api/streaming/youtube/{sessionId}/status`

Returns the session info plus health checks for the audio and WebRTC services.

### List Active Streams
**GET** `/api/streaming/youtube/sessions`

### Bridge Health
**GET** `/api/streaming/health`

Returns health statuses (`audio`, `webrtc`) plus any currently tracked sessions.

```json
{
  "success": true,
  "health": {
    "overall": true
  },
  "details": [
    { "name": "audio", "status": "ok", "url": "http://localhost:9000/health" },
    { "name": "webrtc", "status": "ok", "url": "http://localhost:8081/health" }
  ],
  "sessions": [
    {
      "id": "media_bridge_1_1706221234567",
      "status": "live",
      "webRTCMonitorUrl": "http://localhost:8081/",
      "youtubeWatchUrl": null
    }
  ]
}
```

## Notes
- YouTube watch URLs are not auto-generated. Create/monitor the event in YouTube Studio and store the link in `YOUTUBE_WATCH_URL` if you want it reflected in responses.
- WebRTC preview is served at `http://localhost:8081/`. The dashboard can embed the page or use the `/ws` signaling endpoint for a custom player.
- To send test audio: `./send_test_audio.sh http://localhost:9000/ingest 30`
- Replacing the bearer token requires updating both `.env` (`MEDIA_BRIDGE_AUDIO_TOKEN`, `AUDIO_TOKEN`) and `docker/stream-bridge/config/media.env`, then restarting the compose stack (`docker compose restart`).

## Troubleshooting
- `docker compose -f ../agent-world/docker/stream-bridge/docker-compose.yml ps` shows container state.
- `curl http://localhost:9000/health` and `curl http://localhost:8081/health` verify the audio/WebRTC services.
- Logs: `docker compose -f ... logs media-bridge`.
