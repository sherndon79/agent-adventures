/**
 * YouTube Live API Service for Agent Adventures
 *
 * Provides authenticated access to YouTube Data API v3 for live streaming
 * management including broadcast creation, stream configuration, and status monitoring.
 */

import { google } from 'googleapis';
import logger from '../logging/logger.js';

class YouTubeLiveService {
    constructor(apiKey, oauth2Client = null) {
        this.apiKey = apiKey;
        this.oauth2Client = oauth2Client;
        this.youtube = google.youtube({
            version: 'v3',
            auth: oauth2Client || apiKey
        });

        this.activeBroadcasts = new Map();
        this.activeStreams = new Map();
    }

    /**
     * Create a new YouTube Live broadcast
     */
    async createLiveBroadcast(options = {}) {
        const {
            title = 'Agent Adventures Live Stream',
            description = 'Live stream from Isaac Sim via Agent Adventures',
            scheduledStartTime = new Date().toISOString(),
            privacy = 'unlisted', // public, unlisted, private
            enableMonitorStream = true,
            enableDvr = true
        } = options;

        try {
            logger.info('Creating YouTube Live broadcast', { title, privacy });

            const broadcastResponse = await this.youtube.liveBroadcasts.insert({
                part: ['snippet', 'status', 'contentDetails'],
                requestBody: {
                    snippet: {
                        title,
                        description,
                        scheduledStartTime
                    },
                    status: {
                        privacyStatus: privacy,
                        selfDeclaredMadeForKids: false
                    },
                    contentDetails: {
                        enableMonitorStream,
                        enableDvr,
                        enableContentEncryption: false,
                        monitorStream: {
                            enableMonitorStream,
                            broadcastStreamDelayMs: 0
                        }
                    }
                }
            });

            const broadcast = broadcastResponse.data;
            this.activeBroadcasts.set(broadcast.id, broadcast);

            logger.info('YouTube Live broadcast created', {
                broadcastId: broadcast.id,
                watchUrl: `https://www.youtube.com/watch?v=${broadcast.id}`
            });

            return broadcast;

        } catch (error) {
            logger.error('Failed to create YouTube Live broadcast', error);
            throw new Error(`YouTube Live broadcast creation failed: ${error.message}`);
        }
    }

    /**
     * Create a new YouTube Live stream
     */
    async createLiveStream(options = {}) {
        const {
            title = 'Agent Adventures Stream',
            format = '1080p',
            ingestionType = 'rtmp'
        } = options;

        try {
            logger.info('Creating YouTube Live stream', { title, format });

            const streamResponse = await this.youtube.liveStreams.insert({
                part: ['snippet', 'cdn'],
                requestBody: {
                    snippet: {
                        title
                    },
                    cdn: {
                        format,
                        ingestionType,
                        ingestionInfo: {
                            streamName: `agent-adventures-${Date.now()}`
                        }
                    }
                }
            });

            const stream = streamResponse.data;
            this.activeStreams.set(stream.id, stream);

            logger.info('YouTube Live stream created', {
                streamId: stream.id,
                rtmpUrl: stream.cdn.ingestionInfo.ingestionAddress,
                streamKey: stream.cdn.ingestionInfo.streamName
            });

            return stream;

        } catch (error) {
            logger.error('Failed to create YouTube Live stream', error);
            throw new Error(`YouTube Live stream creation failed: ${error.message}`);
        }
    }

    /**
     * Bind a stream to a broadcast
     */
    async bindStreamToBroadcast(broadcastId, streamId) {
        try {
            logger.info('Binding stream to broadcast', { broadcastId, streamId });

            const response = await this.youtube.liveBroadcasts.bind({
                part: ['id', 'contentDetails'],
                id: broadcastId,
                streamId
            });

            logger.info('Stream bound to broadcast successfully', { broadcastId, streamId });
            return response.data;

        } catch (error) {
            logger.error('Failed to bind stream to broadcast', error);
            throw new Error(`Stream binding failed: ${error.message}`);
        }
    }

    /**
     * Start a live broadcast
     */
    async startBroadcast(broadcastId) {
        try {
            logger.info('Starting YouTube Live broadcast', { broadcastId });

            const response = await this.youtube.liveBroadcasts.transition({
                part: ['status'],
                id: broadcastId,
                broadcastStatus: 'live'
            });

            logger.info('YouTube Live broadcast started', { broadcastId });
            return response.data;

        } catch (error) {
            logger.error('Failed to start YouTube Live broadcast', error);
            throw new Error(`Broadcast start failed: ${error.message}`);
        }
    }

    /**
     * Stop a live broadcast
     */
    async stopBroadcast(broadcastId) {
        try {
            logger.info('Stopping YouTube Live broadcast', { broadcastId });

            const response = await this.youtube.liveBroadcasts.transition({
                part: ['status'],
                id: broadcastId,
                broadcastStatus: 'complete'
            });

            this.activeBroadcasts.delete(broadcastId);
            logger.info('YouTube Live broadcast stopped', { broadcastId });
            return response.data;

        } catch (error) {
            logger.error('Failed to stop YouTube Live broadcast', error);
            throw new Error(`Broadcast stop failed: ${error.message}`);
        }
    }

    /**
     * Get broadcast status and health
     */
    async getBroadcastStatus(broadcastId) {
        try {
            const response = await this.youtube.liveBroadcasts.list({
                part: ['status', 'contentDetails'],
                id: broadcastId
            });

            return response.data.items[0] || null;

        } catch (error) {
            logger.error('Failed to get broadcast status', error);
            throw new Error(`Broadcast status check failed: ${error.message}`);
        }
    }

    /**
     * Get stream health metrics
     */
    async getStreamHealth(streamId) {
        try {
            const response = await this.youtube.liveStreams.list({
                part: ['status'],
                id: streamId
            });

            const stream = response.data.items[0];
            return stream ? stream.status : null;

        } catch (error) {
            logger.error('Failed to get stream health', error);
            throw new Error(`Stream health check failed: ${error.message}`);
        }
    }

    /**
     * Create complete YouTube Live session (broadcast + stream + binding)
     */
    async createLiveSession(options = {}) {
        try {
            logger.info('Creating complete YouTube Live session');

            // Create broadcast
            const broadcast = await this.createLiveBroadcast(options.broadcast);

            // Create stream
            const stream = await this.createLiveStream(options.stream);

            // Bind stream to broadcast
            await this.bindStreamToBroadcast(broadcast.id, stream.id);

            const session = {
                broadcastId: broadcast.id,
                streamId: stream.id,
                watchUrl: `https://www.youtube.com/watch?v=${broadcast.id}`,
                rtmpUrl: stream.cdn.ingestionInfo.ingestionAddress,
                streamKey: stream.cdn.ingestionInfo.streamName,
                broadcast,
                stream
            };

            logger.info('YouTube Live session created successfully', {
                broadcastId: session.broadcastId,
                streamId: session.streamId,
                watchUrl: session.watchUrl
            });

            return session;

        } catch (error) {
            logger.error('Failed to create YouTube Live session', error);
            throw error;
        }
    }

    /**
     * List active broadcasts
     */
    async listActiveBroadcasts() {
        try {
            const response = await this.youtube.liveBroadcasts.list({
                part: ['snippet', 'status'],
                broadcastStatus: 'active',
                maxResults: 50
            });

            return response.data.items || [];

        } catch (error) {
            logger.error('Failed to list active broadcasts', error);
            throw new Error(`Failed to list broadcasts: ${error.message}`);
        }
    }

    /**
     * Delete a broadcast (cleanup)
     */
    async deleteBroadcast(broadcastId) {
        try {
            logger.info('Deleting YouTube Live broadcast', { broadcastId });

            await this.youtube.liveBroadcasts.delete({
                id: broadcastId
            });

            this.activeBroadcasts.delete(broadcastId);
            logger.info('YouTube Live broadcast deleted', { broadcastId });

        } catch (error) {
            logger.error('Failed to delete YouTube Live broadcast', error);
            throw new Error(`Broadcast deletion failed: ${error.message}`);
        }
    }

    /**
     * Delete a stream (cleanup)
     */
    async deleteStream(streamId) {
        try {
            logger.info('Deleting YouTube Live stream', { streamId });

            await this.youtube.liveStreams.delete({
                id: streamId
            });

            this.activeStreams.delete(streamId);
            logger.info('YouTube Live stream deleted', { streamId });

        } catch (error) {
            logger.error('Failed to delete YouTube Live stream', error);
            throw new Error(`Stream deletion failed: ${error.message}`);
        }
    }

    /**
     * Get channel information
     */
    async getChannelInfo() {
        try {
            const response = await this.youtube.channels.list({
                part: ['snippet', 'statistics'],
                mine: true
            });

            return response.data.items[0] || null;

        } catch (error) {
            logger.error('Failed to get channel info', error);
            throw new Error(`Channel info retrieval failed: ${error.message}`);
        }
    }
}

export default YouTubeLiveService;
export { YouTubeLiveService };