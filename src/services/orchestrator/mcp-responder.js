import { config } from '../../config/environment.js';

const SERVICE_MAP = {
  worldbuilder: 'worldBuilder',
  worldviewer: 'worldViewer',
  worldsurveyor: 'worldSurveyor',
  worldstreamer: 'worldStreamer',
  worldrecorder: 'worldRecorder'
};

const COMMAND_FIELDS = ['tool', 'command', 'method', 'action'];
const ARG_FIELDS = ['args', 'arguments', 'params', 'parameters'];
const OPTION_FIELDS = ['options', 'config', 'settings'];

export class OrchestratorMCPResponder {
  constructor({ eventBus, logger, mcpClients } = {}) {
    if (!eventBus?.subscribe) {
      throw new Error('Event bus with subscribe capability is required for MCP responder');
    }

    if (!mcpClients) {
      throw new Error('MCP clients are required for MCP responder');
    }

    this.eventBus = eventBus;
    this.logger = logger || console;
    this.mcpClients = mcpClients;
    this.subscription = null;

    this.subscription = this.eventBus.subscribe('orchestrator:mcp:request', (event) => {
      this._handleRequest(event).catch((error) => {
        this.logger?.error?.('[OrchestratorMCPResponder] Failed to process request', error);
      });
    });

    const availableServices = this._listAvailableServices();
    this.logger?.info?.(
      '[OrchestratorMCPResponder] Ready for services:',
      availableServices.length ? availableServices : 'none'
    );

    if (config.mcp.mockMode) {
      this.logger?.warn?.('[OrchestratorMCPResponder] MCP mock mode is enabled; real commands may not execute');
    }
  }

  async shutdown() {
    if (this.subscription) {
      try {
        this.subscription();
      } catch (error) {
        this.logger?.warn?.('[OrchestratorMCPResponder] Failed to unsubscribe', error);
      }
      this.subscription = null;
    }
  }

  _listAvailableServices() {
    const services = [];
    for (const [alias, property] of Object.entries(SERVICE_MAP)) {
      if (this.mcpClients?.[property]) {
        services.push(alias);
      }
    }
    return services;
  }

  async _handleRequest(event) {
    const payload = this._extractPayload(event);
    if (!payload?.requestId) {
      return;
    }

    const requestId = payload.requestId;
    const stageId = payload.stageId;
    const serviceAlias = String(payload.mcpService || '').toLowerCase();
    const serviceProperty = SERVICE_MAP[serviceAlias];
    const client = this._resolveClient(serviceProperty);

    if (!client) {
      this._emitResult({
        requestId,
        stageId,
        result: {
          error: `Unknown MCP service: ${payload.mcpService || 'unspecified'}`,
          service: serviceAlias || 'unknown'
        }
      });
      return;
    }

    const invocation = this._buildInvocation(payload);

    if (!invocation.command) {
      this._emitResult({
        requestId,
        stageId,
        result: {
          error: 'MCP request missing command/tool definition',
          service: serviceAlias,
          metadata: invocation.metadata
        }
      });
      return;
    }

    const commandLabel = invocation.toolName || invocation.command;

    try {
      const response = await this._executeCommand(client, invocation);
      const resultPayload = this._formatResult({
        response,
        service: serviceAlias,
        command: commandLabel,
        metadata: invocation.metadata
      });

      this._emitResult({ requestId, stageId, result: resultPayload });
    } catch (error) {
      this.logger?.error?.(
        `[OrchestratorMCPResponder] ${serviceAlias || 'unknown'} command ${commandLabel} failed`,
        error
      );
      this._emitResult({
        requestId,
        stageId,
        result: {
          error: error.message,
          service: serviceAlias,
          command: commandLabel,
          metadata: invocation.metadata
        }
      });
    }
  }

  _resolveClient(propertyName) {
    if (!propertyName) {
      return null;
    }

    if (this.mcpClients?.[propertyName]) {
      return this.mcpClients[propertyName];
    }

    if (typeof this.mcpClients?.getAllClients === 'function') {
      const clients = this.mcpClients.getAllClients();
      return clients?.[propertyName] || null;
    }

    return null;
  }

  _buildInvocation(payload = {}) {
    const stageConfig = payload.stageConfig || {};
    const stageDefaults = stageConfig.payload || {};
    const runtimePayload = payload.payload || {};
    const mergedPayload = {
      ...stageDefaults,
      ...runtimePayload
    };

    const metadata = mergedPayload.metadata || {};

    let command;
    for (const field of COMMAND_FIELDS) {
      if (mergedPayload[field]) {
        command = mergedPayload[field];
        break;
      }
    }

    const args = this._extractFirstMatch(mergedPayload, ARG_FIELDS, {});
    const options = this._extractFirstMatch(mergedPayload, OPTION_FIELDS, {});
    const mode = mergedPayload.invoke || mergedPayload.mode || null;
    const toolName = mergedPayload.tool || null;

    const methodArgs = this._normaliseMethodArgs(mergedPayload);

    return {
      command,
      args,
      options,
      mode,
      toolName,
      methodArgs,
      metadata
    };
  }

  _extractFirstMatch(source, fields, defaultValue) {
    for (const field of fields) {
      if (source[field] !== undefined) {
        return source[field];
      }
    }
    return defaultValue;
  }

  _normaliseMethodArgs(payload) {
    if (Array.isArray(payload.argsArray)) {
      return payload.argsArray;
    }

    if (Array.isArray(payload.args)) {
      return payload.args;
    }

    if (Array.isArray(payload.arguments)) {
      return payload.arguments;
    }

    if (Array.isArray(payload.params)) {
      return payload.params;
    }

    if (Array.isArray(payload.parameters)) {
      return payload.parameters;
    }

    if (payload.args !== undefined && typeof payload.args === 'object') {
      return [payload.args];
    }

    if (payload.arguments !== undefined && typeof payload.arguments === 'object') {
      return [payload.arguments];
    }

    if (payload.params !== undefined && typeof payload.params === 'object') {
      return [payload.params];
    }

    return [];
  }

  async _executeCommand(client, invocation) {
    const methodName = invocation.command;

    const useMethod = invocation.mode === 'method'
      || (!invocation.toolName && typeof client?.[methodName] === 'function');

    if (useMethod) {
      return await client[methodName](...(invocation.methodArgs || []));
    }

    const tool = invocation.toolName || methodName;
    if (typeof client?.executeCommand !== 'function') {
      throw new Error('Selected MCP client cannot execute commands');
    }

    return await client.executeCommand(tool, invocation.args || {}, invocation.options || {});
  }

  _formatResult({ response, service, command, metadata }) {
    const resultPayload = {
      service,
      command,
      metadata: metadata || {}
    };

    if (response && typeof response === 'object') {
      Object.assign(resultPayload, response);
      if (response.success === false && !response.error) {
        resultPayload.error = `MCP command ${command} failed`;
      }
    } else if (response !== undefined) {
      resultPayload.output = response;
    }

    return resultPayload;
  }

  _extractPayload(event) {
    if (!event) {
      return null;
    }

    const { payload } = event;
    if (payload && typeof payload === 'object' && 'payload' in payload) {
      return payload.payload;
    }

    return payload || null;
  }

  _emitResult({ requestId, stageId, result }) {
    this.eventBus.emit('orchestrator:mcp:result', {
      requestId,
      stageId,
      result
    });
  }
}

export default OrchestratorMCPResponder;
