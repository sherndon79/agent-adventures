/**
 * OME (Open Media Engine) Container Manager for Agent Adventures
 *
 * Manages OME Docker container configuration and streaming workflows
 * for low-latency SRT input to RTMP output (YouTube Live) streaming.
 */

import Docker from 'dockerode';
import fetch from 'node-fetch';
import logger from '../logging/logger.js';

class OMEManager {
    constructor(config = {}) {
        this.docker = new Docker();
        this.containerName = config.containerName || 'ome-server';
        this.omeApiUrl = config.omeApiUrl || 'http://localhost:8081';
        this.srtPort = config.srtPort || 9999;
        this.webRTCPort = config.webRTCPort || 3333;

        this.activeApplications = new Map();
        this.activeStreams = new Map();
    }

    /**
     * Get OME container status
     */
    async getContainerStatus() {
        try {
            const containers = await this.docker.listContainers({ all: true });
            const omeContainer = containers.find(container =>
                container.Names.some(name => name.includes(this.containerName))
            );

            if (!omeContainer) {
                return { status: 'not_found', container: null };
            }

            return {
                status: omeContainer.State,
                container: omeContainer,
                id: omeContainer.Id,
                image: omeContainer.Image,
                ports: omeContainer.Ports
            };

        } catch (error) {
            logger.error('Failed to get OME container status', error);
            throw new Error(`Container status check failed: ${error.message}`);
        }
    }

    /**
     * Ensure OME container is running
     */
    async ensureContainerRunning() {
        const status = await this.getContainerStatus();

        if (status.status === 'not_found') {
            throw new Error('OME container not found. Please start the container first.');
        }

        if (status.status !== 'running') {
            logger.info('Starting OME container', { containerId: status.id });
            const container = this.docker.getContainer(status.id);
            await container.start();

            // Wait for container to be ready
            await this.waitForContainerReady();
        }

        return status;
    }

    /**
     * Wait for OME container to be ready
     */
    async waitForContainerReady(maxAttempts = 30, intervalMs = 1000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await fetch(`${this.omeApiUrl}/v1/stats/current`);
                if (response.ok) {
                    logger.info('OME container is ready');
                    return true;
                }
            } catch (error) {
                // Container not ready yet
            }

            if (attempt === maxAttempts) {
                throw new Error('OME container did not become ready within timeout');
            }

            await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
    }

    /**
     * Create OME application for YouTube streaming
     */
    async createApplication(applicationName, config = {}) {
        try {
            await this.ensureContainerRunning();

            const applicationConfig = {
                name: applicationName,
                type: 'live',
                providers: {
                    srt: {
                        port: this.srtPort
                    }
                },
                publishers: {
                    rtmp: {
                        port: 1935
                    },
                    webrtc: {
                        port: this.webRTCPort
                    }
                },
                ...config
            };

            logger.info('Creating OME application', { applicationName, config: applicationConfig });

            const response = await fetch(`${this.omeApiUrl}/v1/vhosts/default/apps`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(applicationConfig)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OME API error: ${response.status} - ${error}`);
            }

            const result = await response.json();
            this.activeApplications.set(applicationName, result);

            logger.info('OME application created successfully', { applicationName });
            return result;

        } catch (error) {
            logger.error('Failed to create OME application', error);
            throw new Error(`OME application creation failed: ${error.message}`);
        }
    }

    /**
     * Delete OME application
     */
    async deleteApplication(applicationName) {
        try {
            logger.info('Deleting OME application', { applicationName });

            const response = await fetch(`${this.omeApiUrl}/v1/vhosts/default/apps/${applicationName}`, {
                method: 'DELETE'
            });

            if (!response.ok && response.status !== 404) {
                const error = await response.text();
                throw new Error(`OME API error: ${response.status} - ${error}`);
            }

            this.activeApplications.delete(applicationName);
            logger.info('OME application deleted', { applicationName });

        } catch (error) {
            logger.error('Failed to delete OME application', error);
            throw new Error(`OME application deletion failed: ${error.message}`);
        }
    }

    /**
     * Create RTMP push stream to YouTube
     */
    async createYouTubeRTMPPush(applicationName, streamName, youtubeRtmpUrl, youtubeStreamKey) {
        try {
            const pushConfig = {
                id: `youtube_${streamName}`,
                stream: {
                    name: streamName,
                    tracks: []
                },
                protocol: 'rtmp',
                url: `${youtubeRtmpUrl}/${youtubeStreamKey}`,
                streamKey: youtubeStreamKey
            };

            logger.info('Creating YouTube RTMP push stream', {
                applicationName,
                streamName,
                youtubeUrl: youtubeRtmpUrl
            });

            const response = await fetch(`${this.omeApiUrl}/v1/vhosts/default/apps/${applicationName}/streams/${streamName}/push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(pushConfig)
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OME API error: ${response.status} - ${error}`);
            }

            const result = await response.json();
            this.activeStreams.set(`${applicationName}/${streamName}`, result);

            logger.info('YouTube RTMP push stream created', { applicationName, streamName });
            return result;

        } catch (error) {
            logger.error('Failed to create YouTube RTMP push', error);
            throw new Error(`YouTube RTMP push creation failed: ${error.message}`);
        }
    }

    /**
     * Start RTMP push to YouTube
     */
    async startYouTubePush(applicationName, streamName, pushId) {
        try {
            logger.info('Starting YouTube RTMP push', { applicationName, streamName, pushId });

            const response = await fetch(`${this.omeApiUrl}/v1/vhosts/default/apps/${applicationName}/streams/${streamName}/push/${pushId}/start`, {
                method: 'POST'
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OME API error: ${response.status} - ${error}`);
            }

            logger.info('YouTube RTMP push started', { applicationName, streamName });
            return true;

        } catch (error) {
            logger.error('Failed to start YouTube RTMP push', error);
            throw new Error(`YouTube RTMP push start failed: ${error.message}`);
        }
    }

    /**
     * Stop RTMP push to YouTube
     */
    async stopYouTubePush(applicationName, streamName, pushId) {
        try {
            logger.info('Stopping YouTube RTMP push', { applicationName, streamName, pushId });

            const response = await fetch(`${this.omeApiUrl}/v1/vhosts/default/apps/${applicationName}/streams/${streamName}/push/${pushId}/stop`, {
                method: 'POST'
            });

            if (!response.ok && response.status !== 404) {
                const error = await response.text();
                throw new Error(`OME API error: ${response.status} - ${error}`);
            }

            logger.info('YouTube RTMP push stopped', { applicationName, streamName });
            return true;

        } catch (error) {
            logger.error('Failed to stop YouTube RTMP push', error);
            throw new Error(`YouTube RTMP push stop failed: ${error.message}`);
        }
    }

    /**
     * Get SRT connection details for Isaac Sim
     */
    getSRTConnectionDetails(applicationName, streamName) {
        return {
            srtUrl: `srt://localhost:${this.srtPort}?streamid=${applicationName}/${streamName}`,
            applicationName,
            streamName,
            port: this.srtPort
        };
    }

    /**
     * Get WebRTC player URL for monitoring
     */
    getWebRTCPlayerUrl(applicationName, streamName) {
        return `http://localhost:${this.webRTCPort}/player.html?app=${applicationName}&stream=${streamName}`;
    }

    /**
     * Get OME statistics
     */
    async getStatistics() {
        try {
            const response = await fetch(`${this.omeApiUrl}/v1/stats/current`);

            if (!response.ok) {
                throw new Error(`OME API error: ${response.status}`);
            }

            return await response.json();

        } catch (error) {
            logger.error('Failed to get OME statistics', error);
            throw new Error(`OME statistics retrieval failed: ${error.message}`);
        }
    }

    /**
     * List active streams in application
     */
    async listStreams(applicationName) {
        try {
            const response = await fetch(`${this.omeApiUrl}/v1/vhosts/default/apps/${applicationName}/streams`);

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`OME API error: ${response.status} - ${error}`);
            }

            return await response.json();

        } catch (error) {
            logger.error('Failed to list OME streams', error);
            throw new Error(`OME stream listing failed: ${error.message}`);
        }
    }

    /**
     * Get stream information
     */
    async getStreamInfo(applicationName, streamName) {
        try {
            const response = await fetch(`${this.omeApiUrl}/v1/vhosts/default/apps/${applicationName}/streams/${streamName}`);

            if (!response.ok) {
                if (response.status === 404) {
                    return null;
                }
                const error = await response.text();
                throw new Error(`OME API error: ${response.status} - ${error}`);
            }

            return await response.json();

        } catch (error) {
            logger.error('Failed to get OME stream info', error);
            throw new Error(`OME stream info retrieval failed: ${error.message}`);
        }
    }

    /**
     * Health check for OME container and API
     */
    async healthCheck() {
        try {
            const containerStatus = await this.getContainerStatus();
            const apiHealthy = await this.checkAPIHealth();

            return {
                container: containerStatus,
                api: apiHealthy,
                overall: containerStatus.status === 'running' && apiHealthy
            };

        } catch (error) {
            logger.error('OME health check failed', error);
            return {
                container: { status: 'error' },
                api: false,
                overall: false,
                error: error.message
            };
        }
    }

    /**
     * Check OME API health
     */
    async checkAPIHealth() {
        try {
            const response = await fetch(`${this.omeApiUrl}/v1/stats/current`, {
                timeout: 5000
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

export default OMEManager;
export { OMEManager };