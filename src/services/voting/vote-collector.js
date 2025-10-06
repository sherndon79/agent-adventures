/**
 * Vote Collector - Collects and validates votes from chat messages
 *
 * Filters chat messages for valid votes (1-5), tracks votes by user,
 * allows vote updates, and emits vote events to the event bus.
 */

export class VoteCollector {
  constructor({ eventBus, logger = console, selfTestChannelId = null }) {
    if (!eventBus?.emit || !eventBus?.subscribe) {
      throw new Error('EventBus with emit and subscribe capability is required');
    }

    this.eventBus = eventBus;
    this.logger = logger;
    this.selfTestChannelId = selfTestChannelId; // YouTube channel ID for self-test mode

    // Vote validation regex (must start with 1-5)
    this.votePattern = /^[1-5](?:\s|$)/;

    // Vote tracking
    this.votes = new Map(); // userId -> { genreId, timestamp, author }
    this.isActive = false;
    this.currentGenres = [];

    // Session isolation
    this.sessionId = null;
    this.sessionStartTime = null;
    this.messagesSeen = new Set(); // Track message IDs within current session

    // Metrics
    this.metrics = {
      messagesProcessed: 0,
      validVotes: 0,
      invalidVotes: 0,
      voteUpdates: 0,
      rejectedReasons: {
        invalidFormat: 0,
        notActive: 0,
        invalidGenreId: 0,
        oldSession: 0
      }
    };

    // Subscribe to chat messages
    this.subscription = this.eventBus.subscribe('chat:message', (event) => {
      this._handleChatMessage(event.payload || event);
    });
  }

  /**
   * Start collecting votes for given genres
   */
  startVoting(genres) {
    if (!Array.isArray(genres) || genres.length === 0) {
      throw new Error('Genres array is required');
    }

    // Create new session
    this.sessionId = `vote_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.sessionStartTime = Date.now();

    // Reset session-specific data
    this.currentGenres = genres;
    this.votes.clear();
    this.messagesSeen.clear();
    this.isActive = true;

    this.logger.info('[VoteCollector] Voting started', {
      sessionId: this.sessionId,
      genreCount: genres.length,
      genres: genres.map(g => g.name)
    });

    this.eventBus.emit('voting:started', {
      sessionId: this.sessionId,
      genres,
      timestamp: this.sessionStartTime
    });
  }

  /**
   * Stop collecting votes
   */
  stopVoting() {
    if (!this.isActive) {
      return { totalVotes: 0, uniqueVoters: 0 };
    }

    this.isActive = false;

    const result = {
      totalVotes: this.votes.size,
      uniqueVoters: this.votes.size,
      votes: Array.from(this.votes.entries()).map(([userId, voteData]) => ({
        userId,
        ...voteData
      })),
      timestamp: Date.now()
    };

    this.logger.info('[VoteCollector] Voting stopped', {
      totalVotes: result.totalVotes,
      uniqueVoters: result.uniqueVoters
    });

    this.eventBus.emit('voting:stopped', result);

    return result;
  }

  /**
   * Get current vote tally
   */
  getTally() {
    const tally = {};

    // Initialize tally for all genres
    this.currentGenres.forEach((genre, index) => {
      tally[index + 1] = {
        genreId: index + 1,
        name: genre.name,
        votes: 0,
        voters: []
      };
    });

    // Count votes
    for (const [userId, voteData] of this.votes.entries()) {
      const genreId = voteData.genreId;
      if (tally[genreId]) {
        tally[genreId].votes++;
        tally[genreId].voters.push({
          userId,
          author: voteData.author,
          timestamp: voteData.timestamp
        });
      }
    }

    return {
      tally,
      totalVotes: this.votes.size,
      uniqueVoters: this.votes.size,
      timestamp: Date.now()
    };
  }

  /**
   * Get winning genre
   */
  getWinner() {
    const { tally } = this.getTally();

    // Find genre with most votes
    let winner = null;
    let maxVotes = 0;
    const ties = [];

    for (const [genreId, data] of Object.entries(tally)) {
      if (data.votes > maxVotes) {
        maxVotes = data.votes;
        winner = { genreId: Number.parseInt(genreId, 10), ...data };
        ties.length = 0;
      } else if (data.votes === maxVotes && data.votes > 0) {
        if (!ties.length && winner) {
          ties.push(winner);
        }
        ties.push({ genreId: Number.parseInt(genreId, 10), ...data });
      }
    }

    // Handle ties with random selection
    if (ties.length > 0) {
      const randomIndex = Math.floor(Math.random() * ties.length);
      winner = ties[randomIndex];

      this.logger.info('[VoteCollector] Tie detected, random winner selected', {
        tiedGenres: ties.map(t => t.name),
        winner: winner.name
      });
    }

    return {
      winner,
      hadTie: ties.length > 0,
      tiedGenres: ties,
      totalVotes: maxVotes,
      timestamp: Date.now()
    };
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentVotes: this.votes.size,
      isActive: this.isActive,
      genreCount: this.currentGenres.length,
      sessionId: this.sessionId,
      sessionStartTime: this.sessionStartTime,
      messagesSeenInSession: this.messagesSeen.size
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    if (this.subscription) {
      this.subscription();
      this.subscription = null;
    }
    this.votes.clear();
    this.isActive = false;
  }

  /**
   * Handle incoming chat message
   */
  _handleChatMessage(message) {
    this.metrics.messagesProcessed++;

    // Check if voting is active
    if (!this.isActive) {
      return;
    }

    // Session isolation: Check message timestamp
    if (message.publishedAt) {
      const messageTime = new Date(message.publishedAt).getTime();
      if (messageTime < this.sessionStartTime) {
        // Message is from before this voting session started
        this.metrics.rejectedReasons.oldSession++;
        return;
      }
    }

    // Session isolation: Deduplicate messages within this session
    if (message.messageId) {
      if (this.messagesSeen.has(message.messageId)) {
        // Already processed this message in current session
        return;
      }
      this.messagesSeen.add(message.messageId);

      // Trim cache if too large (keep last 500 within session)
      if (this.messagesSeen.size > 500) {
        const toRemove = Array.from(this.messagesSeen).slice(0, 100);
        toRemove.forEach(id => this.messagesSeen.delete(id));
      }
    }

    // Validate vote format
    const match = message.text.match(this.votePattern);
    if (!match) {
      this.metrics.invalidVotes++;
      this.metrics.rejectedReasons.invalidFormat++;
      return;
    }

    // Extract genre ID
    const genreId = Number.parseInt(message.text.charAt(0), 10);

    // Validate genre ID is in range
    if (genreId < 1 || genreId > this.currentGenres.length) {
      this.metrics.invalidVotes++;
      this.metrics.rejectedReasons.invalidGenreId++;
      this.logger.warn('[VoteCollector] Invalid genre ID', {
        genreId,
        maxGenres: this.currentGenres.length,
        author: message.author.name
      });
      return;
    }

    // Check if user has already voted
    const userId = message.author.id;
    const hadPreviousVote = this.votes.has(userId);
    const previousVote = hadPreviousVote ? this.votes.get(userId).genreId : null;

    // Record vote (will update if already exists)
    this.votes.set(userId, {
      genreId,
      timestamp: message.publishedAt || new Date().toISOString(),
      author: message.author.name,
      messageId: message.messageId
    });

    this.metrics.validVotes++;

    if (hadPreviousVote) {
      this.metrics.voteUpdates++;
      this.logger.info('[VoteCollector] Vote updated', {
        author: message.author.name,
        previousVote,
        newVote: genreId
      });
    } else {
      this.logger.info('[VoteCollector] Vote received', {
        author: message.author.name,
        genreId,
        genreName: this.currentGenres[genreId - 1]?.name
      });
    }

    // Emit vote event
    this.eventBus.emit('vote:received', {
      userId,
      genreId,
      genreName: this.currentGenres[genreId - 1]?.name,
      author: message.author.name,
      isUpdate: hadPreviousVote,
      totalVotes: this.votes.size,
      timestamp: Date.now()
    });

    // Self-test mode: Auto-complete voting if vote is from bot's own channel
    if (this.selfTestChannelId && userId === this.selfTestChannelId) {
      this.logger.info('[VoteCollector] Self-test vote detected - auto-completing voting', {
        author: message.author.name,
        genreId,
        genreName: this.currentGenres[genreId - 1]?.name
      });

      // Emit immediate voting completion
      setTimeout(() => {
        this.eventBus.emit('voting:complete', {
          timestamp: Date.now(),
          selfTest: true
        });
      }, 100); // Small delay to ensure vote:received is processed first
    }
  }
}

export default VoteCollector;
