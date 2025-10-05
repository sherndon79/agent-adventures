import { randomUUID } from 'node:crypto';

const DEFAULT_TIMEOUT_MS = 10000;

export function registerDefaultTypeHandlers(manager) {
  const { eventBus, logger } = manager;

  manager.registerTypeHandler('llm', (stage) => {
    return ({ stage: stageConfig }) => {
      const requestId = buildRequestId(stage.id);
      const timeout = stage.budget?.timeMs || DEFAULT_TIMEOUT_MS;

      emit(eventBus, 'orchestrator:llm:request', {
        requestId,
        stageId: stage.id,
        stageConfig,
        payload: stage.payload || {},
        budget: stage.budget || {}
      });

      return waitForEvent(eventBus, 'orchestrator:llm:result', timeout, (event) => {
        return event?.payload?.requestId === requestId;
      }).then((event) => {
        const result = event?.payload?.result;
        if (result?.error) {
          throw new Error(result.error);
        }
        return result;
      });
    };
  });

  manager.registerTypeHandler('audio', (stage) => {
    return ({ stage: stageConfig }) => {
      const requestId = buildRequestId(stage.id);
      const timeout = stage.budget?.timeMs || 12000;

      emit(eventBus, 'orchestrator:audio:request', {
        requestId,
        stageId: stage.id,
        stageConfig,
        payload: stage.payload || {},
        budget: stage.budget || {}
      });

      return waitForEvent(eventBus, 'orchestrator:audio:result', timeout, (event) => {
        return event?.payload?.requestId === requestId;
      }).then(event => {
        const result = event?.payload?.result;
        if (result?.error) {
          throw new Error(result.error);
        }
        return result;
      });
    };
  });

  const mcpHandlerFactory = (stage) => {
    return () => {
      const requestId = buildRequestId(stage.id);
      const timeout = stage.budget?.timeMs || 15000;

      emit(eventBus, 'orchestrator:mcp:request', {
        requestId,
        stageId: stage.id,
        mcpService: stage.type.split(':')[1],
        payload: stage.payload || {},
        budget: stage.budget || {},
        stageConfig: stage
      });

      return waitForEvent(eventBus, 'orchestrator:mcp:result', timeout, (event) => {
        return event?.payload?.requestId === requestId;
      }).then(event => {
        const result = event?.payload?.result;
        if (result?.error) {
          throw new Error(result.error);
        }
        return result;
      });
    };
  };

  manager.registerTypeHandler('mcp:worldbuilder', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldviewer', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldsurveyor', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldstreamer', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldrecorder', mcpHandlerFactory);

  manager.registerTypeHandler('competition', (stage) => {
    return () => {
      const batchId = stage.batchId || buildRequestId(stage.id);
      const proposalType = stage.payload?.proposalType
        || stage.payload?.type
        || stage.proposalType
        || 'asset_placement';
      const agentTypeMapping = {
        asset_placement: 'scene',
        camera_move: 'camera',
        story_advance: 'story'
      };
      const agentType = stage.payload?.agentType || agentTypeMapping[proposalType] || 'scene';

      const proposalTimeout = stage.budget?.proposalTimeoutMs || stage.budget?.timeMs || DEFAULT_TIMEOUT_MS * 2;
      const executionTimeout = stage.budget?.executionTimeoutMs || DEFAULT_TIMEOUT_MS;
      const totalTimeout = proposalTimeout + executionTimeout;

      emit(eventBus, 'proposal:request', {
        batchId,
        agentType,
        proposalType,
        context: {
          source: 'orchestrator',
          stageId: stage.id,
          adventureId: stage.adventureId,
          payload: stage.payload || {}
        },
        deadline: Date.now() + proposalTimeout,
        timestamp: Date.now()
      });

      emit(eventBus, 'competition:start', {
        batchId,
        type: proposalType,
        timestamp: Date.now(),
        stageId: stage.id,
        proposalTimeout,
        executionTimeout,
        expectedAgents: stage.payload?.expectedAgents || [],
        context: {
          stagePayload: stage.payload || {},
          metadata: stage.metadata || {},
          orchestrator: {
            stageId: stage.id,
            adventureId: stage.adventureId
          }
        }
      });

      return waitForEvent(eventBus, 'competition:completed', totalTimeout, (event) => {
        return event?.payload?.batchId === batchId;
      }).then((event) => {
        const payload = event?.payload || {};
        const result = payload.result || {};
        if (result.error) {
          throw new Error(result.error);
        }
        return {
          batchId,
          winner: result.winner,
          executed: result.executed,
          winningProposal: result.winningProposal,
          context: payload.context || {},
          executionPayload: result.executionPayload || null
        };
      });
    };
  });

  manager.registerTypeHandler('system:scene-reset', (stage) => {
    return async () => {
      const results = {};
      const errors = [];
      const worldBuilder = manager.mcpClients?.worldBuilder;
      const worldSurveyor = manager.mcpClients?.worldSurveyor;

      if (worldBuilder?.clearScene) {
        try {
          const response = await worldBuilder.clearScene(stage.payload?.path || '/World', true);
          results.worldBuilder = response;
        } catch (error) {
          errors.push(`WorldBuilder: ${error.message}`);
          logger?.error?.('[Orchestrator] scene reset: worldBuilder failed', error);
        }
      }

      if (worldSurveyor?.clearWaypoints) {
        try {
          const response = await worldSurveyor.clearWaypoints(true);
          results.waypoints = response;
        } catch (error) {
          errors.push(`WorldSurveyor waypoints: ${error.message}`);
          logger?.error?.('[Orchestrator] scene reset: clearWaypoints failed', error);
        }
      }

      if (worldSurveyor?.clearGroups) {
        try {
          const response = await worldSurveyor.clearGroups(true);
          results.groups = response;
        } catch (error) {
          errors.push(`WorldSurveyor groups: ${error.message}`);
          logger?.error?.('[Orchestrator] scene reset: clearGroups failed', error);
        }
      }

      if (errors.length) {
        throw new Error(`Scene reset errors: ${errors.join('; ')}`);
      }

      logger?.info?.('[Orchestrator] Scene cleared before stage execution');
      return { cleared: true, details: results };
    };
  });

  manager.registerTypeHandler('system:sleep', (stage) => {
    return async () => {
      const duration = Number(stage.durationMs || stage.budget?.timeMs || 1000);
      await new Promise(resolve => setTimeout(resolve, duration));
      return { sleptMs: duration };
    };
  });

  manager.registerTypeHandler('system:notify', (stage) => {
    return async () => {
      emit(eventBus, stage.eventType || 'orchestrator:notification', {
        stageId: stage.id,
        payload: stage.payload || {},
        level: stage.level || 'info',
        message: stage.message || ''
      });
      return { notified: true };
    };
  });

  manager.registerTypeHandler('log', (stage) => {
    return async () => {
      logger?.info?.(`[Orchestrator] log stage ${stage.id}`, stage.message ?? stage);
      return { logged: true };
    };
  });

  manager.registerTypeHandler('noop', () => async () => ({ skipped: true }));
}

function emit(eventBus, type, payload) {
  eventBus?.emit?.(type, { type, payload, timestamp: Date.now() });
}

function waitForEvent(eventBus, eventType, timeout, predicate) {
  if (!eventBus || typeof eventBus.subscribe !== 'function') {
    return Promise.reject(new Error('Event bus with subscribe method is required'));
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for event ${eventType}`));
    }, timeout);
    timer.unref?.();

    const unsubscribe = eventBus.subscribe(eventType, (event) => {
      try {
        if (!predicate(event)) {
          return;
        }
        clearTimeout(timer);
        unsubscribe();
        resolve(event);
      } catch (error) {
        clearTimeout(timer);
        unsubscribe();
        reject(error);
      }
    });
  });
}

function buildRequestId(stageId) {
  return `${stageId}-${randomUUID()}`;
}
