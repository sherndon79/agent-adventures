/**
 * YouTube Chat Listener - Real-time chat message monitoring for live streams
 *
 * Polls YouTube Live Chat API and emits chat messages to the event bus
 * for voting and interaction processing.
 */

import { google } from 'googleapis';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const SETTINGS_PATH = path.resolve(process.cwd(), 'src/config/youtube_settings.json');

export class YouTubeChatListener {
  constructor({ eventBus, apiKey, broadcastId, oauthTokenPath, pollIntervalMs = 5000, logger = console }) {
    if (!eventBus?.emit) {
      throw new Error('EventBus with emit capability is required');
    }
    // API key or OAuth is still required for authentication
    if (!apiKey && !oauthTokenPath) {
      throw new Error('Either YouTube API key or OAuth token path is required');
    }

    // Determine broadcast ID with persistence
    const persistedId = this._loadIdFromSettings();
    const initialBroadcastId = persistedId || broadcastId;

    if (!initialBroadcastId) {
      throw new Error('YouTube broadcast ID is required (either in youtube_settings.json or as an environment variable)');
    }

    this.eventBus = eventBus;
    this.apiKey = apiKey;
    this.oauthTokenPath = oauthTokenPath;
    this.broadcastId = initialBroadcastId;
    this.pollIntervalMs = pollIntervalMs;
    this.logger = logger;

    // Initialize YouTube API client with OAuth or API key
    let auth;
    if (oauthTokenPath) {
      try {
        const tokenData = JSON.parse(readFileSync(oauthTokenPath, 'utf8'));
        const oauth2Client = new google.auth.OAuth2(
          tokenData.client_id,
          tokenData.client_secret,
          tokenData.redirect_uris?.[0]
        );
        oauth2Client.setCredentials({
          access_token: tokenData.token,
          refresh_token: tokenData.refresh_token,
          scope: tokenData.scopes?.join(' '),
          token_type: 'Bearer',
          expiry_date: tokenData.expiry ? new Date(tokenData.expiry).getTime() : undefined
        });
        auth = oauth2Client;
        this.logger.info('[YouTubeChatListener] Using OAuth credentials');
      } catch (error) {
        this.logger.warn('[YouTubeChatListener] Failed to load OAuth token, falling back to API key:', error.message);
        auth = apiKey;
      }
    } else {
      auth = apiKey;
    }

    this.youtube = google.youtube({
      version: 'v3',
      auth
    });

    // State management
    this.isRunning = false;
    this.liveChatId = null;
    this.nextPageToken = null;
    this.pollTimer = null;
    // Global message deduplication (across all listeners/sessions)
    // Note: VoteCollector also has session-specific deduplication
    this.messagesSeen = new Set();

    // Metrics
    this.metrics = {
      messagesReceived: 0,
      messagesEmitted: 0,
      pollCount: 0,
      errors: 0,
      lastPollTime: null,
      averagePollLatency: 0
    };
  }

  /**
   * Start listening to YouTube Live Chat
   */
  async start() {
    if (this.isRunning) {
      this.logger.warn('[YouTubeChatListener] Already running');
      return;
    }

    try {
      this.logger.info('[YouTubeChatListener] Starting...', {
        broadcastId: this.broadcastId,
        pollInterval: this.pollIntervalMs
      });

      // Get the live chat ID for this broadcast
      await this._fetchLiveChatId();

      if (!this.liveChatId) {
        throw new Error('Could not retrieve live chat ID for broadcast');
      }

      this.isRunning = true;
      this.logger.info('[YouTubeChatListener] Started successfully', {
        liveChatId: this.liveChatId
      });

      // Start polling
      this._startPolling();

    } catch (error) {
      this.logger.error('[YouTubeChatListener] Failed to start:', error);
      throw error;
    }
  }

  /**
   * Stop listening to YouTube Live Chat
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('[YouTubeChatListener] Stopping...');

    this.isRunning = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    this.nextPageToken = null;
    this.messagesSeen.clear();

    this.logger.info('[YouTubeChatListener] Stopped', {
      metrics: this.metrics
    });
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      isRunning: this.isRunning,
      liveChatId: this.liveChatId,
      messagesInCache: this.messagesSeen.size
    };
  }

  /**
   * Fetch the live chat ID from the broadcast
   */
  async _fetchLiveChatId() {
    try {
      const response = await this.youtube.liveBroadcasts.list({
        part: ['snippet'],
        id: [this.broadcastId]
      });

      if (!response.data.items || response.data.items.length === 0) {
        throw new Error(`Broadcast not found: ${this.broadcastId}`);
      }

      const broadcast = response.data.items[0];
      this.liveChatId = broadcast.snippet.liveChatId;

      if (!this.liveChatId) {
        throw new Error('Broadcast does not have an active live chat');
      }

      this.logger.info('[YouTubeChatListener] Live chat ID retrieved', {
        liveChatId: this.liveChatId
      });

    } catch (error) {
      this.logger.error('[YouTubeChatListener] Failed to fetch live chat ID:', error);
      throw error;
    }
  }

  /**
   * Start polling for chat messages
   */
  _startPolling() {
    const poll = async () => {
      if (!this.isRunning) {
        return;
      }

      const startTime = Date.now();

      try {
        await this._pollMessages();
        this.metrics.lastPollTime = Date.now();

        const latency = Date.now() - startTime;
        this._updateAverageLatency(latency);

      } catch (error) {
        this.metrics.errors++;
        this.logger.error('[YouTubeChatListener] Poll error:', error);

        // If we get auth errors or forbidden, stop polling
        if (error.code === 401 || error.code === 403) {
          this.logger.error('[YouTubeChatListener] Authentication error, stopping');
          await this.stop();
          return;
        }
      }

      // Schedule next poll
      if (this.isRunning) {
        this.pollTimer = setTimeout(poll, this.pollIntervalMs);
      }
    };

    // Start first poll
    poll();
  }

  /**
   * Poll for new chat messages
   */
  async _pollMessages() {
    this.metrics.pollCount++;

    const response = await this.youtube.liveChatMessages.list({
      liveChatId: this.liveChatId,
      part: ['snippet', 'authorDetails'],
      pageToken: this.nextPageToken,
      maxResults: 200 // Max allowed by API
    });

    // Update next page token
    this.nextPageToken = response.data.nextPageToken;

    // Process messages
    const messages = response.data.items || [];
    this.metrics.messagesReceived += messages.length;

    for (const message of messages) {
      this._processMessage(message);
    }
  }

  /**
   * Process a single chat message
   */
  _processMessage(message) {
    const messageId = message.id;

    // Deduplicate
    if (this.messagesSeen.has(messageId)) {
      return;
    }
    this.messagesSeen.add(messageId);

    // Trim cache if too large (keep last 1000 messages)
    if (this.messagesSeen.size > 1000) {
      const toRemove = Array.from(this.messagesSeen).slice(0, 100);
      toRemove.forEach(id => this.messagesSeen.delete(id));
    }

    const snippet = message.snippet;
    const author = message.authorDetails;

    // Extract message data
    const chatMessage = {
      messageId: messageId,
      text: snippet.displayMessage,
      author: {
        id: author.channelId,
        name: author.displayName,
        isModerator: author.isChatModerator || false,
        isOwner: author.isChatOwner || false,
        isVerified: author.isVerified || false
      },
      publishedAt: snippet.publishedAt,
      type: snippet.type, // 'textMessageEvent', 'superChatEvent', etc.
      platform: 'youtube'
    };

    // Emit to event bus
    this.eventBus.emit('chat:message', chatMessage);
    this.metrics.messagesEmitted++;

    this.logger.info('[YouTubeChatListener] Message emitted', {
      author: chatMessage.author.name,
      text: chatMessage.text.substring(0, 50)
    });
  }

  _loadIdFromSettings() {
    try {
      if (existsSync(SETTINGS_PATH)) {
        const settingsRaw = readFileSync(SETTINGS_PATH, 'utf8');
        const settings = JSON.parse(settingsRaw);
        return settings.broadcastId || null;
      }
    } catch (error) {
      this.logger.error(`[YouTubeChatListener] Error loading settings from ${SETTINGS_PATH}:`, error);
    }
    return null;
  }

  /**
   * Update average poll latency
   */
  _updateAverageLatency(latency) {
    const totalPolls = this.metrics.pollCount;
    const currentAverage = this.metrics.averagePollLatency;
    this.metrics.averagePollLatency = ((currentAverage * (totalPolls - 1)) + latency) / totalPolls;
  }

  async updateBroadcastId(newBroadcastId) {
    if (this.broadcastId === newBroadcastId) {
      console.log(`Broadcast ID is already set to ${newBroadcastId}. No update needed.`);
      return;
    }

    console.log(`Updating YouTube Broadcast ID from ${this.broadcastId} to ${newBroadcastId}...`);
    await this.stop();
    this.broadcastId = newBroadcastId;
    await this.start();
    console.log(`YouTube Chat Listener restarted with new Broadcast ID.`);
  }
}

export default YouTubeChatListener;
