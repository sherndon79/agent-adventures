/**
 * Chat Message Poster - Posts messages to live chat platforms
 *
 * Handles posting announcements, notifications, and countdown messages
 * to YouTube Live Chat with rate limiting and error handling.
 */

import { google } from 'googleapis';
import { readFileSync } from 'fs';

export class ChatMessagePoster {
  constructor({ apiKey, liveChatId, oauthTokenPath, logger = console }) {
    if (!apiKey && !oauthTokenPath) {
      throw new Error('Either YouTube API key or OAuth token path is required');
    }
    if (!liveChatId) {
      throw new Error('Live chat ID is required');
    }

    this.apiKey = apiKey;
    this.liveChatId = liveChatId;
    this.oauthTokenPath = oauthTokenPath;
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
        this.logger.info('[ChatMessagePoster] Using OAuth credentials');
      } catch (error) {
        this.logger.warn('[ChatMessagePoster] Failed to load OAuth token, falling back to API key:', error.message);
        auth = apiKey;
      }
    } else {
      auth = apiKey;
    }

    // Initialize YouTube API client
    this.youtube = google.youtube({
      version: 'v3',
      auth
    });

    // Rate limiting (YouTube allows ~1 message per second)
    this.lastMessageTime = 0;
    this.minMessageInterval = 1000; // 1 second between messages

    // Message queue for rate limiting
    this.messageQueue = [];
    this.isProcessing = false;

    // Metrics
    this.metrics = {
      messagesSent: 0,
      messagesQueued: 0,
      messagesFailed: 0,
      averageLatency: 0
    };
  }

  /**
   * Post a message to chat
   */
  async postMessage(text) {
    if (!text || typeof text !== 'string') {
      this.logger.warn('[ChatMessagePoster] Invalid message text');
      return { success: false, error: 'Invalid message text' };
    }

    // Truncate if too long (YouTube max is 200 characters)
    const truncatedText = text.length > 200 ? text.substring(0, 197) + '...' : text;

    this.metrics.messagesQueued++;
    this.messageQueue.push(truncatedText);

    // Start processing if not already running
    if (!this.isProcessing) {
      this._processQueue();
    }

    return { success: true, queued: true };
  }

  /**
   * Post a formatted voting announcement
   */
  async postVotingAnnouncement(genres) {
    // Consolidate into single message to save YouTube API quota
    // YouTube chat limit: 200 chars
    // Header "🎬 SCENE VOTING 🎬\n" = 20 chars
    // Each scene line "N️⃣ Name\n" = 4 chars overhead + name (max 30 chars)
    // Total: 20 + (5 × 34) = 190 chars max

    const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
    const lines = ['🎬 SCENE VOTING 🎬'];

    for (let i = 0; i < genres.length; i++) {
      lines.push(`${emojis[i]} ${genres[i].name}`);
    }

    const message = lines.join('\n');

    // Verify message fits within limit
    if (message.length > 200) {
      this.logger.warn('[ChatMessagePoster] Voting message exceeds 200 chars, truncating');
      await this.postMessage(message.substring(0, 197) + '...');
    } else {
      await this.postMessage(message);
    }

    // Instructions message
    await this.postMessage('⚠️ Reply 1-5 to vote! First vote starts 30s timer.');

    return { success: true };
  }

  /**
   * Post countdown notification
   */
  async postCountdown(secondsRemaining) {
    let message;
    if (secondsRemaining >= 10) {
      message = `⏰ ${secondsRemaining} seconds remaining!`;
    } else {
      message = `⏰ ${secondsRemaining}...`;
    }
    return await this.postMessage(message);
  }

  /**
   * Post winner announcement
   */
  async postWinnerAnnouncement(genreName, agentName = null) {
    const lines = [`🏆 Genre selected: ${genreName}`];

    if (agentName) {
      lines.push('');
      lines.push(`🤖 ${agentName} is designing your scene...`);
    } else {
      lines.push('');
      lines.push('🤖 AI agents are now designing your scene...');
    }

    const message = lines.join('\n');
    return await this.postMessage(message);
  }

  /**
   * Post scene construction announcement
   */
  async postSceneConstruction(agentName, concept) {
    const conceptPreview = concept.length > 80 ? concept.substring(0, 77) + '...' : concept;
    const message = `🎨 Building ${agentName}'s scene: ${conceptPreview}`;
    return await this.postMessage(message);
  }

  /**
   * Post scene ready announcement
   */
  async postSceneReady(genreName) {
    const message = `✨ Scene complete! Enjoy the ${genreName} experience...\n\nNext vote begins in 60 seconds!`;
    return await this.postMessage(message);
  }

  /**
   * Post cleanup countdown
   */
  async postCleanupCountdown(seconds) {
    let message;
    if (seconds === 60) {
      message = '⏰ Scene clearing in 60 seconds...';
    } else if (seconds === 30) {
      message = '⏰ New vote in 30 seconds!';
    } else if (seconds === 10) {
      message = '⏰ Scene clearing in 10 seconds...';
    } else if (seconds <= 5) {
      message = `⏰ ${seconds}...`;
    } else {
      return { success: false, error: 'Invalid cleanup countdown value' };
    }
    return await this.postMessage(message);
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      queueLength: this.messageQueue.length,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Process the message queue with rate limiting
   */
  async _processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.messageQueue.length > 0) {
      const text = this.messageQueue.shift();

      // Rate limiting
      const now = Date.now();
      const timeSinceLastMessage = now - this.lastMessageTime;
      if (timeSinceLastMessage < this.minMessageInterval) {
        const waitTime = this.minMessageInterval - timeSinceLastMessage;
        await this._delay(waitTime);
      }

      // Send message
      const startTime = Date.now();
      try {
        await this._sendMessage(text);
        this.metrics.messagesSent++;
        this.lastMessageTime = Date.now();

        const latency = Date.now() - startTime;
        this._updateAverageLatency(latency);

      } catch (error) {
        this.metrics.messagesFailed++;
        this.logger.error('[ChatMessagePoster] Failed to send message:', error);

        // Re-queue if it's a transient error
        if (error.code === 429 || error.code === 503) {
          this.logger.warn('[ChatMessagePoster] Rate limited, re-queuing message');
          this.messageQueue.unshift(text);
          await this._delay(5000); // Wait 5 seconds before retry
        }
      }
    }

    this.isProcessing = false;
  }

  /**
   * Send a single message via YouTube API
   */
  async _sendMessage(text) {
    await this.youtube.liveChatMessages.insert({
      part: ['snippet'],
      requestBody: {
        snippet: {
          liveChatId: this.liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: {
            messageText: text
          }
        }
      }
    });

    this.logger.info('[ChatMessagePoster] Message sent:', text.substring(0, 50));
  }

  /**
   * Delay utility
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update average latency
   */
  _updateAverageLatency(latency) {
    const totalMessages = this.metrics.messagesSent;
    const currentAverage = this.metrics.averageLatency;
    this.metrics.averageLatency = ((currentAverage * (totalMessages - 1)) + latency) / totalMessages;
  }
}

export default ChatMessagePoster;
