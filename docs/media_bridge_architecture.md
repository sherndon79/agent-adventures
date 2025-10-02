# Media Bridge Architecture - Agent Adventures

## Overview
Live streaming from Isaac Sim to YouTube now bypasses OvenMediaEngine. A dedicated "media bridge" handles ingest, audio mixing, GPU-accelerated encoding, and outbound delivery while optionally exposing a WebRTC preview for near real-time monitoring.

```
Isaac SRT ──► Media Bridge ──► RTMP/RTMPS (YouTube)
                 │
                 └──► WebRTC preview (dashboard)
                 └──► Optional local/backup recordings
```

## Goals
- Stream video to YouTube while injecting an audio track (silent now, TTS/music later).
- Provide near real-time monitoring inside the Agent Adventures dashboard.
- Use a GPU-accelerated container that aligns with existing deployment patterns.
- Replace the OME dependency for core streaming responsibilities while keeping optional WebRTC preview.

## Key Architectural Decisions
1. **Primary Ingest**: Isaac Sim continues to publish SRT (low-latency) video; the bridge consumes it directly.
2. **Containerized Service**: Build a Docker image (CUDA runtime base) with ffmpeg (and optionally GStreamer) under `docker/stream-bridge/`, managed by a Compose stack.
3. **GPU Encoding**: Use NVENC via `ffmpeg -c:v h264_nvenc` to minimize CPU load and preserve quality.
4. **Audio Ingestion**: Provide a movable audio input layer—start with a silent AAC fallback (`anullsrc`), expose a streaming endpoint for TTS/audio sources when ready.
5. **Output Delivery**: Bridge pushes RTMP/RTMPS simultaneously to YouTube’s primary and backup ingest URLs.
6. **Preview Strategy**: A lightweight WebRTC gateway (custom GStreamer bridge) exposes a preview that the dashboard embeds via iframe while still allowing the direct URL for troubleshooting.
7. **Configuration**: All settings (SRT URL, RTMP endpoints, stream key, audio source) live in environment variables / `.env` for consistent automation.
8. **Monitoring & Control**: Provide simple CLI/REST controls for start/stop and metrics; plan to add structured logging/alerts for bitrate, FPS, connection health.

## Implementation Plan
### Container + Compose
- Dockerfile: Based on `nvidia/cuda:<version>-runtime-ubuntu22.04`, install ffmpeg, optional audio libs, add entrypoint.
- Compose: `media-bridge` service with GPU device requests, environment-driven config (`PRIMARY_RTMP_URL`, `PRIMARY_STREAM_KEY`, `BACKUP_RTMP_URL`, `BACKUP_STREAM_KEY`, `SRT_URL`, `AUDIO_SOURCE`, etc.), plus mapped volumes:
  - `./entrypoint.sh -> /usr/local/bin/entrypoint.sh` (hot swap script)
- `./config -> /config` (overrides such as `media.env`)
- `./runtime -> /runtime` (scratch space for FIFOs/logs if required)
- YouTube keys/URLs: stored in `/config/media.env` so rotation only requires editing the file and restarting the container, no rebuild.
- Any other tunable (bitrates, FPS, audio source endpoints, tee targets) is read from `/config/media.env`; baked defaults remain in the image for safe fallbacks.
- Audio source defaults to `lavfi:anullsrc=...` (silent AAC). Override with endpoints such as `udp://0.0.0.0:14000?listen=1` or `http://...` by updating `AUDIO_SOURCE` in `media.env` and restarting the service.

### ffmpeg Runner Script
- Accepts env variables, constructs command similar to:
  ```bash
  ffmpeg \
    -i "${SRT_URL}" \
    -f lavfi -i "${AUDIO_SOURCE:-anullsrc=channel_layout=stereo:sample_rate=48000}" \
    -shortest \
    -c:v h264_nvenc -preset p3 -tune ll -b:v 4M -maxrate 4M -bufsize 8M \
    -c:a aac -b:a 128k -ar 48000 -ac 2 \
  -f tee "[f=flv]${PRIMARY_RTMP_URL%/}/${PRIMARY_STREAM_KEY}|[f=flv]${BACKUP_RTMP_URL%/}/${BACKUP_STREAM_KEY}"
  ```
- Provide options for logging, dry-run, and reconnect behavior.

### Audio Streaming Endpoint
- Implemented as `audio-endpoint` (aiohttp) listening on `AUDIO_HOST:AUDIO_PORT` (defaults 0.0.0.0:9000).
- Producers push audio via `POST /ingest` (binary chunks, optional `Authorization: Bearer <token>` or `?token=`). A helper script `send_test_audio.sh` publishes a sine tone for testing.
- Consumers (media bridge or other services) pull via `GET /stream` (chunked response, default `audio/aac`).
- Default bridge audio remains silent AAC; set `AUDIO_SOURCE=http://audio-endpoint:9000/stream` in `media.env` to switch to live audio.
- Future work: expose mix controls, support alternate formats, integrate TTS pipeline once available.

### WebRTC Preview
- Implemented as `webrtc-bridge` (GStreamer + WebSocket signaling) running alongside the media bridge.
- Serves `webrtc_client.html` for testing; dashboard embeds the preview via iframe and can fall back to opening the page directly.
- Uses the same SRT feed, encodes to H264 RTP via `webrtcbin`. Default listening port `WEBRTC_PORT` (8081).
- Authentication is handled at the dashboard/API layer; add TURN/STUN or additional auth as needed for remote operators.

### Dashboard Integration
- Backend `/api/streaming/*` routes manage lifecycle, emit WebSocket events, and expose health data for the audio/WebRTC services.
- The dashboard's stream viewer polls `/api/streaming/health` and swaps between placeholder, WebRTC iframe, and error states based on session status.
- Manual YouTube links are surfaced when provided; otherwise the dashboard highlights the WebRTC preview and reports bridge health.

### Monitoring & Automation
- Expose metrics (bitrate, frame drops, reconnects) via logs or API.
- Integrate with Technical Director agent / dashboard for alerts.

## TODO
- [x] Scaffold Dockerfile & Compose for the media bridge (GPU-enabled).
- [x] Implement ffmpeg entrypoint script with env-driven config + `/config/media.env` overrides.
- [x] Provide audio streaming endpoint (`audio-endpoint`) with HTTP ingest/stream.
- [x] Wire in the WebRTC preview component and embed it in the dashboard.
- [x] Update dashboard components to show WebRTC preview with optional YouTube link.
- [ ] Add deeper health/metrics reporting for the bridge service (bitrate, reconnects).
- [ ] Plan the TTS/audio pipeline (source format, control API).

---
*Last updated: 2025-09-27*
