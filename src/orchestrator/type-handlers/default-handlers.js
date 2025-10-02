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
      }).then((event) => event.payload.result);
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
      }).then(event => event.payload.result);
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
      }).then(event => event.payload.result);
    };
  };

  manager.registerTypeHandler('mcp:worldbuilder', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldviewer', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldsurveyor', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldstreamer', mcpHandlerFactory);
  manager.registerTypeHandler('mcp:worldrecorder', mcpHandlerFactory);

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
