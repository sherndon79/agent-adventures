import { config } from '../../config/environment.js';
import { LLMClient } from '../../llm/llm-client.js';
import { DEFAULT_ORCHESTRATOR_SYSTEM_PROMPT } from './system-prompt.js';

function stripCodeFence(text) {
  if (typeof text !== 'string') {
    return text;
  }

  const fenceMatch = text.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)```$/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  return text;
}

const PROVIDER_PRIORITY = ['claude', 'gpt', 'gemini'];

export class OrchestratorLLMResponder {
  constructor({ eventBus, logger } = {}) {
    if (!eventBus?.subscribe) {
      throw new Error('Event bus with subscribe capability is required for LLM responder');
    }

    this.eventBus = eventBus;
    this.logger = logger || console;
    this.clients = new Map();
    this.defaultProvider = null;
    this.subscription = null;

    this._initializeClients();

    if (this.clients.size === 0) {
      this.logger?.warn?.('[OrchestratorLLMResponder] No LLM providers configured; responder will remain idle.');
      return;
    }

    this.subscription = this.eventBus.subscribe('orchestrator:llm:request', (event) => {
      this._handleRequest(event).catch((error) => {
        this.logger?.error?.('[OrchestratorLLMResponder] Failed to process request', error);
      });
    });

    this.logger?.info?.('[OrchestratorLLMResponder] Ready with providers:', Array.from(this.clients.keys()));
  }

  async shutdown() {
    if (this.subscription) {
      try {
        this.subscription();
      } catch (error) {
        this.logger?.warn?.('[OrchestratorLLMResponder] Failed to unsubscribe', error);
      }
      this.subscription = null;
    }
  }

  _initializeClients() {
    for (const provider of PROVIDER_PRIORITY) {
      try {
        const client = this._createClient(provider);
        if (client) {
          this.clients.set(provider, client);
          if (!this.defaultProvider) {
            this.defaultProvider = provider;
          }
        }
      } catch (error) {
        this.logger?.warn?.(`[OrchestratorLLMResponder] Skipping provider ${provider}: ${error.message}`);
      }
    }
  }

  _createClient(provider) {
    try {
      const client = new LLMClient(provider);
      if (!client.config.apiKey) {
        throw new Error('Missing API key');
      }
      return client;
    } catch (error) {
      if (error.message.includes('Unsupported')) {
        throw error;
      }
      throw new Error(`Unable to initialize ${provider} client (${error.message})`);
    }
  }

  async _handleRequest(event) {
    const payload = this._extractPayload(event);
    if (!payload?.requestId) {
      return;
    }

    if (this.clients.size === 0) {
      this._emitResult({
        requestId: payload.requestId,
        stageId: payload.stageId,
        error: 'No LLM providers configured'
      });
      return;
    }

    const stageConfig = payload.stageConfig || {};
    const llmPayload = payload.payload || stageConfig.payload || {};
    const providerPreference = (llmPayload.provider || this.defaultProvider || 'claude').toLowerCase();
    const client = this.clients.get(providerPreference) || this.clients.get(this.defaultProvider);

    if (!client) {
      this._emitResult({
        requestId: payload.requestId,
        stageId: payload.stageId,
        error: `No LLM client available for provider ${providerPreference}`
      });
      return;
    }

    const responseFormat = this._resolveResponseFormat(llmPayload, stageConfig);

    try {
      const systemPrompt = llmPayload.systemPrompt
        || llmPayload.system
        || stageConfig.systemPrompt
        || DEFAULT_ORCHESTRATOR_SYSTEM_PROMPT;

      let userPrompt = llmPayload.userPrompt
        || llmPayload.prompt
        || stageConfig.prompt
        || stageConfig.description
        || '';

      if (!userPrompt && llmPayload.instructions) {
        userPrompt = llmPayload.instructions;
      }

      const maxTokens = llmPayload.maxTokens || llmPayload.max_tokens;

      if (!userPrompt) {
        throw new Error('LLM request missing user prompt');
      }

      const completion = await client.generateCompletion(systemPrompt, userPrompt, {
        maxTokens,
        responseFormat
      });
      const resolvedProvider = client.provider || providerPreference;

      const cleanedText = stripCodeFence(completion.content);

      let parsedJson = null;
      if (cleanedText?.trim()?.startsWith('{') || cleanedText?.trim()?.startsWith('[')) {
        try {
          parsedJson = JSON.parse(cleanedText);
        } catch (jsonError) {
          this.logger?.warn?.('[OrchestratorLLMResponder] Failed to parse JSON response', jsonError.message);
        }
      }

      this._emitResult({
        requestId: payload.requestId,
        stageId: payload.stageId,
        result: {
          provider: resolvedProvider,
          model: completion.model,
          text: completion.content,
          json: parsedJson,
          usage: completion.usage,
          responseTime: completion.responseTime,
          metadata: {
            ...(llmPayload.metadata || {}),
            responseFormat: responseFormat || undefined
          }
        }
      });
    } catch (error) {
      this.logger?.error?.('[OrchestratorLLMResponder] LLM request failed', error);
      this._emitResult({
        requestId: payload.requestId,
        stageId: payload.stageId,
        error: error.message,
        metadata: {
          ...(llmPayload.metadata || {}),
          responseFormat: responseFormat || undefined
        }
      });
    }
  }

  _resolveResponseFormat(llmPayload = {}, stageConfig = {}) {
    const candidates = [
      llmPayload.responseFormat,
      stageConfig.responseFormat,
      llmPayload.responseSchema,
      stageConfig.responseSchema,
      llmPayload.schema,
      stageConfig.schema
    ];

    for (const candidate of candidates) {
      if (candidate === undefined || candidate === null) {
        continue;
      }

      const normalised = this._normaliseResponseFormat(candidate);
      if (normalised) {
        return normalised;
      }
    }

    return null;
  }

  _normaliseResponseFormat(format) {
    if (typeof format === 'string') {
      const value = format.trim().toLowerCase();
      if (!value) {
        return null;
      }
      if (value === 'json' || value === 'json_object' || value === 'jsonschema') {
        return { type: 'json' };
      }
      if (value === 'json_schema' || value === 'schema') {
        return { type: 'json_schema' };
      }
      return null;
    }

    if (Array.isArray(format) || typeof format !== 'object') {
      return null;
    }

    const type = (format.type || format.kind || format.mode || '').toString().toLowerCase();
    const schema = format.schema || format.jsonSchema || format.json_schema;
    const schemaName = format.name || format.schemaName || format.schema_name;
    const strict = format.strict;
    const mimeType = format.mimeType || format.mime_type;
    const exampleValue = format.example
      ?? format.sample
      ?? format.exampleResponse
      ?? format.example_response;
    const examplesValue = format.examples
      ?? format.samples
      ?? format.exampleResponses
      ?? format.example_responses;

    if (!type && schema) {
      return {
        type: 'json_schema',
        schema,
        name: schemaName,
        strict,
        mimeType
      };
    }

    if (!type) {
      return null;
    }

    const normalised = {
      type,
      schema,
      name: schemaName,
      strict,
      mimeType
    };

    if (examplesValue !== undefined) {
      normalised.examples = Array.isArray(examplesValue) ? examplesValue : [examplesValue];
    }

    if (exampleValue !== undefined) {
      normalised.example = exampleValue;
      if (!normalised.examples) {
        normalised.examples = Array.isArray(exampleValue) ? exampleValue : [exampleValue];
      }
    }

    if (normalised.examples && !normalised.example && normalised.examples.length > 0) {
      normalised.example = normalised.examples[0];
    }

    if (format.schemaId || format.schema_id) {
      normalised.schemaId = format.schemaId || format.schema_id;
    }
    if (format.schemaVersion || format.schema_version) {
      normalised.schemaVersion = format.schemaVersion || format.schema_version;
    }

    return normalised;
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

  _emitResult({ requestId, stageId, result, error, metadata }) {
    this.eventBus.emit('orchestrator:llm:result', {
      requestId,
      stageId,
      result: error ? { error, metadata } : result
    });
  }
}

export default OrchestratorLLMResponder;
