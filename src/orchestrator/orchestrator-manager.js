import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'eventemitter3';

import { DAGRunner } from './dag-runner.js';

const DEFAULT_CONFIG_DIRECTORY = path.resolve('src', 'config', 'orchestrator');

export class OrchestratorManager extends EventEmitter {
  constructor({ eventBus, storyState, configDirectory, logger } = {}) {
    super();

    this.eventBus = eventBus;
    this.storyState = storyState;
    this.configDirectory = configDirectory || DEFAULT_CONFIG_DIRECTORY;
    this.logger = logger || console;

    this.typeHandlers = new Map();
    this.stageHandlers = new Map();
    this.activeAdventures = new Map();
  }

  registerTypeHandler(stageType, handlerFactory) {
    if (typeof handlerFactory !== 'function') {
      throw new Error('Stage type handler must be a factory function');
    }
    this.typeHandlers.set(stageType, handlerFactory);
  }

  registerStageHandler(stageId, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Stage handler must be a function');
    }
    this.stageHandlers.set(stageId, handler);
  }

  async startAdventure(configOrName, { initialContext = {}, autoReset = true } = {}) {
    const config = await this._resolveConfig(configOrName);

    if (this.activeAdventures.has(config.id)) {
      throw new Error(`Adventure ${config.id} is already running`);
    }

    const runner = this._createRunner(config);

    const runPromise = runner
      .start(initialContext)
      .finally(() => {
        this.activeAdventures.delete(config.id);
        if (autoReset) {
          runner.reset?.();
        }
      });

    this.activeAdventures.set(config.id, { runner, promise: runPromise, config });

    this._log(`Adventure started: ${config.id}`);
    this.emit('adventure:started', { id: config.id, config });
    this.eventBus?.emit('adventure:started', { id: config.id, config });

    return { id: config.id, runner, promise: runPromise };
  }

  getActiveAdventures() {
    return Array.from(this.activeAdventures.entries()).map(([id, info]) => ({
      id,
      state: info.runner.getStatus?.().pipelineState || 'unknown',
      config: info.config
    }));
  }

  getConfigDirectory() {
    return this.configDirectory;
  }

  async shutdown({ waitForCompletion = false } = {}) {
    if (!waitForCompletion) {
      this.activeAdventures.clear();
      return;
    }

    const runs = Array.from(this.activeAdventures.values());
    this.activeAdventures.clear();
    await Promise.allSettled(runs.map(({ promise }) => promise));
  }

  async _resolveConfig(configOrName) {
    if (typeof configOrName === 'object') {
      return configOrName;
    }

    if (typeof configOrName !== 'string') {
      throw new Error('Config identifier must be a string or object');
    }

    let filePath = configOrName;
    if (!path.isAbsolute(filePath)) {
      const filename = filePath.endsWith('.json') ? filePath : `${filePath}.json`;
      filePath = path.join(this.configDirectory, filename);
    }

    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed.id) {
      parsed.id = path.basename(filePath, '.json');
    }

    return parsed;
  }

  _createRunner(config) {
    const runner = new DAGRunner(config, {
      eventBus: this.eventBus,
      storyState: this.storyState,
      logger: this.logger
    });

    for (const stage of config.stages) {
      const handler = this._resolveHandler(stage);
      runner.registerStageHandler(stage.id, handler);
    }

    return runner;
  }

  _resolveHandler(stage) {
    if (this.stageHandlers.has(stage.id)) {
      return this.stageHandlers.get(stage.id);
    }

    if (stage.type && this.typeHandlers.has(stage.type)) {
      const handlerFactory = this.typeHandlers.get(stage.type);
      const handler = handlerFactory(stage, {
        eventBus: this.eventBus,
        storyState: this.storyState,
        logger: this.logger
      });

      if (typeof handler !== 'function') {
        throw new Error(`Handler factory for type ${stage.type} did not return a function`);
      }
      return handler;
    }

    return this._createDefaultHandler(stage);
  }

  _createDefaultHandler(stage) {
    return async () => {
      this._log(`No handler registered for stage ${stage.id} (${stage.type ?? 'unknown'}). Returning stub result.`);
      return { skipped: true, stageId: stage.id };
    };
  }

  _log(message, error) {
    if (error) {
      this.logger?.error?.(`[Orchestrator] ${message}`, error);
    } else {
      this.logger?.info?.(`[Orchestrator] ${message}`) || this.logger?.log?.(`[Orchestrator] ${message}`);
    }
  }
}

export default OrchestratorManager;
