import { WebSocketServer } from 'ws';
import http from 'http';
import { handleAudioConnection } from './audioController.js';

// Store WebSocket connections
const dashboardSockets = new Set();
let bridgeSocket = null;

const SUPERVISOR_API_URL = 'http://localhost:9998/control';

// Export dashboardSockets so web-server can use them
export function getDashboardSockets() {
    return dashboardSockets;
}

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

    // Send current story loop state to newly connected client
    if (global.webServerInstance?.storyState) {
        const storyState = global.webServerInstance.storyState;
        const votingState = storyState.getPath('voting');
        const competitionState = storyState.getPath('competition');

        console.log('[StreamController] Syncing state to new client:', {
            hasVotingState: !!votingState,
            votingStateKeys: votingState ? Object.keys(votingState) : [],
            hasGenres: !!votingState?.genres,
            genresLength: votingState?.genres?.length,
            hasTally: !!votingState?.tally,
            tallyKeys: votingState?.tally ? Object.keys(votingState.tally) : [],
            hasWinner: !!votingState?.winner,
            hasCompetitionState: !!competitionState,
            hasCompetitionWinner: !!competitionState?.winner
        });

        // Send current voting state if available
        if (votingState?.genres) {
            console.log('[StreamController] Sending genres to client');
            ws.send(JSON.stringify({
                type: 'loop:genres_ready',
                data: { genres: votingState.genres }
            }));

            // If voting has a tally (active or complete), send voting_started to initialize vote bars
            // This MUST happen before sending vote:received events or voting:complete
            if (votingState.tally !== undefined) {
                console.log('[StreamController] Sending voting_started to initialize vote bars');
                ws.send(JSON.stringify({
                    type: 'loop:voting_started',
                    data: { genres: votingState.genres }
                }));
            }
        }

        // Send current vote tally if available (for live vote counts during active voting)
        if (votingState?.tally && Object.keys(votingState.tally).length > 0) {
            console.log('[StreamController] Sending current vote tally to client');
            // Send individual vote:received events for each genre with votes
            for (const [genreId, tallyData] of Object.entries(votingState.tally)) {
                if (tallyData.votes > 0) {
                    // Send one vote:received event per voter to reconstruct the vote state
                    tallyData.voters.forEach(voter => {
                        ws.send(JSON.stringify({
                            type: 'vote:received',
                            data: {
                                userId: voter.userId,
                                genreId: Number.parseInt(genreId, 10),
                                genreName: tallyData.name,
                                author: voter.author,
                                totalVotes: votingState.tally ? Object.values(votingState.tally).reduce((sum, g) => sum + g.votes, 0) : 0
                            }
                        }));
                    });
                }
            }
        }

        if (votingState?.winner) {
            console.log('[StreamController] Sending voting winner to client');
            ws.send(JSON.stringify({
                type: 'voting:complete',
                data: {
                    winner: votingState.winner,
                    votes: votingState.tally || {}
                }
            }));
        }

        // Send current competition state if available
        if (competitionState?.winner) {
            console.log('[StreamController] Sending competition winner to client');
            ws.send(JSON.stringify({
                type: 'loop:judging_complete',
                data: {
                    winner: competitionState.winner,
                    decision: competitionState.decision
                }
            }));
        }
    } else {
        console.warn('[StreamController] Cannot sync state - storyState not available');
    }

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            console.log('[StreamController] Dashboard message:', data);
            // Forward to webServer handler if available
            if (global.webServerInstance?._handleClientMessage) {
                global.webServerInstance._handleClientMessage(ws, data);
            }
        } catch (error) {
            console.error('Error processing dashboard message:', error);
        }
    });

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

