/**
 * Stream Viewer Module for Agent Adventures Dashboard
 * Handles live streaming display, controls, and WebRTC integration
 */

class StreamViewer {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.streamActive = false;
    this.webrtcPlayer = null;
    this.playerConfig = {
      host: window.location.hostname,
      port: 3333,
      application: 'agent_adventures',
      stream: 'isaac_sim'
    };

    this.bindEvents();
    console.log('✅ StreamViewer module initialized');
  }

  bindEvents() {
    // Stream controls already bound in dashboard-core.js
    // This module handles the stream state updates
  }

  updateStreamStatus(status) {
    this.streamActive = status.active || false;

    const qualityElement = document.getElementById('stream-quality');
    const latencyElement = document.getElementById('stream-latency');
    const viewerCountElement = document.getElementById('viewer-count');
    const startButton = document.getElementById('start-stream');
    const stopButton = document.getElementById('stop-stream');

    if (qualityElement) {
      qualityElement.textContent = this.streamActive ? (status.quality || 'Good') : 'Not streaming';
    }

    if (latencyElement) {
      latencyElement.textContent = this.streamActive ? `${status.latency || 150}ms` : '--ms';
    }

    if (viewerCountElement) {
      viewerCountElement.textContent = status.viewers || 0;
    }

    // Update button states
    if (startButton) {
      startButton.disabled = this.streamActive;
    }
    if (stopButton) {
      stopButton.disabled = !this.streamActive;
    }

    // Update stream player
    this.updateStreamPlayer(status);
  }

  updateStreamPlayer(status) {
    const streamPlayer = document.getElementById('stream-player');
    if (!streamPlayer) return;

    if (this.streamActive && status.active) {
      this.startWebRTCPlayer(streamPlayer);
    } else {
      this.stopWebRTCPlayer(streamPlayer);
    }
  }

  startWebRTCPlayer(container) {
    if (this.webrtcPlayer) {
      this.stopWebRTCPlayer();
    }

    // Clear placeholder content
    container.innerHTML = '';

    try {
      // Create WebRTC player (simplified for demo - would integrate with OME WebRTC)
      const playerElement = document.createElement('div');
      playerElement.className = 'webrtc-player';
      playerElement.innerHTML = `
        <div class="stream-active">
          <div class="stream-indicator">🔴 LIVE</div>
          <div class="stream-placeholder-content">
            <div style="font-size: 2rem; margin-bottom: 1rem;">📺</div>
            <p>Isaac Sim Stream Active</p>
            <small>WebRTC Player Connected</small>
          </div>
        </div>
      `;

      container.appendChild(playerElement);

      // In a real implementation, this would initialize the OME WebRTC player
      this.simulateStreamContent(playerElement);

      this.webrtcPlayer = playerElement;

      this.dashboard.logActivity('stream', 'PLAYER', 'WebRTC player started');

    } catch (error) {
      console.error('Failed to start WebRTC player:', error);
      this.dashboard.logActivity('error', 'PLAYER', `WebRTC player failed: ${error.message}`);
      this.showStreamError(container, 'Failed to connect to stream');
    }
  }

  stopWebRTCPlayer(container) {
    if (this.webrtcPlayer) {
      this.webrtcPlayer.remove();
      this.webrtcPlayer = null;
    }

    if (container) {
      this.showStreamPlaceholder(container);
    }

    this.dashboard.logActivity('stream', 'PLAYER', 'WebRTC player stopped');
  }

  showStreamPlaceholder(container) {
    container.innerHTML = `
      <div class="stream-placeholder">
        <div class="placeholder-icon">📺</div>
        <p>Isaac Sim Stream</p>
        <small>Stream will appear here when active</small>
      </div>
    `;
  }

  showStreamError(container, message) {
    container.innerHTML = `
      <div class="stream-placeholder">
        <div class="placeholder-icon" style="color: var(--error-red);">⚠️</div>
        <p style="color: var(--error-red);">Stream Error</p>
        <small>${message}</small>
      </div>
    `;
  }

  simulateStreamContent(playerElement) {
    // Simulate live stream activity indicators
    let frameCount = 0;
    const updateInterval = setInterval(() => {
      if (!this.streamActive || !this.webrtcPlayer) {
        clearInterval(updateInterval);
        return;
      }

      frameCount++;

      // Update frame info (simulated)
      const indicator = playerElement.querySelector('.stream-indicator');
      if (indicator) {
        indicator.textContent = `🔴 LIVE - Frame ${frameCount}`;
      }

      // Simulate viewer count changes
      const currentViewers = parseInt(document.getElementById('viewer-count')?.textContent || '0');
      const viewerChange = Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      const newViewers = Math.max(0, currentViewers + viewerChange);

      if (document.getElementById('viewer-count')) {
        document.getElementById('viewer-count').textContent = newViewers;
      }

    }, 2000);
  }

  // Public API methods
  getStreamStatus() {
    return {
      active: this.streamActive,
      hasPlayer: !!this.webrtcPlayer,
      playerConfig: this.playerConfig
    };
  }

  setPlayerConfig(config) {
    this.playerConfig = { ...this.playerConfig, ...config };
  }

  destroy() {
    this.stopWebRTCPlayer();
    console.log('🔄 StreamViewer destroyed');
  }
}

// Export for dashboard-core.js
window.StreamViewer = StreamViewer;