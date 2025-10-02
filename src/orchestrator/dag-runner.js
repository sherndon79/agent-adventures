import { EventEmitter } from 'eventemitter3';

const STAGE_STATES = {
  PENDING: 'pending',
  SCHEDULED: 'scheduled',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  BLOCKED: 'blocked'
};

/**
 * Executes adventure pipelines described as dependency graphs.
 * Each stage registers a handler; the runner coordinates execution order,
 * retries, and emits progress through the shared event bus.
 */
export class DAGRunner extends EventEmitter {
  constructor(config, { eventBus, storyState, logger } = {}) {
    super();

    if (!config || !Array.isArray(config.stages)) {
      throw new Error('DAGRunner requires a configuration with a stages array');
    }

    this.config = {
      id: config.id || 'unnamed-dag',
      description: config.description || '',
      stages: config.stages.map(stage => ({
        dependsOn: [],
        retry: { attempts: 0, delayMs: 0 },
        budget: {},
        optional: false,
        ...stage
      }))
    };

    this.eventBus = eventBus;
    this.storyState = storyState;
    this.logger = logger || console;

    this.stageMap = new Map();
    this.stageHandlers = new Map();
    this.stageStatus = new Map();
    this.stageResults = new Map();
    this.inFlight = new Set();

    this.pipelineState = 'idle';
    this.initialContext = {};
    this.completion = null;

    this._buildStageMap();
    this._validateGraph();
    this._initialiseStatuses();
  }

  /**
   * Attach a handler responsible for executing a stage.
   */
  registerStageHandler(stageId, handler) {
    if (!this.stageMap.has(stageId)) {
      throw new Error(`Cannot register handler, unknown stage: ${stageId}`);
    }
    if (typeof handler !== 'function') {
      throw new Error('Stage handler must be a function');
    }
    this.stageHandlers.set(stageId, handler);
    return () => this.stageHandlers.delete(stageId);
  }

  /**
   * Start executing the DAG. Returns a promise that resolves when the graph
   * completes or rejects on unrecoverable failure.
   */
  start(initialContext = {}) {
    if (this.pipelineState !== 'idle') {
      throw new Error('DAGRunner can only be started once per instance');
    }

    this.pipelineState = 'running';
    this.initialContext = initialContext;

    this.completion = this._createDeferred();

    this._log(`Starting DAG ${this.config.id}`);
    this._scheduleEligibleStages();
    this._checkForCompletion();

    return this.completion.promise;
  }

  getStatus() {
    return {
      pipelineState: this.pipelineState,
      stages: Array.from(this.stageStatus.entries()).map(([id, info]) => ({
        id,
        ...info
      })),
      results: Object.fromEntries(this.stageResults),
      config: this.config
    };
  }

  /**
   * Reset internal state so the runner can execute the same config again.
   */
  reset() {
    if (this.inFlight.size > 0) {
      throw new Error('Cannot reset DAG while stages are still running');
    }

    this.stageStatus.clear();
    this.stageResults.clear();
    this.pipelineState = 'idle';
    this.initialContext = {};
    this.completion = null;
    this._initialiseStatuses();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  _buildStageMap() {
    for (const stage of this.config.stages) {
      if (!stage.id) {
        throw new Error('Every stage requires an id');
      }
      if (this.stageMap.has(stage.id)) {
        throw new Error(`Duplicate stage id detected: ${stage.id}`);
      }
      this.stageMap.set(stage.id, stage);
    }
  }

  _validateGraph() {
    // Ensure dependencies exist
    for (const stage of this.config.stages) {
      for (const dependency of stage.dependsOn || []) {
        if (!this.stageMap.has(dependency)) {
          throw new Error(`Stage ${stage.id} depends on unknown stage ${dependency}`);
        }
        if (dependency === stage.id) {
          throw new Error(`Stage ${stage.id} cannot depend on itself`);
        }
      }
    }

    // Detect cycles via DFS
    const visited = new Set();
    const stack = new Set();

    const visit = (id) => {
      if (stack.has(id)) {
        throw new Error(`Cycle detected in DAG involving stage ${id}`);
      }
      if (visited.has(id)) {
        return;
      }

      stack.add(id);
      const stage = this.stageMap.get(id);
      for (const dep of stage.dependsOn || []) {
        visit(dep);
      }
      stack.delete(id);
      visited.add(id);
    };

    for (const stage of this.config.stages) {
      visit(stage.id);
    }
  }

  _initialiseStatuses() {
    for (const stage of this.config.stages) {
      this.stageStatus.set(stage.id, {
        state: STAGE_STATES.PENDING,
        attempts: 0,
        startedAt: null,
        finishedAt: null,
        error: null
      });
    }
  }

  _scheduleEligibleStages() {
    for (const stage of this.config.stages) {
      const status = this.stageStatus.get(stage.id);
      if (status.state !== STAGE_STATES.PENDING) {
        continue;
      }

      const dependenciesMet = (stage.dependsOn || []).every(depId => {
        const depStatus = this.stageStatus.get(depId);
        return depStatus.state === STAGE_STATES.COMPLETED || depStatus.state === STAGE_STATES.SKIPPED;
      });

      if (dependenciesMet) {
        this._runStage(stage.id);
      }
    }
  }

  _runStage(stageId) {
    const stage = this.stageMap.get(stageId);
    const handler = this.stageHandlers.get(stageId);
    const status = this.stageStatus.get(stageId);

    if (!handler) {
      throw new Error(`No handler registered for stage ${stageId}`);
    }

    status.state = STAGE_STATES.SCHEDULED;
    this._emit('orchestrator:stage:scheduled', { stageId, stage });

    const execute = async () => {
      status.state = STAGE_STATES.RUNNING;
      status.startedAt = Date.now();
      status.attempts += 1;

      this._emit('orchestrator:stage:start', { stageId, stage, attempt: status.attempts });

      try {
        const result = await this._executeWithBudget(stage, handler);
        this._handleStageSuccess(stageId, result);
      } catch (error) {
        this._handleStageFailure(stageId, error);
      } finally {
        this._checkForCompletion();
      }
    };

    const promise = execute().finally(() => {
      this.inFlight.delete(promise);
      this._checkForCompletion();
    });

    this.inFlight.add(promise);
  }

  async _executeWithBudget(stage, handler) {
    const context = {
      stage,
      dag: this.config,
      storyState: this.storyState,
      results: Object.fromEntries(this.stageResults),
      initialContext: this.initialContext,
      emit: (type, payload) => this._emit(type, payload)
    };

    const timeoutMs = stage.budget?.timeMs || stage.budget?.timeLimitMs;
    if (!timeoutMs) {
      return handler(context);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Stage ${stage.id} exceeded time budget of ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();

      Promise.resolve(handler(context))
        .then(value => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  _handleStageSuccess(stageId, result) {
    const stage = this.stageMap.get(stageId);
    const status = this.stageStatus.get(stageId);

    status.state = STAGE_STATES.COMPLETED;
    status.finishedAt = Date.now();
    status.error = null;

    if (result !== undefined) {
      this.stageResults.set(stageId, result);
    }

    this._emit('orchestrator:stage:complete', {
      stageId,
      stage,
      result,
      durationMs: status.finishedAt - status.startedAt
    });

    this._scheduleEligibleStages();
  }

  _handleStageFailure(stageId, error) {
    const stage = this.stageMap.get(stageId);
    const status = this.stageStatus.get(stageId);

    this._log(`Stage ${stageId} failed`, error);

    const retryConfig = stage.retry || { attempts: 0, delayMs: 0 };

    if (status.attempts <= retryConfig.attempts) {
      this._emit('orchestrator:stage:retry', {
        stageId,
        stage,
        attempt: status.attempts,
        error
      });

      const delay = retryConfig.delayMs || 0;
      const retryDelay = delay > 0
        ? new Promise(resolve => setTimeout(resolve, delay))
        : Promise.resolve();

      status.state = STAGE_STATES.PENDING;
      status.startedAt = null;
      status.finishedAt = null;
      status.error = null;

      retryDelay.then(() => this._runStage(stageId));
      return;
    }

    status.state = STAGE_STATES.FAILED;
    status.finishedAt = Date.now();
    status.error = error;

    this._emit('orchestrator:stage:failed', {
      stageId,
      stage,
      error,
      durationMs: status.finishedAt - status.startedAt
    });

    this._failPipeline(error, stageId);
  }

  _failPipeline(error, stageId) {
    if (this.pipelineState === 'failed') {
      return;
    }

    this.pipelineState = 'failed';

    // Mark pending nodes as blocked so getStatus reflects reality
    for (const [id, status] of this.stageStatus.entries()) {
      if (status.state === STAGE_STATES.PENDING || status.state === STAGE_STATES.SCHEDULED) {
        status.state = STAGE_STATES.BLOCKED;
        status.finishedAt = Date.now();
      }
    }

    const reason = error instanceof Error ? error : new Error(String(error));
    this._emit('orchestrator:failed', { stageId, error: reason });

    if (this.eventBus) {
      this.eventBus.emit('orchestrator:failed', { stageId, error: reason, dagId: this.config.id });
    }

    this.completion?.reject(reason);
  }

  _checkForCompletion() {
    if (this.pipelineState !== 'running') {
      return;
    }

    const unfinished = Array.from(this.stageStatus.values()).some(status => {
      return status.state === STAGE_STATES.PENDING ||
        status.state === STAGE_STATES.SCHEDULED ||
        status.state === STAGE_STATES.RUNNING;
    });

    if (unfinished || this.inFlight.size > 0) {
      return;
    }

    this.pipelineState = 'completed';

    const resultSummary = {
      dagId: this.config.id,
      stages: Object.fromEntries(this.stageResults)
    };

    this._emit('orchestrator:complete', resultSummary);
    if (this.eventBus) {
      this.eventBus.emit('orchestrator:complete', resultSummary);
    }

    this.completion?.resolve(resultSummary);
  }

  _emit(eventType, payload) {
    this.emit(eventType, payload);
    if (this.eventBus) {
      this.eventBus.emit(eventType, payload);
    }
  }

  _createDeferred() {
    const deferred = {};
    deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });
    return deferred;
  }

  _log(message, error) {
    if (error) {
      this.logger?.error?.(`[DAGRunner] ${message}`, error);
    } else {
      this.logger?.info?.(`[DAGRunner] ${message}`) || this.logger?.log?.(`[DAGRunner] ${message}`);
    }
  }
}

export { STAGE_STATES };
