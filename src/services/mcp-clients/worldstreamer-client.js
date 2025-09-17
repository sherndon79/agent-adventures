import { HTTPMCPClient } from './http-mcp-client.js';
import { config } from '../../config/environment.js';

/**
 * WorldStreamer MCP client for SRT streaming control
 * Handles streaming start/stop and status monitoring
 */
export class WorldStreamerClient extends HTTPMCPClient {
  constructor(options = {}) {
    const serviceUrl = config.mcp.services.worldStreamer;
    super('WorldStreamer', serviceUrl, options);
  }

  // ========== WorldStreamer-specific Methods ==========

  /**
   * Start streaming session
   */
  async startStreaming(serverIp = null) {
    const params = {};
    if (serverIp) params.server_ip = serverIp;
    return await this.executeCommand('worldstreamer_start_streaming', params);
  }

  /**
   * Stop streaming session
   */
  async stopStreaming() {
    return await this.executeCommand('worldstreamer_stop_streaming');
  }

  /**
   * Get streaming status
   */
  async getStatus() {
    return await this.executeCommand('worldstreamer_get_status');
  }

  /**
   * Get streaming URLs
   */
  async getStreamingUrls(serverIp = null) {
    const params = {};
    if (serverIp) params.server_ip = serverIp;
    return await this.executeCommand('worldstreamer_get_streaming_urls', params);
  }

  /**
   * Validate streaming environment
   */
  async validateEnvironment() {
    return await this.executeCommand('worldstreamer_validate_environment');
  }
}

export default WorldStreamerClient;