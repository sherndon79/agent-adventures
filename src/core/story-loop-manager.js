/**
 * Story Loop Manager - Orchestrates the 8-phase story loop
 *
 * Phase State Machine:
 * 1. genre_selection - LLM generates 5 genres
 * 2. voting_announcement - Post voting options to chat
 * 3. vote_collection - Collect votes, timer, determine winner
 * 4. agent_competition - (Future) Agents design scenes
 * 5. judge_selection - (Future) Judge selects winner
 * 6. scene_construction - (Future) Build winning scene
 * 7. scene_presentation - (Future) 60s presentation
 * 8. cleanup_reset - Clear scene, countdown, restart loop
 *
 * MVP Phase 1: Implements phases 1, 2, 3, 8 only
 */

import { EventEmitter } from 'eventemitter3';

export class StoryLoopManager extends EventEmitter {
  constructor({
    eventBus,
    storyState,
    mcpClients,
    chatPoster,
    voteCollector,
    voteTimer,
    logger = console
  }) {
    super();

    if (!eventBus?.emit || !eventBus?.subscribe) {
      throw new Error('EventBus with emit and subscribe capability is required');
    }
    if (!storyState) {
      throw new Error('StoryState is required');
    }
    if (!mcpClients) {
      throw new Error('MCP clients are required');
    }
    if (!chatPoster) {
      throw new Error('ChatMessagePoster is required');
    }
    if (!voteCollector) {
      throw new Error('VoteCollector is required');
    }
    if (!voteTimer) {
      throw new Error('VoteTimer is required');
    }

    this.eventBus = eventBus;
    this.storyState = storyState;
    this.mcpClients = mcpClients;
    this.chatPoster = chatPoster;
    this.voteCollector = voteCollector;
    this.voteTimer = voteTimer;
    this.logger = logger;

    // Phase state machine (MVP Phase 1 only)
    this.phases = [
      'genre_selection',
      'voting_announcement',
      'vote_collection',
      'cleanup_reset'
    ];

    this.phase = 'idle';
    this.iteration = 0;
    this.currentGenres = [];
    this.currentWinner = null;

    // Cleanup timer
    this.cleanupTimer = null;

    // Metrics
    this.metrics = {
      loopIterations: 0,
      genresGenerated: 0,
      votingRounds: 0,
      scenesCleared: 0,
      errors: 0
    };

    // Setup event listeners
    this._setupEventListeners();
  }

  /**
   * Start the story loop
   */
  async start() {
    if (this.phase !== 'idle') {
      this.logger.warn('[StoryLoopManager] Loop already running');
      return;
    }

    this.logger.info('[StoryLoopManager] Starting story loop');
    this.iteration = 0;

    // Initialize loop state in StoryState
    this.storyState.updateState('loop', {
      phase: 'idle',
      iteration: 0,
      startTime: Date.now(),
      phaseStartTime: Date.now()
    });

    this.storyState.updateState('voting', {
      genres: [],
      votes: {},
      winner: null,
      timerStarted: null
    });

    // Begin Phase 1
    await this._transitionToPhase('genre_selection');
  }

  /**
   * Stop the story loop
   */
  stop() {
    this.logger.info('[StoryLoopManager] Stopping story loop');

    // Clear timers
    this._clearCleanupTimers();

    // Stop vote timer
    if (this.voteTimer) {
      this.voteTimer.cancel();
    }

    // Stop vote collector
    if (this.voteCollector) {
      this.voteCollector.stopVoting();
    }

    this.phase = 'idle';

    this.eventBus.emit('loop:stopped', {
      timestamp: Date.now(),
      iteration: this.iteration
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      phase: this.phase,
      iteration: this.iteration,
      currentGenres: this.currentGenres,
      currentWinner: this.currentWinner,
      metrics: this.metrics
    };
  }

  /**
   * Setup event listeners
   */
  _setupEventListeners() {
    // Listen for LLM responses (Phase 1)
    this.eventBus.subscribe('orchestrator:llm:result', (event) => {
      const payload = event.payload || event;
      if (this.phase === 'genre_selection' && payload.requestId === this.genreRequestId) {
        this._handleGenreResponse(payload);
      }
    });

    // Listen for voting completion (Phase 3)
    this.eventBus.subscribe('voting:complete', (event) => {
      if (this.phase === 'vote_collection') {
        this._handleVotingComplete(event.payload || event);
      }
    });

    // Listen for timer countdown events to post notifications
    this.eventBus.subscribe('timer:countdown', (event) => {
      if (this.phase === 'vote_collection') {
        this._handleVoteCountdown(event.payload || event);
      }
    });
  }

  /**
   * Transition to a new phase
   */
  async _transitionToPhase(newPhase) {
    const oldPhase = this.phase;
    this.phase = newPhase;

    this.logger.info('[StoryLoopManager] Phase transition', {
      from: oldPhase,
      to: newPhase,
      iteration: this.iteration
    });

    // Update StoryState
    this.storyState.updateState('loop.phase', newPhase);
    this.storyState.updateState('loop.phaseStartTime', Date.now());

    // Emit phase change event
    this.eventBus.emit('loop:phase_changed', {
      from: oldPhase,
      to: newPhase,
      iteration: this.iteration,
      timestamp: Date.now()
    });

    // Call phase handler
    try {
      await this._executePhaseHandler(newPhase);
    } catch (error) {
      this.metrics.errors++;
      this.logger.error('[StoryLoopManager] Phase handler error', {
        phase: newPhase,
        error: error.message
      });

      // Emit error event
      this.eventBus.emit('loop:error', {
        phase: newPhase,
        error: error.message,
        timestamp: Date.now()
      });

      // Recovery: skip to cleanup phase
      await this._transitionToPhase('cleanup_reset');
    }
  }

  /**
   * Execute the handler for the current phase
   */
  async _executePhaseHandler(phase) {
    switch (phase) {
      case 'genre_selection':
        await this._handleGenreSelection();
        break;
      case 'voting_announcement':
        await this._handleVotingAnnouncement();
        break;
      case 'vote_collection':
        await this._handleVoteCollection();
        break;
      case 'cleanup_reset':
        await this._handleCleanupReset();
        break;
      default:
        throw new Error(`Unknown phase: ${phase}`);
    }
  }

  /**
   * Phase 1: Genre Selection
   * Request LLM to generate 5 genres
   */
  async _handleGenreSelection() {
    this.logger.info('[StoryLoopManager] Phase 1: Genre Selection');

    // Generate unique request ID
    const requestId = `genre_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store request ID for response handling
    this.genreRequestId = requestId;

    // Emit LLM request for genre generation
    this.eventBus.emit('orchestrator:llm:request', {
      requestId,
      stageConfig: {
        payload: {
          provider: 'claude',
          maxTokens: 500,
          systemPrompt: '',
          userPrompt: `Generate 5 distinct static 3D scene concepts for visualization.
Each scene should be visually striking and achievable with basic primitives (cubes, spheres, cylinders).
Focus on visual composition, not narrative.

IMPORTANT: Scene names must be 30 characters or less to fit YouTube chat message limits.

Return JSON:
{
  "genres": [
    { "id": 1, "name": "string (max 30 chars)", "tagline": "string (brief visual description)" },
    { "id": 2, "name": "string (max 30 chars)", "tagline": "string" },
    { "id": 3, "name": "string (max 30 chars)", "tagline": "string" },
    { "id": 4, "name": "string (max 30 chars)", "tagline": "string" },
    { "id": 5, "name": "string (max 30 chars)", "tagline": "string" }
  ]
}`,
          responseFormat: {
            type: 'json_schema',
            name: 'GenreListResponse',
            schema: {
              type: 'object',
              properties: {
                genres: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'number' },
                      name: { type: 'string' },
                      tagline: { type: 'string' }
                    },
                    required: ['id', 'name', 'tagline']
                  },
                  minItems: 5,
                  maxItems: 5
                }
              },
              required: ['genres']
            }
          }
        }
      }
    });

    // Response will be handled by _handleGenreResponse
  }

  /**
   * Handle LLM response for genre generation
   */
  async _handleGenreResponse(response) {
    try {
      // Extract result from orchestrator response
      const result = response.result || response;

      // Parse JSON response
      let genreData;
      if (result.json) {
        // Already parsed JSON from orchestrator
        genreData = result.json;
      } else if (typeof result.text === 'string') {
        // Parse from text
        genreData = JSON.parse(result.text);
      } else if (typeof result.content === 'string') {
        // Fallback to content
        genreData = JSON.parse(result.content);
      } else {
        genreData = result.content || result;
      }

      // Validate genres
      if (!genreData.genres || !Array.isArray(genreData.genres) || genreData.genres.length !== 5) {
        throw new Error('Invalid genre response format');
      }

      this.currentGenres = genreData.genres;
      this.metrics.genresGenerated++;

      this.logger.info('[StoryLoopManager] Genres generated', {
        genres: this.currentGenres.map(g => g.name)
      });

      // Store in StoryState
      this.storyState.updateState('voting.genres', this.currentGenres);

      // Emit genres ready event
      this.eventBus.emit('loop:genres_ready', {
        genres: this.currentGenres,
        timestamp: Date.now()
      });

      // Transition to Phase 2
      await this._transitionToPhase('voting_announcement');

    } catch (error) {
      this.logger.error('[StoryLoopManager] Failed to parse genre response', error);
      throw error;
    }
  }

  /**
   * Phase 2: Voting Announcement
   * Post voting options to chat and initialize voting
   */
  async _handleVotingAnnouncement() {
    this.logger.info('[StoryLoopManager] Phase 2: Voting Announcement');

    // Post voting announcement to chat
    await this.chatPoster.postVotingAnnouncement(this.currentGenres);

    // Initialize vote collector
    this.voteCollector.startVoting(this.currentGenres);

    // Vote timer will auto-start on first vote
    this.metrics.votingRounds++;

    // Emit voting started event
    this.eventBus.emit('loop:voting_started', {
      genres: this.currentGenres,
      timestamp: Date.now()
    });

    // Transition to Phase 3
    await this._transitionToPhase('vote_collection');
  }

  /**
   * Phase 3: Vote Collection
   * Wait for voting to complete (timer will trigger voting:complete)
   */
  async _handleVoteCollection() {
    this.logger.info('[StoryLoopManager] Phase 3: Vote Collection - waiting for votes');

    // Store timer start time in StoryState
    this.storyState.updateState('voting.timerStarted', Date.now());

    // Event listener will handle voting:complete
  }

  /**
   * Handle vote countdown notifications
   */
  async _handleVoteCountdown(event) {
    const { secondsRemaining } = event;

    // Post single warning at 10 seconds (quota conservation)
    if (secondsRemaining === 10) {
      await this.chatPoster.postCountdown(secondsRemaining);
    }
  }

  /**
   * Handle voting completion
   */
  async _handleVotingComplete(event) {
    this.logger.info('[StoryLoopManager] Voting complete');

    // Stop vote collector
    const votingResult = this.voteCollector.stopVoting();

    // Get winner
    const winnerResult = this.voteCollector.getWinner();
    this.currentWinner = winnerResult.winner;

    this.logger.info('[StoryLoopManager] Winner determined', {
      winner: this.currentWinner?.name,
      votes: this.currentWinner?.votes,
      hadTie: winnerResult.hadTie
    });

    // Store winner in StoryState
    this.storyState.updateState('voting.winner', this.currentWinner);
    this.storyState.updateState('voting.votes', votingResult);

    // Post winner announcement
    if (this.currentWinner) {
      await this.chatPoster.postWinnerAnnouncement(this.currentWinner.name);
    } else {
      // No votes received
      await this.chatPoster.postMessage('No votes received. Starting cleanup...');
    }

    // Emit voting complete event
    this.eventBus.emit('loop:voting_complete', {
      winner: this.currentWinner,
      tally: this.voteCollector.getTally(),
      totalVotes: votingResult.totalVotes,
      timestamp: Date.now()
    });

    // For MVP Phase 1: Skip to Phase 8 (later will go to Phase 4)
    await this._transitionToPhase('cleanup_reset');
  }

  /**
   * Phase 8: Cleanup & Reset
   * 60-second countdown, clear scene, restart loop
   */
  async _handleCleanupReset() {
    this.logger.info('[StoryLoopManager] Phase 8: Cleanup & Reset');

    const cleanupDuration = 60; // seconds

    // Post single notification about cleanup
    await this.chatPoster.postMessage(`🔄 Stage will be cleared in ${cleanupDuration} seconds. Next round starting soon!`);

    // Schedule scene clear and loop restart
    this.cleanupTimer = setTimeout(async () => {
      await this._completeCleanup();
    }, cleanupDuration * 1000);
  }

  /**
   * Complete cleanup and restart loop
   */
  async _completeCleanup() {
    try {
      this.logger.info('[StoryLoopManager] Clearing scene');

      // Clear scene via MCP
      try {
        await this.mcpClients.worldBuilder.clearScene({
          path: '/World',
          confirm: true
        });
        this.metrics.scenesCleared++;
      } catch (error) {
        this.logger.error('[StoryLoopManager] Failed to clear scene', error);
      }

      // Clear timers
      this._clearCleanupTimers();

      // Reset loop state
      this.iteration++;
      this.currentGenres = [];
      this.currentWinner = null;
      this.metrics.loopIterations++;

      // Reset StoryState
      this.storyState.updateState('loop.iteration', this.iteration);
      this.storyState.updateState('voting', {
        genres: [],
        votes: {},
        winner: null,
        timerStarted: null
      });

      // Emit cleanup complete
      this.eventBus.emit('loop:cleanup_complete', {
        iteration: this.iteration,
        timestamp: Date.now()
      });

      this.logger.info('[StoryLoopManager] Cleanup complete, restarting loop', {
        iteration: this.iteration
      });

      // Restart loop at Phase 1
      await this._transitionToPhase('genre_selection');

    } catch (error) {
      this.logger.error('[StoryLoopManager] Cleanup failed', error);
      this.metrics.errors++;

      // Try to restart anyway
      this.iteration++;
      await this._transitionToPhase('genre_selection');
    }
  }

  /**
   * Clear cleanup timers
   */
  _clearCleanupTimers() {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.stop();
    this.removeAllListeners();
  }
}

export default StoryLoopManager;
