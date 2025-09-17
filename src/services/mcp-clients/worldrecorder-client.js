import { HTTPMCPClient } from './http-mcp-client.js';
import { config } from '../../config/environment.js';

/**
 * WorldRecorder MCP client for video recording and frame capture
 * Handles video recording, frame capture, and recording management
 */
export class WorldRecorderClient extends HTTPMCPClient {
  constructor(options = {}) {
    const serviceUrl = config.mcp.services.worldRecorder;
    super('WorldRecorder', serviceUrl, options);
  }

  // ========== WorldRecorder-specific Methods ==========

  /**
   * Start video recording
   */
  async startVideo(outputPath, durationSec, fps = 30, width = null, height = null, fileType = '.mp4', sessionId = '', showProgress = false, cleanupFrames = true) {
    const params = { output_path: outputPath, duration_sec: durationSec, fps, file_type: fileType, session_id: sessionId, show_progress: showProgress, cleanup_frames: cleanupFrames };
    if (width) params.width = width;
    if (height) params.height = height;
    return await this.executeCommand('worldrecorder_start_video', params);
  }

  /**
   * Start recording (alias)
   */
  async startRecording(outputPath, durationSec, fps = 30, width = null, height = null, fileType = '.mp4', sessionId = '', showProgress = false, cleanupFrames = true) {
    const params = { output_path: outputPath, duration_sec: durationSec, fps, file_type: fileType, session_id: sessionId, show_progress: showProgress, cleanup_frames: cleanupFrames };
    if (width) params.width = width;
    if (height) params.height = height;
    return await this.executeCommand('worldrecorder_start_recording', params);
  }

  /**
   * Cancel recording
   */
  async cancelRecording(sessionId = '') {
    return await this.executeCommand('worldrecorder_cancel_recording', { session_id: sessionId });
  }

  /**
   * Cancel video
   */
  async cancelVideo() {
    return await this.executeCommand('worldrecorder_cancel_video');
  }

  /**
   * Capture frame or frame sequence
   */
  async captureFrame(outputPath, durationSec = null, intervalSec = null, frameCount = null, width = null, height = null, fileType = '.png') {
    const params = { output_path: outputPath, file_type: fileType };
    if (durationSec) params.duration_sec = durationSec;
    if (intervalSec) params.interval_sec = intervalSec;
    if (frameCount) params.frame_count = frameCount;
    if (width) params.width = width;
    if (height) params.height = height;
    return await this.executeCommand('worldrecorder_capture_frame', params);
  }

  /**
   * Get recording status
   */
  async getStatus() {
    return await this.executeCommand('worldrecorder_get_status');
  }

  /**
   * Get recording status (alternative)
   */
  async getRecordingStatus() {
    return await this.executeCommand('worldrecorder_recording_status');
  }

  /**
   * Get metrics
   */
  async getMetricsJSON() {
    return await this.executeCommand('worldrecorder_get_metrics');
  }

  /**
   * Cleanup frames
   */
  async cleanupFrames(sessionId = '', outputPath = '') {
    return await this.executeCommand('worldrecorder_cleanup_frames', { session_id: sessionId, output_path: outputPath });
  }
}

export default WorldRecorderClient;

