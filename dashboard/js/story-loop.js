/**
 * Story Loop Controller
 * Handles display and updates for the story loop system
 */

class StoryLoopController {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.currentPhase = 'idle';
    this.currentIteration = 0;
    this.currentTimer = null;
    this.currentGenres = [];
    this.voteData = {};
    this.chatMessages = [];
    this.maxChatMessages = 20;

    this.elements = {
      phase: document.getElementById('loop-phase'),
      iteration: document.getElementById('loop-iteration'),
      timer: document.getElementById('loop-timer'),
      genresContainer: document.getElementById('genres-container'),
      genresList: document.getElementById('genres-list'),
      votingResults: document.getElementById('voting-results'),
      votesBars: document.getElementById('votes-bars'),
      winnerAnnouncement: document.getElementById('winner-announcement'),
      chatMessages: document.getElementById('chat-messages'),
      startButton: document.getElementById('start-story-loop'),
      stopButton: document.getElementById('stop-story-loop')
    };

    this.init();
  }

  init() {
    console.log('🔄 Initializing Story Loop Controller');

    // Bind button events
    this.elements.startButton?.addEventListener('click', () => this.startLoop());
    this.elements.stopButton?.addEventListener('click', () => this.stopLoop());

    // Register event handlers
    this.registerEventHandlers();
  }

  registerEventHandlers() {
    const eventHandlers = {
      'loop:phase_changed': (data) => this.handlePhaseChanged(data),
      'loop:genres_ready': (data) => this.handleGenresReady(data),
      'loop:voting_started': (data) => this.handleVotingStarted(data),
      'vote:received': (data) => this.handleVoteReceived(data),
      'timer:countdown': (data) => this.handleTimerCountdown(data),
      'loop:voting_complete': (data) => this.handleVotingComplete(data),
      'loop:cleanup_complete': (data) => this.handleCleanupComplete(data),
      'chat:message': (data) => this.handleChatMessage(data)
    };

    // Register with dashboard message handlers
    Object.entries(eventHandlers).forEach(([event, handler]) => {
      if (!this.dashboard.messageHandlers[event]) {
        this.dashboard.messageHandlers[event] = handler.bind(this);
      }
    });
  }

  handlePhaseChanged(data) {
    console.log('📍 Phase changed:', data);
    this.currentPhase = data.to;
    this.currentIteration = data.iteration;

    // Update display
    this.elements.phase.textContent = this.formatPhaseName(data.to);
    this.elements.iteration.textContent = data.iteration;

    // Update phase badge color
    this.elements.phase.className = `status-value phase-badge ${this.getPhaseClass(data.to)}`;

    // Hide/show panels based on phase
    if (data.to === 'vote_collection') {
      this.elements.genresContainer.style.display = 'block';
      this.elements.votingResults.style.display = 'block';
    } else if (data.to === 'cleanup_reset') {
      // Keep voting results visible during cleanup
    } else if (data.to === 'genre_selection') {
      // Reset for new iteration
      this.elements.genresContainer.style.display = 'none';
      this.elements.votingResults.style.display = 'none';
      this.voteData = {};
    }

    // Log to activity
    this.dashboard.modules.activityLog?.addEntry({
      type: 'system',
      source: 'STORY LOOP',
      message: `Phase transition: ${this.formatPhaseName(data.from)} → ${this.formatPhaseName(data.to)}`
    });
  }

  handleGenresReady(data) {
    console.log('📚 Genres ready:', data);
    this.currentGenres = data.genres;

    // Display genres
    this.elements.genresList.innerHTML = data.genres.map((genre, index) => `
      <div class="genre-item">
        <div class="genre-number">${genre.id}</div>
        <div class="genre-info">
          <span class="genre-name">${genre.name}</span>
          <span class="genre-tagline">${genre.tagline}</span>
        </div>
      </div>
    `).join('');

    this.elements.genresContainer.style.display = 'block';

    // Initialize vote bars
    this.voteData = {};
    data.genres.forEach(genre => {
      this.voteData[genre.id] = { name: genre.name, votes: 0, voters: [] };
    });

    this.dashboard.modules.activityLog?.addEntry({
      type: 'system',
      source: 'STORY LOOP',
      message: `Generated ${data.genres.length} genres for voting`
    });
  }

  handleVotingStarted(data) {
    console.log('🗳️ Voting started:', data);
    this.elements.votingResults.style.display = 'block';
    this.updateVoteBars();

    this.dashboard.modules.activityLog?.addEntry({
      type: 'competitions',
      source: 'VOTING',
      message: 'Voting opened - 30 second timer will start on first vote'
    });
  }

  handleVoteReceived(data) {
    console.log('✅ Vote received:', data);

    // Update vote data
    if (!this.voteData[data.genreId]) {
      this.voteData[data.genreId] = { name: data.genreName, votes: 0, voters: [] };
    }

    // Remove previous vote from this user if exists
    Object.values(this.voteData).forEach(genre => {
      genre.voters = genre.voters.filter(v => v !== data.userId);
    });

    // Add new vote
    this.voteData[data.genreId].voters.push(data.userId);

    // Recalculate totals
    Object.values(this.voteData).forEach(genre => {
      genre.votes = genre.voters.length;
    });

    this.updateVoteBars();

    // Update chat display
    this.addChatMessage({
      author: data.author,
      text: `${data.genreId}`,
      isVote: true
    });

    this.dashboard.modules.activityLog?.addEntry({
      type: 'competitions',
      source: 'VOTE',
      message: `${data.author} voted for "${data.genreName}" (${data.totalVotes} total votes)`
    });
  }

  handleTimerCountdown(data) {
    console.log('⏰ Timer countdown:', data);
    this.currentTimer = data.secondsRemaining;
    this.elements.timer.textContent = `${data.secondsRemaining}s`;
  }

  handleVotingComplete(data) {
    console.log('🏆 Voting complete:', data);
    this.currentTimer = null;
    this.elements.timer.textContent = '--';

    if (data.winner) {
      this.elements.winnerAnnouncement.innerHTML = `
        🏆 Winner: <strong>${data.winner.name}</strong> (${data.winner.votes} votes)
      `;
      this.elements.winnerAnnouncement.style.display = 'block';

      this.dashboard.modules.activityLog?.addEntry({
        type: 'competitions',
        source: 'VOTING',
        message: `Winner: "${data.winner.name}" with ${data.winner.votes} votes`
      });
    } else {
      this.elements.winnerAnnouncement.innerHTML = 'No votes received';
      this.elements.winnerAnnouncement.style.display = 'block';
    }
  }

  handleCleanupComplete(data) {
    console.log('🧹 Cleanup complete:', data);

    this.dashboard.modules.activityLog?.addEntry({
      type: 'system',
      source: 'STORY LOOP',
      message: `Iteration ${data.iteration} complete - restarting loop`
    });
  }

  handleChatMessage(data) {
    // Add to recent messages
    this.addChatMessage({
      author: data.author?.name || 'Unknown',
      text: data.text,
      isVote: /^[1-5](?:\s|$)/.test(data.text)
    });
  }

  addChatMessage(message) {
    this.chatMessages.push(message);

    // Keep only last N messages
    if (this.chatMessages.length > this.maxChatMessages) {
      this.chatMessages.shift();
    }

    // Update display
    const messagesHtml = this.chatMessages.map(msg => `
      <div class="chat-message ${msg.isVote ? 'vote' : ''}">
        <span class="chat-author">${msg.author}:</span>
        <span class="chat-text">${this.escapeHtml(msg.text)}</span>
      </div>
    `).join('');

    this.elements.chatMessages.innerHTML = messagesHtml || '<div class="chat-message system">No messages yet</div>';

    // Auto-scroll to bottom
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
  }

  updateVoteBars() {
    const totalVotes = Object.values(this.voteData).reduce((sum, genre) => sum + genre.votes, 0);
    const maxVotes = Math.max(...Object.values(this.voteData).map(g => g.votes), 1);

    const barsHtml = Object.entries(this.voteData).map(([id, data]) => {
      const percentage = maxVotes > 0 ? (data.votes / maxVotes) * 100 : 0;
      return `
        <div class="vote-bar">
          <div class="vote-bar-header">
            <span class="vote-bar-name">${id}. ${data.name}</span>
            <span class="vote-bar-count">${data.votes} ${data.votes === 1 ? 'vote' : 'votes'}</span>
          </div>
          <div class="vote-bar-fill-container">
            <div class="vote-bar-fill" style="width: ${percentage}%"></div>
          </div>
        </div>
      `;
    }).join('');

    this.elements.votesBars.innerHTML = barsHtml || '<p>No votes yet</p>';
  }

  formatPhaseName(phase) {
    const names = {
      'idle': 'Idle',
      'genre_selection': 'Genre Selection',
      'voting_announcement': 'Voting Announcement',
      'vote_collection': 'Vote Collection',
      'agent_competition': 'Agent Competition',
      'judge_selection': 'Judge Selection',
      'scene_construction': 'Scene Construction',
      'scene_presentation': 'Scene Presentation',
      'cleanup_reset': 'Cleanup & Reset'
    };
    return names[phase] || phase;
  }

  getPhaseClass(phase) {
    const classes = {
      'idle': 'badge-inactive',
      'genre_selection': 'badge-primary',
      'voting_announcement': 'badge-primary',
      'vote_collection': 'badge-success',
      'agent_competition': 'badge-warning',
      'judge_selection': 'badge-warning',
      'scene_construction': 'badge-warning',
      'scene_presentation': 'badge-success',
      'cleanup_reset': 'badge-error'
    };
    return classes[phase] || '';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  startLoop() {
    console.log('▶️ Starting story loop');
    // Send WebSocket command to backend
    if (this.dashboard.socket?.readyState === WebSocket.OPEN) {
      this.dashboard.socket.send(JSON.stringify({
        type: 'command',
        command: 'start_story_loop'
      }));
    }

    this.elements.startButton.disabled = true;
    this.elements.stopButton.disabled = false;
  }

  stopLoop() {
    console.log('⏹️ Stopping story loop');
    // Send WebSocket command to backend
    if (this.dashboard.socket?.readyState === WebSocket.OPEN) {
      this.dashboard.socket.send(JSON.stringify({
        type: 'command',
        command: 'stop_story_loop'
      }));
    }

    this.elements.startButton.disabled = false;
    this.elements.stopButton.disabled = true;
  }

  destroy() {
    console.log('🗑️ Destroying Story Loop Controller');
  }
}

// Export for use in dashboard-core.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StoryLoopController;
}
