import { sendAudioUpdate, sendAudioControl, getAudioStatus } from '../../controllers/audioController.js';

const CHANNEL_KEYS = ['narration', 'commentary', 'ambient', 'music', 'sfx', 'effects'];
const REQUEST_ARRAY_FIELDS = ['requests', 'channels', 'tracks'];
const CONTROL_ARRAY_FIELDS = ['control', 'controls', 'commands'];
const TEXT_CHANNELS = new Set(['narration', 'commentary']);

const SYNC_META_KEYS = ['metadata', 'meta'];

/**
 * Bridges orchestrator audio requests into the websocket audio services.
 * Supports narration/commentary/ambient/music updates plus control commands.
 */
export class OrchestratorAudioResponder {
  constructor({ eventBus, logger } = {}) {
    if (!eventBus?.subscribe) {
      throw new Error('Event bus with subscribe capability is required for audio responder');
    }

    this.eventBus = eventBus;
    this.logger = logger || console;
    this.subscription = this.eventBus.subscribe('orchestrator:audio:request', (event) => {
      this._handleRequest(event).catch((error) => {
        this.logger?.error?.('[OrchestratorAudioResponder] Failed to process request', error);
      });
    });

    this.logger?.info?.('[OrchestratorAudioResponder] Ready for audio orchestration');
  }

  async shutdown() {
    if (this.subscription) {
      try {
        this.subscription();
      } catch (error) {
        this.logger?.warn?.('[OrchestratorAudioResponder] Failed to unsubscribe', error);
      }
      this.subscription = null;
    }
  }

  async _handleRequest(event) {
    console.log('[AudioResponder] _handleRequest called, event type:', event?.type);
    const payload = this._extractPayload(event);
    console.log('[AudioResponder] Extracted payload, requestId:', payload?.requestId);
    const requestId = payload?.requestId;
    if (!requestId) {
      return;
    }

    const stageId = payload.stageId;
    const stageConfig = payload.stageConfig || {};
    const stageOptional = stageConfig.optional === true;
    const invocation = this._buildInvocation(payload);

    const audioStatus = getAudioStatus?.();
    const isConnected = audioStatus?.connected;

    if (!isConnected && !invocation.allowOffline) {
      const error = 'Audio service not connected';
      if (stageOptional) {
        this._emitResult({
          requestId,
          stageId,
          result: {
            status: 'offline',
            optional: true,
            warnings: [error],
            requests: [],
            connected: false
          }
        });
        return;
      }

      this._emitResult({
        requestId,
        stageId,
        result: {
          error,
          connected: false
        }
      });
      return;
    }

    if (invocation.requests.length === 0 && invocation.controls.length === 0) {
      this._emitResult({
        requestId,
        stageId,
        result: {
          status: 'noop',
          message: 'No audio channels supplied'
        }
      });
      return;
    }

    const results = [];
    const warnings = [];

    if (invocation.sync) {
      const syncResult = await this._registerSyncGroup(invocation.sync, stageOptional);
      results.push(syncResult);

      if (!syncResult.success) {
        if (syncResult.optional || stageOptional) {
          warnings.push(syncResult.message);
        } else {
          this._emitResult({
            requestId,
            stageId,
            result: {
              error: syncResult.message || 'Audio sync registration failed',
              requests: results
            }
          });
          return;
        }
      }
    }

    for (const request of invocation.requests) {
      const processed = await this._processChannelRequest(request);
      results.push(processed);
      if (!processed.success && (processed.optional || stageOptional)) {
        warnings.push(processed.message);
      }
    }

    for (const control of invocation.controls) {
      const processed = await this._processControlRequest(control);
      results.push(processed);
      if (!processed.success && (processed.optional || stageOptional)) {
        warnings.push(processed.message);
      }
    }

    const blockingFailures = results.filter((r) => !r.success && !(r.optional || stageOptional)).map(r => r.message);

    if (blockingFailures.length > 0) {
      this._emitResult({
        requestId,
        stageId,
        result: {
          error: `Audio requests failed: ${blockingFailures.join('; ')}`,
          requests: results
        }
      });
      return;
    }

    this._emitResult({
      requestId,
      stageId,
      result: {
        status: warnings.length ? 'partial' : 'queued',
        warnings: warnings.length ? warnings : undefined,
        requests: results,
        connected: isConnected
      }
    });
  }

  _buildInvocation(payload = {}) {
    const stageConfig = payload.stageConfig || {};
    console.log('[AudioResponder] stageConfig', JSON.stringify(stageConfig?.payload));
    console.log('[AudioResponder] runtime', JSON.stringify(payload.payload));
    const merged = {
      ...(stageConfig.payload || {}),
      ...(payload.payload || {})
    };

    const allowOffline = Boolean(merged.allowOffline || merged.allow_offline);
    const requests = [];
    const controls = [];

    for (const field of REQUEST_ARRAY_FIELDS) {
      if (Array.isArray(merged[field])) {
        for (const entry of merged[field]) {
          const normalised = this._normaliseChannelEntry(entry, merged);
          if (normalised) {
            requests.push(normalised);
          }
        }
      }
    }

    for (const field of CONTROL_ARRAY_FIELDS) {
      if (Array.isArray(merged[field])) {
        for (const entry of merged[field]) {
          const normalised = this._normaliseControlEntry(entry, merged);
          if (normalised) {
            controls.push(normalised);
          }
        }
      }
    }

    for (const key of CHANNEL_KEYS) {
      if (merged[key] !== undefined) {
        const normalised = this._normaliseChannelEntry({ channel: key, payload: merged[key] }, merged);
        if (normalised) {
          requests.push(normalised);
        }
      }
    }

    if (merged.control && typeof merged.control === 'object' && !Array.isArray(merged.control)) {
      const normalised = this._normaliseControlEntry(merged.control, merged);
      if (normalised) {
        controls.push(normalised);
      }
    }

    const sync = this._normaliseSyncConfig(merged, requests);

    if (sync) {
      const syncMetadata = {
        ...(sync.metadata || {}),
        syncId: sync.id,
        sync_id: sync.id
      };

      for (const request of requests) {
        if (!sync.channels.length || sync.channels.includes(request.channel)) {
          request.metadata = {
            ...(request.metadata || {}),
            ...syncMetadata
          };
        }
      }
    }

    return {
      allowOffline,
      requests,
      controls,
      sync
    };
  }

  _normaliseChannelEntry(entry, root) {
    if (typeof entry === 'string') {
      return {
        type: 'channel',
        channel: entry.toLowerCase(),
        payload: this._coercePayload(entry.toLowerCase(), entry),
        metadata: root.metadata || {},
        optional: Boolean(root.optionalChannels?.includes(entry.toLowerCase()))
      };
    }

    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const channel = String(entry.channel || entry.type || '').toLowerCase();
    if (!channel) {
      return null;
    }

    const metadata = entry.metadata || root.metadata || {};
    const optional = entry.optional ?? Boolean(root.optionalChannels?.includes(channel));

    console.log('[AudioResponder] entry before', channel, entry);
    const payloadRaw = this._extractPayload(channel, entry);
    let payload = payloadRaw;
    if (payload === null || payload === undefined || (typeof payload === 'object' && !Array.isArray(payload) && Object.keys(payload).length === 0)) {
      payload = entry?.payload ?? {};
    }

    console.log('[AudioResponder] normalized', channel, payload);
    return {
      type: 'channel',
      channel,
      payload,
      metadata,
      optional
    };
  }

  _normaliseControlEntry(entry, root) {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const command = entry.command || entry.action;
    if (!command) {
      return null;
    }

    return {
      type: 'control',
      command,
      channel: entry.channel || entry.target || null,
      params: entry.params || entry.parameters || entry.options || {},
      optional: entry.optional ?? Boolean(root.optionalControls)
    };
  }

  _extractPayload(channel, entry) {
    if (entry.payload !== undefined) {
      return this._coercePayload(channel, entry.payload);
    }
    if (entry.data !== undefined) {
      return this._coercePayload(channel, entry.data);
    }
    if (entry.body !== undefined) {
      return this._coercePayload(channel, entry.body);
    }

    const clone = { ...entry };
    delete clone.channel;
    delete clone.type;
    delete clone.metadata;
    delete clone.optional;
    delete clone.payload;
    delete clone.data;
    delete clone.body;
    delete clone.waitForCompletion;

    if (Object.keys(clone).length === 0) {
      return this._coercePayload(channel, {});
    }

    return this._coercePayload(channel, clone);
  }

  _coercePayload(channel, raw) {
    if (raw === null || raw === undefined) {
      return {};
    }

    if (typeof raw === 'string') {
      if (TEXT_CHANNELS.has(channel)) {
        return { text: raw };
      }
      return { value: raw };
    }

    if (typeof raw !== 'object') {
      return { value: raw };
    }

    return raw;
  }

  _normaliseSyncConfig(root = {}, requests = []) {
    const syncSource = root.sync ?? root.syncGroup ?? root.sync_group ?? null;
    let syncId = root.syncId ?? root.sync_id ?? root.syncGroupId ?? root.sync_group_id ?? null;
    let channels = root.syncChannels ?? root.sync_channels ?? null;
    let metadata = root.syncMetadata ?? root.sync_metadata ?? root.sync_meta ?? null;

    if (typeof syncSource === 'string') {
      syncId = syncId || syncSource;
    } else if (syncSource && typeof syncSource === 'object') {
      syncId = syncSource.id ?? syncSource.syncId ?? syncSource.sync_id ?? syncId;
      channels = syncSource.channels ?? syncSource.channelIds ?? syncSource.channel_ids ?? syncSource.targets ?? channels;

      for (const key of SYNC_META_KEYS) {
        const candidate = syncSource[key];
        if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
          metadata = candidate;
          break;
        }
      }

      if (!metadata && syncSource.syncMetadata && typeof syncSource.syncMetadata === 'object') {
        metadata = syncSource.syncMetadata;
      }
    }

    if (!syncId) {
      return null;
    }

    const availableChannels = requests.map((req) => req.channel);
    const channelList = Array.isArray(channels) ? channels : availableChannels;
    const normalizedChannels = Array.from(new Set(channelList
      .map((ch) => (ch ? String(ch).toLowerCase() : null))
      .filter(Boolean)));
    const filteredChannels = normalizedChannels.filter((ch) => availableChannels.includes(ch));
    const finalChannels = filteredChannels.length ? filteredChannels : availableChannels;

    const meta = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? metadata
      : {};

    return {
      id: syncId,
      channels: finalChannels,
      metadata: meta
    };
  }

  async _processChannelRequest(request) {
    const started = Date.now();
    try {
      console.log('[AudioResponder] queue', request.channel, 'type', typeof request.payload, 'null?', request.payload === null, 'value', request.payload);
      const queued = sendAudioUpdate(request.channel, request.payload, request.metadata);
      if (!queued) {
        return {
          type: 'channel',
          channel: request.channel,
          success: false,
          optional: request.optional,
          message: 'Audio channel not connected',
          durationMs: Date.now() - started
        };
      }

      return {
        type: 'channel',
        channel: request.channel,
        success: true,
        optional: request.optional,
        message: 'queued',
        durationMs: Date.now() - started,
        payloadPreview: this._formatPreview(request.payload)
      };
    } catch (error) {
      return {
        type: 'channel',
        channel: request.channel,
        success: false,
        optional: request.optional,
        message: error.message || 'Audio channel request failed',
        durationMs: Date.now() - started
      };
    }
  }

  async _processControlRequest(request) {
    const started = Date.now();
    try {
      const queued = sendAudioControl(request.command, {
        channel: request.channel,
        params: request.params
      });

      if (!queued) {
        return {
          type: 'control',
          command: request.command,
          channel: request.channel,
          success: false,
          optional: request.optional,
          message: 'Audio control channel not connected',
          durationMs: Date.now() - started
        };
      }

      return {
        type: 'control',
        command: request.command,
        channel: request.channel,
        success: true,
        optional: request.optional,
        message: 'queued',
        durationMs: Date.now() - started,
        paramsPreview: this._formatPreview(request.params)
      };
    } catch (error) {
      return {
        type: 'control',
        command: request.command,
        channel: request.channel,
        success: false,
        optional: request.optional,
        message: error.message || 'Audio control request failed',
        durationMs: Date.now() - started
      };
    }
  }

  async _registerSyncGroup(syncConfig, stageOptional) {
    const started = Date.now();

    try {
      if (!syncConfig?.id) {
        return {
          type: 'sync',
          success: false,
          optional: stageOptional,
          message: 'Sync group missing id',
          durationMs: Date.now() - started
        };
      }

      const channels = Array.isArray(syncConfig.channels) ? syncConfig.channels : [];
      if (channels.length === 0) {
        return {
          type: 'sync',
          success: false,
          optional: stageOptional,
          message: 'Sync group has no channels',
          durationMs: Date.now() - started
        };
      }

      const queued = sendAudioControl('register_sync', {
        params: {
          syncId: syncConfig.id,
          channels,
          metadata: syncConfig.metadata || {}
        }
      });

      if (!queued) {
        return {
          type: 'sync',
          success: false,
          optional: stageOptional,
          message: 'Audio sync controller not connected',
          durationMs: Date.now() - started,
          syncId: syncConfig.id
        };
      }

      return {
        type: 'sync',
        success: true,
        optional: stageOptional,
        message: 'registered',
        durationMs: Date.now() - started,
        syncId: syncConfig.id,
        channels
      };
    } catch (error) {
      return {
        type: 'sync',
        success: false,
        optional: stageOptional,
        message: error.message || 'Audio sync registration failed',
        durationMs: Date.now() - started,
        syncId: syncConfig?.id
      };
    }
  }

  _formatPreview(value) {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string') {
      return value.length > 120 ? `${value.slice(0, 117)}...` : value;
    }

    try {
      const json = JSON.stringify(value);
      return json.length > 160 ? `${json.slice(0, 157)}...` : json;
    } catch (error) {
      return null;
    }
  }

  _extractPayload(event) {
    if (!event) {
      return null;
    }

    // Return the event's payload directly - it contains requestId, stageId, stageConfig, and payload
    return event.payload || null;
  }

  _emitResult({ requestId, stageId, result }) {
    this.eventBus.emit('orchestrator:audio:result', {
      requestId,
      stageId,
      result
    });
  }
}

export default OrchestratorAudioResponder;
