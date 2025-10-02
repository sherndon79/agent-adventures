import { WebSocketServer } from 'ws';
import http from 'http';
import { handleAudioConnection } from './audioController.js';

// Store WebSocket connections
const dashboardSockets = new Set();
let bridgeSocket = null;

const SUPERVISOR_API_URL = 'http://localhost:9998/control';

// --- WebSocket Handling ---

export function setupWebSocketServer(server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws, req) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const path = url.pathname;

        if (path === '/ws/bridge') {
            handleBridgeConnection(ws);
        } else if (path === '/ws/audio') {
            handleAudioConnection(ws);
        } else {
            handleDashboardConnection(ws);
        }
    });
}

function handleBridgeConnection(ws) {
    console.log('Stream Bridge Supervisor connected.');
    bridgeSocket = ws;

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            let enrichedData = { ...data };

            if (data.status === 'running') {
                enrichedData = {
                    ...enrichedData,
                    session: {
                        status: 'live',
                        webRTCMonitorUrl: process.env.WEBRTC_MONITOR_URL || 'http://localhost:8081/webrtc_client.html'
                    }
                };
            }

            const finalMessage = {
                type: 'stream_status',
                data: enrichedData
            };

            const enrichedMessage = JSON.stringify(finalMessage);
            // Forward status updates from the bridge to all dashboards
            dashboardSockets.forEach(socket => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(enrichedMessage);
                }
            });
        } catch (error) {
            console.error('Error processing message from bridge:', error);
        }
    });

    ws.on('close', () => {
        console.log('Stream Bridge Supervisor disconnected.');
        bridgeSocket = null;
        // Notify dashboards that the stream has stopped
        const stoppedMessage = JSON.stringify({
            type: 'stream_status',
            data: { status: 'stopped' }
        });
        dashboardSockets.forEach(socket => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(stoppedMessage);
            }
        });
    });
}

function handleDashboardConnection(ws) {
    console.log('Dashboard client connected.');
    dashboardSockets.add(ws);

    ws.on('close', () => {
        console.log('Dashboard client disconnected.');
        dashboardSockets.delete(ws);
    });
}

// --- HTTP API Controllers ---

export async function startStream(req, res) {
    try {
        const response = await fetch(`${SUPERVISOR_API_URL}/start`, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Supervisor API responded with ${response.status}`);
        }
        res.status(202).json({ message: 'Stream starting' });
    } catch (error) {
        console.error('Error starting stream:', error);
        res.status(500).json({ message: 'Failed to start stream' });
    }
}

export async function stopStream(req, res) {
    try {
        const response = await fetch(`${SUPERVISOR_API_URL}/stop`, { method: 'POST' });
        if (!response.ok) {
            throw new Error(`Supervisor API responded with ${response.status}`);
        }
        res.status(200).json({ message: 'Stream stopped' });
    } catch (error) {
        console.error('Error stopping stream:', error);
        res.status(500).json({ message: 'Failed to stop stream' });
    }
}

export async function getStreamStatus(req, res) {
    try {
        const response = await fetch(`${SUPERVISOR_API_URL}/status`);
        if (!response.ok) {
            throw new Error(`Supervisor API responded with ${response.status}`);
        }
        const data = await response.json();

        if (data.status === 'running') {
            data.session = {
                status: 'live',
                webRTCMonitorUrl: process.env.WEBRTC_MONITOR_URL || 'http://localhost:8081/webrtc_client.html'
            };
        }

        res.status(200).json(data);
    } catch (error) {
        console.error('Error getting stream status:', error);
        res.status(500).json({ message: 'Failed to get stream status' });
    }
}

