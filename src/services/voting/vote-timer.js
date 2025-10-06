/**
 * Vote Timer - Manages voting countdown with notifications
 *
 * Starts on first vote, counts down from configured duration,
 * emits notifications at key intervals, and triggers voting completion.
 */

export class VoteTimer {
  constructor({ eventBus, duration = 30, notificationIntervals = [10], suppressNotifications = false, logger = console }) {
    if (!eventBus?.emit || !eventBus?.subscribe) {
      throw new Error('EventBus with emit and subscribe capability is required');
    }

    this.eventBus = eventBus;
    this.duration = duration; // seconds
    this.notificationIntervals = notificationIntervals.sort((a, b) => b - a); // Descending order
    this.suppressNotifications = suppressNotifications; // For self-test mode
    this.logger = logger;

    // Timer state
    this.isRunning = false;
    this.startTime = null;
    this.endTime = null;
    this.timer = null;
    this.notificationTimers = [];

    // Metrics
    this.metrics = {
      timersStarted: 0,
      timersCancelled: 0,
      timersCompleted: 0,
      notificationsSent: 0
    };

    // Subscribe to vote events to auto-start
    this.voteSubscription = this.eventBus.subscribe('vote:received', (event) => {
      this._handleVoteReceived(event.payload || event);
    });

    // Subscribe to voting:complete to cancel timer if triggered externally (e.g., self-test mode)
    this.completeSubscription = this.eventBus.subscribe('voting:complete', (event) => {
      this._handleVotingComplete(event.payload || event);
    });
  }

  /**
   * Start the timer
   */
  start() {
    if (this.isRunning) {
      this.logger.warn('[VoteTimer] Timer already running');
      return;
    }

    this.isRunning = true;
    this.startTime = Date.now();
    this.endTime = this.startTime + (this.duration * 1000);

    this.metrics.timersStarted++;

    this.logger.info('[VoteTimer] Timer started', {
      duration: this.duration,
      endTime: new Date(this.endTime).toISOString()
    });

    // Emit timer started event
    this.eventBus.emit('timer:started', {
      duration: this.duration,
      startTime: this.startTime,
      endTime: this.endTime
    });

    // Schedule notifications
    this._scheduleNotifications();

    // Schedule completion
    this.timer = setTimeout(() => {
      this._complete();
    }, this.duration * 1000);
  }

  /**
   * Cancel the timer
   */
  cancel() {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('[VoteTimer] Timer cancelled');

    this._clearTimers();

    this.isRunning = false;
    this.startTime = null;
    this.endTime = null;

    this.metrics.timersCancelled++;

    this.eventBus.emit('timer:cancelled', {
      timestamp: Date.now()
    });
  }

  /**
   * Get remaining time in seconds
   */
  getRemaining() {
    if (!this.isRunning) {
      return 0;
    }

    const remaining = Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
    return remaining;
  }

  /**
   * Get timer status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      duration: this.duration,
      remaining: this.getRemaining(),
      startTime: this.startTime,
      endTime: this.endTime,
      metrics: this.metrics
    };
  }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.cancel();

    if (this.voteSubscription) {
      this.voteSubscription();
      this.voteSubscription = null;
    }

    if (this.completeSubscription) {
      this.completeSubscription();
      this.completeSubscription = null;
    }
  }

  /**
   * Handle vote received event (auto-start on first vote)
   */
  _handleVoteReceived(event) {
    // Only start on first vote
    if (!this.isRunning && event.totalVotes === 1) {
      this.logger.info('[VoteTimer] First vote received, starting timer');
      this.start();
    }
  }

  /**
   * Handle voting:complete event (cancel timer if triggered externally)
   */
  _handleVotingComplete(event) {
    // If timer is running and voting was completed externally (e.g., self-test mode),
    // cancel the timer to prevent duplicate voting:complete events
    if (this.isRunning && event.selfTest) {
      this.logger.info('[VoteTimer] External voting completion detected (self-test), cancelling timer');
      this.cancel();
    }
  }

  /**
   * Schedule countdown notifications
   */
  _scheduleNotifications() {
    // Skip notifications if suppressed (e.g., self-test mode)
    if (this.suppressNotifications) {
      this.logger.info('[VoteTimer] Notifications suppressed (self-test mode)');
      return;
    }

    for (const interval of this.notificationIntervals) {
      if (interval >= this.duration) {
        continue; // Skip intervals >= timer duration
      }

      const delay = (this.duration - interval) * 1000;
      const timer = setTimeout(() => {
        this._sendNotification(interval);
      }, delay);

      this.notificationTimers.push(timer);
    }
  }

  /**
   * Send countdown notification
   */
  _sendNotification(secondsRemaining) {
    this.metrics.notificationsSent++;

    this.logger.info('[VoteTimer] Countdown notification', {
      secondsRemaining
    });

    this.eventBus.emit('timer:countdown', {
      secondsRemaining,
      timestamp: Date.now()
    });
  }

  /**
   * Complete the timer
   */
  _complete() {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('[VoteTimer] Timer completed');

    this._clearTimers();

    this.isRunning = false;
    const completedAt = Date.now();

    this.metrics.timersCompleted++;

    this.eventBus.emit('timer:complete', {
      duration: this.duration,
      startTime: this.startTime,
      completedAt
    });

    // Trigger voting completion
    this.eventBus.emit('voting:complete', {
      timestamp: completedAt
    });

    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Clear all timers
   */
  _clearTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    for (const timer of this.notificationTimers) {
      clearTimeout(timer);
    }
    this.notificationTimers = [];
  }
}

export default VoteTimer;
