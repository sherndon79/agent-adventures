/**
 * Media Bridge Streaming Controller
 *
 * Manages the custom media bridge stack (SRT ingest -> ffmpeg -> YouTube).
 * Replaces the previous OME/YouTube API orchestration.
 */

import path from 'path';
import logger from '../logging/logger.js';
import MediaBridgeManager from './media-bridge-manager.js';

const DEFAULT_PRIMARY_URL = process.env.PRIMARY_RTMP_URL || process.env.RTMP_URL || 'rtmp://a.rtmp.youtube.com/live2';
const DEFAULT_BACKUP_URL = process.env.BACKUP_RTMP_URL || 'rtmp://b.rtmp.youtube.com/live2?backup=1';
const DEFAULT_WEBRTC_PORT = Number(process.env.WEBRTC_PORT) || 8081;
const DEFAULT_AUDIO_STREAM = process.env.MEDIA_BRIDGE_AUDIO_SOURCE || process.env.AUDIO_SOURCE || 'http://audio-endpoint:9000/stream';
const DEFAULT_VIDEO_BITRATE = process.env.MEDIA_BRIDGE_VIDEO_BITRATE_K || process.env.VIDEO_BITRATE_K;
const DEFAULT_AUDIO_BITRATE = process.env.MEDIA_BRIDGE_AUDIO_BITRATE_K || process.env.AUDIO_BITRATE_K;
const DEFAULT_FPS = process.env.MEDIA_BRIDGE_FPS || process.env.FPS;
const DEFAULT_AUDIO_TOKEN = process.env.MEDIA_BRIDGE_AUDIO_TOKEN || process.env.AUDIO_TOKEN;

export default class YouTubeStreamingController {
  constructor(config = {}) {
    const composeDir = config.mediaBridgeDir || process.env.MEDIA_BRIDGE_DIR || path.resolve(__dirname, '../../../agent-world/docker/stream-bridge');
    this.mediaBridge = new MediaBridgeManager({
      composeDir,
      composeFile: config.composeFile,
      audioHealthUrl: config.audioHealthUrl,
      webrtcHealthUrl: config.webrtcHealthUrl
    });

    this.activeSessions = new Map();
    this.sessionCounter = 0;
  }

  _buildSessionFromEnv() {
    const primaryUrl = DEFAULT_PRIMARY_URL;
    const backupUrl = DEFAULT_BACKUP_URL;
    const audioSource = DEFAULT_AUDIO_STREAM;
    const videoBitrate = DEFAULT_VIDEO_BITRATE || null;
    const audioBitrate = DEFAULT_AUDIO_BITRATE || null;
    const frameRate = DEFAULT_FPS || null;
    const srtUrl = process.env.MEDIA_BRIDGE_SRT_URL || process.env.SRT_URL || null;
    const webrtcHost = process.env.WEBRTC_PREVIEW_HOST || 'localhost';
    const webrtcPort = Number(process.env.WEBRTC_PORT) || DEFAULT_WEBRTC_PORT;
    const webrtcPath = process.env.WEBRTC_PREVIEW_PATH || '/';
    const normalizedPath = webrtcPath.startsWith('/') ? webrtcPath : `/${webrtcPath}`;
    const webrtcUrl = `http://${webrtcHost}:${webrtcPort}${normalizedPath}`;
    const youtubeWatchUrl = process.env.YOUTUBE_WATCH_URL || null;

    return {
      id: 'media_bridge_external',
      status: 'live',
      synthetic: true,
      streaming: {
        primaryUrl,
        backupUrl,
        audioSource,
        srtUrl,
        videoBitrateK: videoBitrate,
        audioBitrateK: audioBitrate,
        fps: frameRate,
        startedAt: new Date().toISOString()
      },
      monitoring: {
        webrtcUrl,
        youtubeWatchUrl
      }
    };
  }

  ensureSessionFromHealth(healthStatuses) {
    const statuses = Array.isArray(healthStatuses) ? healthStatuses : [];
    const allHealthy = statuses.length > 0 && statuses.every((item) => item.status === 'ok');
    const hasActive = Array.from(this.activeSessions.values()).some((session) => session.status === 'live');

    if (allHealthy && !hasActive) {
      const session = this._buildSessionFromEnv();
      this.activeSessions.set(session.id, session);
      return session;
    }
    return null;
  }

  async startYouTubeStream(options = {}) {
    const sessionId = `media_bridge_${++this.sessionCounter}_${Date.now()}`;

    const primaryKey = options.streamKey || process.env.PRIMARY_STREAM_KEY || process.env.YOUTUBE_STREAM_KEY;
    if (!primaryKey) {
      throw new Error('Primary stream key not provided. Set PRIMARY_STREAM_KEY or include streamKey in the request.');
    }

    const primaryUrl = options.primaryUrl || DEFAULT_PRIMARY_URL;
    const backupKey = options.backupStreamKey || process.env.BACKUP_STREAM_KEY || null;
    const backupUrl = options.backupUrl || DEFAULT_BACKUP_URL;
    const audioSource = options.audioSource || DEFAULT_AUDIO_STREAM;
    const audioToken = options.audioToken || DEFAULT_AUDIO_TOKEN || null;
    const videoBitrate = options.videoBitrateK || DEFAULT_VIDEO_BITRATE || null;
    const audioBitrate = options.audioBitrateK || DEFAULT_AUDIO_BITRATE || null;
    const frameRate = options.fps || DEFAULT_FPS || null;
    const srtUrl = options.srtUrl || process.env.MEDIA_BRIDGE_SRT_URL || process.env.SRT_URL || null;

    const envOverrides = {
      PRIMARY_STREAM_KEY: primaryKey,
      PRIMARY_RTMP_URL: primaryUrl,
      AUDIO_SOURCE: audioSource
    };

    if (backupKey) {
      envOverrides.BACKUP_STREAM_KEY = backupKey;
      envOverrides.BACKUP_RTMP_URL = backupUrl;
    }

    if (audioToken) {
      envOverrides.AUDIO_TOKEN = audioToken;
    }

    if (videoBitrate) {
      envOverrides.VIDEO_BITRATE_K = videoBitrate;
    }

    if (audioBitrate) {
      envOverrides.AUDIO_BITRATE_K = audioBitrate;
    }

    if (frameRate) {
      envOverrides.FPS = frameRate;
    }

    if (srtUrl) {
      envOverrides.SRT_URL = srtUrl;
    }

    logger.info('Starting media bridge session', { sessionId, primaryUrl, backupUrl, audioSource });
    await this.mediaBridge.start(envOverrides);

    const webrtcHost = options.webrtcHost || process.env.WEBRTC_PREVIEW_HOST || 'localhost';
    const webrtcPort = options.webrtcPort || DEFAULT_WEBRTC_PORT;
    const webrtcPath = options.webrtcPath || process.env.WEBRTC_PREVIEW_PATH || '/';
    const normalizedPath = webrtcPath.startsWith('/') ? webrtcPath : `/${webrtcPath}`;
    const webrtcUrl = options.webrtcUrl || `http://${webrtcHost}:${webrtcPort}${normalizedPath}`;
    const youtubeWatchUrl = options.youtubeWatchUrl ?? process.env.YOUTUBE_WATCH_URL ?? null;

    const session = {
      id: sessionId,
      status: 'live',
      streaming: {
        primaryUrl,
        backupUrl: backupKey ? backupUrl : null,
        audioSource,
        srtUrl,
        videoBitrateK: videoBitrate,
        audioBitrateK: audioBitrate,
        fps: frameRate,
        startedAt: new Date().toISOString()
      },
      monitoring: {
        webrtcUrl,
        youtubeWatchUrl
      }
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  async stopYouTubeStream(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    logger.info('Stopping media bridge session', { sessionId });
    await this.mediaBridge.stop();

    session.status = 'stopped';
    session.streaming.endedAt = new Date().toISOString();
    this.activeSessions.delete(sessionId);
    return session;
  }

  async getSessionStatus(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }
    const health = await this.mediaBridge.getHealth();
    return {
      ...session,
      health
    };
  }

  listSessions() {
    return Array.from(this.activeSessions.values()).map((session) => ({ ...session }));
  }

  getActiveSessions() { return this.listSessions(); }

  async getStreamingHealth() {
    return this.mediaBridge.getHealth();
  }

  async performHealthChecks() {
    return this.getStreamingHealth();
  }
}
