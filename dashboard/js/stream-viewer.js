/**
 * Stream Viewer Module for Agent Adventures Dashboard
 * Handles live streaming display, controls, and WebRTC integration
 */

class StreamViewer {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.streamActive = false;
    this.webrtcPlayer = null;
    this.activeSession = null;
    this.healthDetails = [];

    this.streamContainer = document.getElementById('stream-player');
    this.launchAdventureButton = document.getElementById('launch-adventure');
    if (this.streamContainer) {
      this.showStreamPlaceholder(this.streamContainer);
    }

    this.setupEventHandlers();
    this.fetchInitialStatus();
    console.log('✅ StreamViewer module initialized');
  }

  async fetchInitialStatus() {
    try {
      const response = await fetch('/api/stream/status');
      if (!response.ok) {
        throw new Error(`Failed to fetch initial status (${response.status})`);
      }
      const data = await response.json();
      this.updateStreamStatus(data);
    } catch (error) {
      console.error('Error fetching initial stream status:', error);
    }
  }



  setupEventHandlers() {
    const startButton = document.getElementById('start-stream');
    const stopButton = document.getElementById('stop-stream');

    if (startButton) {
      startButton.addEventListener('click', () => this.startStream());
    }

    if (stopButton) {
      stopButton.addEventListener('click', () => this.stopStream());
    }

    if (this.launchAdventureButton) {
      this.launchAdventureButton.addEventListener('click', () => this.launchAdventure());
    }
  }

  async startStream() {
    try {
      this.updateStreamStatus({ status: 'starting' });
      const response = await fetch('/api/stream/start', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Failed to start stream (${response.status})`);
      }
      this.dashboard.logActivity('stream', 'CONTROL', 'Start stream command sent');
    } catch (error) {
      console.error('Error starting stream:', error);
      this.dashboard.logActivity('error', 'CONTROL', `Start stream failed: ${error.message}`);
      this.updateStreamStatus({ status: 'stopped' });
    }
  }

  async stopStream() {
    try {
      const response = await fetch('/api/stream/stop', { method: 'POST' });
      if (!response.ok) {
        throw new Error(`Failed to stop stream (${response.status})`);
      }
      this.dashboard.logActivity('stream', 'CONTROL', 'Stop stream command sent');
    } catch (error) {
      console.error('Error stopping stream:', error);
      this.dashboard.logActivity('error', 'CONTROL', `Stop stream failed: ${error.message}`);
    }
  }

  async launchAdventure() {
    if (!this.launchAdventureButton) return;

    const payload = {
      adventureId: 'sample-adventure',
      initialContext: {
        story: {
          beat: 'A cosmic convergence over the Aetheric Spire',
          location: 'Central plaza of the floating city',
          activeCharacters: ['Liora', 'Bram', 'Elder Keth'],
          conflict: 'Channeling the spire without fracturing reality'
        }
      }
    };

    this.launchAdventureButton.disabled = true;
    this.launchAdventureButton.textContent = 'Launching…';

    try {
      const response = await fetch('/api/orchestrator/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to launch adventure (${response.status})`);
      }

      const data = await response.json().catch(() => ({}));
      this.dashboard.logActivity('orchestrator', 'CONTROL', `Adventure launch requested: ${data.adventureId || payload.adventureId}`);
    } catch (error) {
      console.error('Error launching adventure:', error);
      this.dashboard.logActivity('error', 'ORCHESTRATOR', `Launch failed: ${error.message}`);
    } finally {
      this.launchAdventureButton.disabled = false;
      this.launchAdventureButton.textContent = 'Launch Adventure';
    }
  }

  updateStreamStatus(payload = {}) {
    const status = payload.status || 'idle';
    this.streamActive = status === 'running';
    const isStarting = status === 'starting';

    if (this.streamActive && payload.session) {
      this.activeSession = payload.session;
    } else if (!this.streamActive) {
      this.activeSession = null;
    }

    const startButton = document.getElementById('start-stream');
    const stopButton = document.getElementById('stop-stream');
    if (startButton) {
      startButton.disabled = this.streamActive || isStarting;
    }
    if (stopButton) {
      stopButton.disabled = !this.streamActive || isStarting;
    }

    if (this.streamContainer) {
      this.updateStreamPlayer();
    }

    this.updateStreamMetrics();

    if (this.dashboard?.syncStreamControls) {
      this.dashboard.syncStreamControls({
        status,
        session: this.activeSession,
      });
    }
  }

  updateStreamPlayer() {
    if (!this.streamContainer) return;

    if (this.streamActive && this.activeSession) {
      this.startWebRTCPlayer(this.streamContainer, this.activeSession);
    } else {
      this.stopWebRTCPlayer(this.streamContainer);
    }
  }

  startWebRTCPlayer(container, session) {
    if (this.webrtcPlayer) {
      this.stopWebRTCPlayer();
    }

    // Clear placeholder content
    container.innerHTML = '';

    try {
      const previewUrl = session.webRTCMonitorUrl;

      if (!previewUrl) {
        this.showStreamError(container, 'WebRTC preview unavailable');
        return;
      }

      const iframe = document.createElement('iframe');
      iframe.className = 'webrtc-frame';
      iframe.src = previewUrl;
      iframe.allow = 'autoplay; fullscreen; picture-in-picture';
      iframe.setAttribute('title', 'WebRTC preview');
      iframe.setAttribute('loading', 'eager');

      const liveIndicator = document.createElement('div');
      liveIndicator.className = 'stream-indicator';
      liveIndicator.textContent = '🔴 LIVE';

      container.appendChild(liveIndicator);
      container.appendChild(iframe);

      this.webrtcPlayer = iframe;

      this.dashboard.logActivity('stream', 'PLAYER', 'WebRTC preview embedded');

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

  // Public API methods
  getStreamStatus() {
    return {
      active: this.streamActive,
      hasPlayer: !!this.webrtcPlayer,
      session: this.activeSession,
      health: this.healthDetails
    };
  }

  updateStreamMetrics() {
    const qualityElement = document.getElementById('stream-quality');
    const latencyElement = document.getElementById('stream-latency');
    const viewerCountElement = document.getElementById('viewer-count');

    if (qualityElement) {
      if (this.streamActive && this.activeSession) {
        const bitrate = this.activeSession.videoBitrateK ? `${this.activeSession.videoBitrateK} kbps` : 'auto';
        const fps = this.activeSession.fps || 'N/A';
        qualityElement.textContent = `${bitrate} @ ${fps} fps`;
      } else {
        qualityElement.textContent = 'Not streaming';
      }
    }

    if (latencyElement) {
      if (this.healthDetails.length) {
        const summary = this.healthDetails
          .map(item => `${item.name}:${item.status}`)
          .join(' · ');
        latencyElement.textContent = summary;
      } else if (this.streamActive) {
        latencyElement.textContent = 'Checking health...';
      } else {
        latencyElement.textContent = '--';
      }
    }

    if (viewerCountElement) {
      viewerCountElement.textContent = this.streamActive ? '--' : '0';
    }
  }



  destroy() {
    if (this.healthPollTimer) {
      clearInterval(this.healthPollTimer);
      this.healthPollTimer = null;
    }
    this.stopWebRTCPlayer();
    console.log('🔄 StreamViewer destroyed');
  }
}

// Export for dashboard-core.js
window.StreamViewer = StreamViewer;
