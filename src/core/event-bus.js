import { EventEmitter } from 'eventemitter3';

/**
 * Central event bus for agent communication
 * Provides async event handling, priority ordering, and error isolation
 */
export class EventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      maxRetries: options.maxRetries || 3,
      retryDelay: options.retryDelay || 1000,
      timeout: options.timeout || 5000,
      enableLogging: options.enableLogging !== false,
      ...options
    };

    this.metrics = {
      eventsEmitted: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      averageProcessingTime: 0
    };

    this.priorityHandlers = new Map(); // eventType -> priority -> handlers[]
    this.processingQueue = new Map(); // eventType -> Promise
  }

  /**
   * Subscribe to events with priority and error handling
   */
  subscribe(eventType, handler, options = {}) {
    const {
      priority = 0,
      once = false,
      timeout = this.options.timeout,
      retries = this.options.maxRetries
    } = options;

    const wrappedHandler = this._wrapHandler(handler, {
      eventType,
      priority,
      timeout,
      retries
    });

    if (once) {
      this.once(eventType, wrappedHandler);
    } else {
      this.on(eventType, wrappedHandler);
    }

    // Track priority handlers for ordered execution
    if (!this.priorityHandlers.has(eventType)) {
      this.priorityHandlers.set(eventType, new Map());
    }

    const priorityMap = this.priorityHandlers.get(eventType);
    if (!priorityMap.has(priority)) {
      priorityMap.set(priority, []);
    }

    priorityMap.get(priority).push({ handler: wrappedHandler, original: handler });

    return () => this.unsubscribe(eventType, handler);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(eventType, handler) {
    this.off(eventType, handler);

    // Clean up priority handlers
    const priorityMap = this.priorityHandlers.get(eventType);
    if (priorityMap) {
      for (const [priority, handlers] of priorityMap.entries()) {
        const index = handlers.findIndex(h => h.original === handler);
        if (index !== -1) {
          handlers.splice(index, 1);
          if (handlers.length === 0) {
            priorityMap.delete(priority);
          }
        }
      }

      if (priorityMap.size === 0) {
        this.priorityHandlers.delete(eventType);
      }
    }
  }

  /**
   * Emit event synchronously
   */
  emit(eventType, payload = {}) {
    this.metrics.eventsEmitted++;

    if (this.options.enableLogging) {
      console.log(`[EventBus] Emitting: ${eventType}`, { payload });
    }

    const event = {
      type: eventType,
      payload,
      timestamp: Date.now(),
      id: this._generateEventId()
    };

    return super.emit(eventType, event);
  }

  /**
   * Emit event asynchronously with priority ordering
   */
  async emitAsync(eventType, payload = {}) {
    this.metrics.eventsEmitted++;

    const startTime = Date.now();
    const event = {
      type: eventType,
      payload,
      timestamp: startTime,
      id: this._generateEventId()
    };

    if (this.options.enableLogging) {
      console.log(`[EventBus] Emitting async: ${eventType}`, { payload });
    }

    try {
      // Check if already processing this event type
      if (this.processingQueue.has(eventType)) {
        await this.processingQueue.get(eventType);
      }

      // Process with priority ordering
      const processingPromise = this._processEventByPriority(eventType, event);
      this.processingQueue.set(eventType, processingPromise);

      const results = await processingPromise;
      this.processingQueue.delete(eventType);

      // Update metrics
      const processingTime = Date.now() - startTime;
      this._updateMetrics(processingTime, true);

      return results;

    } catch (error) {
      this.processingQueue.delete(eventType);
      this._updateMetrics(Date.now() - startTime, false);

      console.error(`[EventBus] Failed to process event ${eventType}:`, error);
      throw error;
    }
  }

  /**
   * Process events in priority order (highest priority first)
   */
  async _processEventByPriority(eventType, event) {
    const priorityMap = this.priorityHandlers.get(eventType);
    if (!priorityMap) {
      return [];
    }

    const results = [];
    const priorities = Array.from(priorityMap.keys()).sort((a, b) => b - a); // Desc order

    for (const priority of priorities) {
      const handlers = priorityMap.get(priority);

      // Execute all handlers at same priority level in parallel
      const priorityResults = await Promise.allSettled(
        handlers.map(({ handler }) =>
          this._executeHandler(handler, event)
        )
      );

      results.push(...priorityResults);

      // Stop processing if any high-priority handler requests it
      const stopProcessing = priorityResults.some(result =>
        result.status === 'fulfilled' && result.value?.stopPropagation
      );

      if (stopProcessing) {
        break;
      }
    }

    return results;
  }

  /**
   * Wrap handler with timeout, retry logic, and error isolation
   */
  _wrapHandler(handler, options) {
    return async (event) => {
      const { eventType, timeout, retries } = options;

      let lastError;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await Promise.race([
            handler(event),
            this._createTimeout(timeout)
          ]);
        } catch (error) {
          lastError = error;

          if (attempt < retries) {
            if (this.options.enableLogging) {
              console.warn(`[EventBus] Handler retry ${attempt + 1}/${retries} for ${eventType}:`, error.message);
            }
            await this._delay(this.options.retryDelay * (attempt + 1));
          }
        }
      }

      // All retries exhausted
      console.error(`[EventBus] Handler failed after ${retries} retries for ${eventType}:`, lastError);
      throw lastError;
    };
  }

  /**
   * Execute handler with proper error isolation
   */
  async _executeHandler(handler, event) {
    try {
      return await handler(event);
    } catch (error) {
      // Isolate handler errors - don't let one handler break others
      console.error(`[EventBus] Handler error for ${event.type}:`, error);
      return { error, handlerFailed: true };
    }
  }

  /**
   * Create timeout promise
   */
  _createTimeout(ms) {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Handler timeout after ${ms}ms`)), ms);
    });
  }

  /**
   * Delay utility for retries
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate unique event ID
   */
  _generateEventId() {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update processing metrics
   */
  _updateMetrics(processingTime, success) {
    this.metrics.eventsProcessed++;

    if (success) {
      // Update average processing time
      const totalEvents = this.metrics.eventsProcessed;
      this.metrics.averageProcessingTime =
        (this.metrics.averageProcessingTime * (totalEvents - 1) + processingTime) / totalEvents;
    } else {
      this.metrics.eventsFailed++;
    }
  }

  /**
   * Get event bus metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      successRate: this.metrics.eventsProcessed > 0
        ? ((this.metrics.eventsProcessed - this.metrics.eventsFailed) / this.metrics.eventsProcessed) * 100
        : 100
    };
  }

  /**
   * Clear all handlers and reset state
   */
  reset() {
    this.removeAllListeners();
    this.priorityHandlers.clear();
    this.processingQueue.clear();
    this.metrics = {
      eventsEmitted: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      averageProcessingTime: 0
    };
  }

  /**
   * Destroy the event bus and clean up resources
   */
  destroy() {
    // Clear all listeners
    this.removeAllListeners();

    // Clear priority handlers
    this.priorityHandlers.clear();

    // Clear processing queue
    this.processingQueue.clear();

    // Reset metrics
    this.metrics = {
      eventsEmitted: 0,
      eventsProcessed: 0,
      eventsFailed: 0,
      averageProcessingTime: 0
    };

    if (this.options.enableLogging) {
      console.log('🔄 EventBus destroyed');
    }
  }
}

// Create singleton instance
export const eventBus = new EventBus();
export default eventBus;