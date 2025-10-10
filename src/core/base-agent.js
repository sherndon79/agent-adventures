import { EventEmitter } from 'eventemitter3';

/**
 * Base class for all adventure agents
 * Provides common functionality for plugin-based agent system
 */
export class BaseAgent extends EventEmitter {
  constructor(id, config = {}, dependencies = {}) {
    super();

    this.id = id;
    this.config = config;
    this.dependencies = dependencies;

    // Agent lifecycle state
    this.state = 'created';
    this.startTime = null;
    this.metrics = {
      eventsHandled: 0,
      eventsEmitted: 0,
      errorsEncountered: 0,
      averageResponseTime: 0,
      lastActivity: null
    };

    // Event subscriptions tracking
    this.eventSubscriptions = new Map();
    this.stateSubscriptions = new Map();

    // Health monitoring
    this.healthCheck = {
      status: 'unknown',
      lastCheck: null,
      issues: []
    };

    // Bind context for event handlers
    this.handleEvent = this.handleEvent.bind(this);
    this.onStateChange = this.onStateChange.bind(this);
  }

  /**
   * Initialize the agent - called once during loading
   */
  async initialize() {
    this.state = 'initializing';

    try {
      // Set up event subscriptions
      await this._setupEventSubscriptions();

      // Set up state subscriptions
      await this._setupStateSubscriptions();

      // Agent-specific initialization
      await this._initialize();

      this.state = 'initialized';
      this.emit('agent:initialized', { agentId: this.id });

      return { success: true };
    } catch (error) {
      this.state = 'error';
      this.emit('agent:error', { agentId: this.id, error, phase: 'initialization' });
      throw error;
    }
  }

  /**
   * Start the agent - called to begin active operation
   */
  async start() {
    if (this.state !== 'initialized' && this.state !== 'stopped') {
      throw new Error(`Cannot start agent from state: ${this.state}`);
    }

    this.state = 'starting';

    try {
      await this._start();

      this.state = 'running';
      this.startTime = Date.now();
      this.emit('agent:started', { agentId: this.id });

      // Begin health monitoring
      this._startHealthMonitoring();

      return { success: true };
    } catch (error) {
      this.state = 'error';
      this.emit('agent:error', { agentId: this.id, error, phase: 'start' });
      throw error;
    }
  }

  /**
   * Stop the agent - graceful shutdown
   */
  async stop() {
    if (this.state !== 'running') {
      return { success: true, reason: `Agent not running (state: ${this.state})` };
    }

    this.state = 'stopping';

    try {
      await this._stop();

      this.state = 'stopped';
      this.emit('agent:stopped', { agentId: this.id });

      return { success: true };
    } catch (error) {
      this.state = 'error';
      this.emit('agent:error', { agentId: this.id, error, phase: 'stop' });
      throw error;
    }
  }

  /**
   * Destroy the agent - cleanup all resources
   */
  async destroy() {
    try {
      if (this.state === 'running') {
        await this.stop();
      }

      // Cleanup subscriptions
      this._cleanupSubscriptions();

      // Stop health monitoring
      this._stopHealthMonitoring();

      // Agent-specific cleanup
      await this._destroy();

      this.state = 'destroyed';
      this.emit('agent:destroyed', { agentId: this.id });

      return { success: true };
    } catch (error) {
      this.emit('agent:error', { agentId: this.id, error, phase: 'destroy' });
      throw error;
    }
  }

  /**
   * Handle incoming events - main event processing entry point
   */
  async handleEvent(event) {
    if (this.state !== 'running') {
      return { handled: false, reason: `Agent not running (state: ${this.state})` };
    }

    const startTime = Date.now();

    try {
      this.metrics.eventsHandled++;
      this.metrics.lastActivity = startTime;

      // The actual event handling logic is now in the specific handler
      // or in the _handleEvent method if no specific handler is provided.
      const result = await this._handleEvent(event.type, event.payload, event);

      // Update response time metrics
      const responseTime = Date.now() - startTime;
      this._updateResponseTimeMetric(responseTime);

      return {
        handled: true,
        result,
        responseTime
      };

    } catch (error) {
      this.metrics.errorsEncountered++;
      this.emit('agent:error', {
        agentId: this.id,
        error,
        phase: 'event-handling',
        eventType: event.type
      });

      return {
        handled: false,
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }

  /**
   * Handle state changes
   */
  async onStateChange(change) {
    if (this.state !== 'running') {
      return;
    }

    try {
      await this._onStateChange(change.path, change.newValue, change.oldValue, change);
    } catch (error) {
      this.metrics.errorsEncountered++;
      this.emit('agent:error', {
        agentId: this.id,
        error,
        phase: 'state-change-handling',
        path: change.path
      });
    }
  }

  /**
   * Emit events through the system
   */
  emitEvent(eventType, payload = {}) {
    this.metrics.eventsEmitted++;

    if (this.dependencies.eventBus) {
      this.dependencies.eventBus.emit(eventType, payload);
    } else {
      console.warn(`[Agent ${this.id}] No event bus available to emit: ${eventType}`);
    }
  }

  /**
   * Emit async events
   */
  async emitEventAsync(eventType, payload = {}) {
    this.metrics.eventsEmitted++;

    if (this.dependencies.eventBus) {
      return await this.dependencies.eventBus.emitAsync(eventType, payload);
    } else {
      console.warn(`[Agent ${this.id}] No event bus available to emit: ${eventType}`);
      return [];
    }
  }

  /**
   * Get current agent status
   */
  getStatus() {
    return {
      id: this.id,
      state: this.state,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      metrics: { ...this.metrics },
      health: { ...this.healthCheck },
      subscriptions: {
        events: Array.from(this.eventSubscriptions.keys()),
        state: Array.from(this.stateSubscriptions.keys())
      }
    };
  }

  /**
   * Get agent metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      errorRate: this.metrics.eventsHandled > 0
        ? (this.metrics.errorsEncountered / this.metrics.eventsHandled) * 100
        : 0
    };
  }

  /**
   * Perform health check
   */
  async performHealthCheck() {
    const startTime = Date.now();
    const issues = [];

    try {
      // Basic health checks
      if (this.state !== 'running') {
        issues.push({ type: 'state', message: `Agent not running: ${this.state}` });
      }

      if (this.metrics.errorsEncountered > 0) {
        const errorRate = (this.metrics.errorsEncountered / this.metrics.eventsHandled) * 100;
        if (errorRate > 10) { // 10% error rate threshold
          issues.push({ type: 'errors', message: `High error rate: ${errorRate.toFixed(1)}%` });
        }
      }

      // Agent-specific health checks
      const agentIssues = await this._performHealthCheck();
      issues.push(...(agentIssues || []));

      this.healthCheck = {
        status: issues.length === 0 ? 'healthy' : 'degraded',
        lastCheck: Date.now(),
        issues,
        checkDuration: Date.now() - startTime
      };

      return this.healthCheck;

    } catch (error) {
      this.healthCheck = {
        status: 'unhealthy',
        lastCheck: Date.now(),
        issues: [{ type: 'health-check-failed', message: error.message }],
        checkDuration: Date.now() - startTime
      };

      return this.healthCheck;
    }
  }

  // ========== Abstract/Override Methods ==========

  /**
   * Get event subscriptions - override in subclasses
   */
  getEventSubscriptions() {
    return [];
  }

  /**
   * Get state subscriptions - override in subclasses
   */
  getStateSubscriptions() {
    return [];
  }

  /**
   * Agent-specific initialization - override in subclasses
   */
  async _initialize() {
    // Override in subclasses
  }

  /**
   * Agent-specific start logic - override in subclasses
   */
  async _start() {
    // Override in subclasses
  }

  /**
   * Agent-specific stop logic - override in subclasses
   */
  async _stop() {
    // Override in subclasses
  }

  /**
   * Agent-specific cleanup - override in subclasses
   */
  async _destroy() {
    // Override in subclasses
  }

  /**
   * Handle specific events - override in subclasses
   */
  async _handleEvent(eventType, payload, event) {
    // Override in subclasses
    return { processed: false, reason: 'No event handler implemented' };
  }

  /**
   * Handle state changes - override in subclasses
   */
  async _onStateChange(path, newValue, oldValue, change) {
    // Override in subclasses
  }

  /**
   * Agent-specific health checks - override in subclasses
   */
  async _performHealthCheck() {
    return []; // Return array of issues, empty array = healthy
  }

  // ========== Private Helper Methods ==========

  /**
   * Set up event subscriptions
   */
  async _setupEventSubscriptions() {
    const subscriptions = this.getEventSubscriptions();
    const eventBus = this.dependencies.eventBus;

    if (!eventBus || !subscriptions.length) {
      return;
    }

    for (const subscription of subscriptions) {
      const { eventType, handler, priority = 0, once = false } = subscription;

      const eventHandler = handler ? handler.bind(this) : this.handleEvent;

      const unsubscribe = eventBus.subscribe(eventType, eventHandler, {
        priority,
        once
      });

      this.eventSubscriptions.set(eventType, unsubscribe);
    }
  }

  /**
   * Set up state subscriptions
   */
  async _setupStateSubscriptions() {
    const subscriptions = this.getStateSubscriptions();
    const storyState = this.dependencies.storyState;

    if (!storyState || !subscriptions.length) {
      return;
    }

    for (const subscription of subscriptions) {
      const { path } = subscription;

      const unsubscribe = storyState.subscribeToChanges(path, this.onStateChange);
      this.stateSubscriptions.set(path, unsubscribe);
    }
  }

  /**
   * Cleanup all subscriptions
   */
  _cleanupSubscriptions() {
    // Cleanup event subscriptions
    for (const unsubscribe of this.eventSubscriptions.values()) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn(`Error unsubscribing event for agent ${this.id}:`, error);
      }
    }
    this.eventSubscriptions.clear();

    // Cleanup state subscriptions
    for (const unsubscribe of this.stateSubscriptions.values()) {
      try {
        unsubscribe();
      } catch (error) {
        console.warn(`Error unsubscribing state for agent ${this.id}:`, error);
      }
    }
    this.stateSubscriptions.clear();
  }

  /**
   * Start health monitoring
   */
  _startHealthMonitoring() {
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(
        () => this.performHealthCheck(),
        this.config.healthCheckInterval
      );
    }
  }

  /**
   * Stop health monitoring
   */
  _stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Update response time metrics
   */
  _updateResponseTimeMetric(responseTime) {
    const totalEvents = this.metrics.eventsHandled;
    this.metrics.averageResponseTime =
      (this.metrics.averageResponseTime * (totalEvents - 1) + responseTime) / totalEvents;
  }
}

export default BaseAgent;