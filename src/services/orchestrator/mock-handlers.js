import { randomUUID } from 'node:crypto';

export class OrchestratorMockHandlers {
  constructor({ eventBus }) {
    if (!eventBus?.subscribe) {
      throw new Error('Event bus with subscribe capability is required for mock handlers');
    }

    this.eventBus = eventBus;
    this.subscriptions = [];

    this.subscriptions.push(
      eventBus.subscribe('orchestrator:llm:request', (event) => this._handleLlm(event))
    );

    this.subscriptions.push(
      eventBus.subscribe('orchestrator:audio:request', (event) => this._handleAudio(event))
    );

    this.subscriptions.push(
      eventBus.subscribe('orchestrator:mcp:request', (event) => this._handleMcp(event))
    );
  }

  async shutdown() {
    for (const unsubscribe of this.subscriptions) {
      try {
        unsubscribe?.();
      } catch (error) {
        console.warn('[OrchestratorMockHandlers] Failed to unsubscribe', error);
      }
    }
    this.subscriptions = [];
  }

  _handleLlm(event) {
    const { payload } = event || {};
    if (!payload?.requestId) {
      return;
    }

    const { requestId, stageId, stageConfig } = payload;
    const mockText = stageConfig?.mockResponse || `Mock response for stage ${stageId || 'unknown'}`;

    this._emit('orchestrator:llm:result', {
      requestId,
      stageId,
      result: {
        id: randomUUID(),
        text: mockText,
        tokens: mockText.split(/\s+/).length,
        metadata: {
          mock: true,
          stageId,
          timestamp: Date.now()
        }
      }
    });
  }

  _handleAudio(event) {
    const { payload } = event || {};
    if (!payload?.requestId) {
      return;
    }

    const { requestId, stageId, stageConfig } = payload;
    this._emit('orchestrator:audio:result', {
      requestId,
      stageId,
      result: {
        status: 'queued',
        mock: true,
        stageConfig
      }
    });
  }

  _handleMcp(event) {
    const { payload } = event || {};
    if (!payload?.requestId) {
      return;
    }

    const { requestId, stageId, mcpService, stageConfig } = payload;
    this._emit('orchestrator:mcp:result', {
      requestId,
      stageId,
      result: {
        service: mcpService,
        mock: true,
        stageConfig
      }
    });
  }

  _emit(type, payload) {
    this.eventBus.emit(type, { type, payload, timestamp: Date.now() });
  }
}

export default OrchestratorMockHandlers;
