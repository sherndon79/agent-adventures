/**
 * Dashboard Event Adapter
 *
 * Normalises internal platform events into the schema expected by the
 * dashboard WebSocket clients. Centralising the mapping keeps the
 * transport layer thin and makes it easier to evolve the payloads
 * without touching the web server logic.
 */

export const DASHBOARD_EVENT_TYPES = Object.freeze({
  PLATFORM_STARTED: 'platform_started',
  PLATFORM_STATUS: 'platform_status',
  SYSTEM_METRICS: 'metrics_update',
  STREAM_STATUS: 'stream_status',
  AGENT_PROPOSAL: 'agent_proposal',
  JUDGE_DECISION: 'judge_decision',
  COMPETITION_STARTED: 'competition_started',
  COMPETITION_VOTING: 'competition_voting',
  COMPETITION_COMPLETED: 'competition_completed',
  SETTINGS_UPDATED: 'settings_updated',
  ACTIVITY_LOG: 'activity_log'
});

export function adaptPlatformStatus(payload = {}) {
  return {
    ...payload,
    services: payload.services || {},
    isaacSim: payload.isaacSim || {
      connected: false,
      mockMode: true
    }
  };
}

export function adaptAgentProposal(payload = {}) {
  const { batchId, proposal = {} } = payload;
  const reasoning = proposal.reasoning || proposal.metadata?.summary || '';

  return {
    batchId,
    agentId: proposal.agentId,
    agent: proposal.agentId,
    proposalType: proposal.proposalType,
    reasoning,
    summary: reasoning,
    data: proposal.data || {},
    timestamp: proposal.timestamp || Date.now(),
    metadata: proposal.metadata || {}
  };
}

export function adaptJudgeDecision(payload = {}) {
  const { batchId, winningAgentId, winningProposal = {}, decision = {} } = payload;
  const reasoning = decision.reasoning || winningProposal.reasoning || 'No reasoning provided';

  return {
    batchId,
    winner: winningAgentId,
    reasoning,
    confidence: decision.confidence || 'medium',
    timestamp: decision.timestamp || Date.now(),
    method: decision.method || 'mock_voting',
    proposal: {
      id: winningProposal.id,
      data: winningProposal.data || {},
      reasoning: winningProposal.reasoning || ''
    }
  };
}

export function adaptCompetitionVoting(payload = {}) {
  return {
    batchId: payload.batchId,
    winningAgentId: payload.winningAgentId,
    totalVotes: payload.totalVotes || 0,
    voteBreakdown: payload.voteBreakdown || {},
    method: payload.method || 'mock_audience_voting',
    timestamp: payload.timestamp || Date.now()
  };
}

export function adaptCompetitionCompleted(payload = {}) {
  return {
    batchId: payload.batchId,
    result: payload.result || {},
    timestamp: payload.timestamp || Date.now()
  };
}

export function adaptSettings(settings = {}) {
  return {
    llmApis: settings.llmApis,
    mcpCalls: settings.mcpCalls,
    streaming: settings.streaming,
    judgePanel: settings.judgePanel
  };
}
