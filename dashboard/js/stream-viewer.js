/**
 * Stream Viewer Module for Agent Adventures Dashboard
 * Handles live streaming display, controls, and WebRTC integration
 */

class StreamViewer {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.streamActive = false;
    this.activeSession = null;
    this.healthDetails = [];

    this.streamContainer = document.getElementById('stream-player');
    this.launchAdventureButton = document.getElementById('launch-adventure');
    this.updateStreamButton = document.getElementById('update-youtube-stream');
    this.youtubeIdInput = document.getElementById('youtube-id-input');

    if (this.streamContainer) {
      this.showStreamPlaceholder(this.streamContainer);
    }

    this.setupEventHandlers();
    this.fetchInitialStatus();
    console.log('✅ StreamViewer module initialized');
  }

  async updateYouTubeStream() {
    const newId = this.youtubeIdInput.value.trim();
    if (newId) {
      // Persist to localStorage
      localStorage.setItem('youtubeBroadcastId', newId);

      // Update the frontend iframe
      this.loadYouTubeStream(newId);
      this.youtubeIdInput.value = ''; // Clear the input
      this.dashboard.logActivity('stream', 'CONTROL', `Updated YouTube Stream ID to: ${newId}`);

      // Send the new ID to the backend
      try {
        const response = await fetch('/api/youtube/broadcast-id', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ broadcastId: newId })
        });
        if (!response.ok) {
          throw new Error('Failed to update backend broadcast ID');
        }
        this.dashboard.logActivity('system', 'YOUTUBE', `Backend broadcast ID updated successfully.`);
      } catch (error) {
        this.dashboard.logActivity('error', 'YOUTUBE', `Error updating backend broadcast ID: ${error.message}`);
      }
    }
  }

  async fetchInitialStatus() {
    // Check for a saved ID in localStorage first
    const savedId = localStorage.getItem('youtubeBroadcastId');
    if (savedId) {
      console.log(`Found saved YouTube ID in localStorage: ${savedId}`);
      this.loadYouTubeStream(savedId);
      return; // Don't fetch the default from the backend
    }

    // Load YouTube stream embed
    try {
      const response = await fetch('/api/stream/youtube-id');
      if (response.ok) {
        const data = await response.json();
        if (data.streamId) {
          this.loadYouTubeStream(data.streamId);
        }
      }
    } catch (error) {
      console.error('Error fetching YouTube stream ID:', error);
    }
  }

  loadYouTubeStream(streamId) {
    if (!this.streamContainer) return;

    const iframe = document.createElement('iframe');
    iframe.width = '100%';
    iframe.height = '100%';
    iframe.src = `https://www.youtube.com/embed/${streamId}`;
    iframe.frameBorder = '0';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.style.border = 'none';

    this.streamContainer.innerHTML = '';
    this.streamContainer.appendChild(iframe);
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

    if (this.updateStreamButton) {
      this.updateStreamButton.addEventListener('click', () => this.updateYouTubeStream());
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

    this.launchAdventureButton.disabled = true;
    this.launchAdventureButton.textContent = 'Creating…';

    try {
      const response = await fetch('/api/test/quick-scene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Failed to create test scene (${response.status})`);
      }

      const data = await response.json().catch(() => ({}));
      this.dashboard.logActivity('system', 'TEST', `Quick test scene created successfully`);
    } catch (error) {
      console.error('Error creating test scene:', error);
      this.dashboard.logActivity('error', 'TEST', `Scene creation failed: ${error.message}`);
    } finally {
      this.launchAdventureButton.disabled = false;
      this.launchAdventureButton.textContent = 'Quick Test Scene';
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

    if (this.streamActive) {
      // The YouTube iframe is already loaded, so we just need to ensure the placeholder is hidden.
      const placeholder = this.streamContainer.querySelector('.stream-placeholder');
      if (placeholder) {
        placeholder.style.display = 'none';
      }
    } else {
      this.showStreamPlaceholder(this.streamContainer);
    }
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
      session: this.activeSession,
      health: this.healthDetails
    };
  }





  destroy() {
    if (this.healthPollTimer) {
      clearInterval(this.healthPollTimer);
      this.healthPollTimer = null;
    }
    console.log('🔄 StreamViewer destroyed');
  }
}

// Export for dashboard-core.js
window.StreamViewer = StreamViewer;
