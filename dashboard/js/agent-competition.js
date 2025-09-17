/**
 * Agent Competition Module for Agent Adventures Dashboard
 * Handles agent proposal display, competition state, and judge decisions
 */

class AgentCompetition {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.activeCompetition = null;
    this.proposals = {};
    this.judgeDecision = null;

    this.bindEvents();
    console.log('✅ AgentCompetition module initialized');
  }

  bindEvents() {
    // Competition controls are bound in dashboard-core.js
  }

  handleAgentProposal(proposal) {
    const { agent, type, reasoning, timestamp } = proposal;

    // Store proposal
    this.proposals[agent] = { type, reasoning, timestamp };

    // Update agent status
    this.updateAgentStatus(agent, 'thinking');

    // Display proposal in agent card
    this.displayProposal(agent, reasoning);

    // Log activity
    this.dashboard.logActivity('competition', agent.toUpperCase(),
      `Submitted ${type} proposal`);

    // Update proposal count
    this.incrementProposalCount(agent);
  }

  displayProposal(agent, reasoning) {
    const proposalElement = document.getElementById(`${agent}-proposal`);
    if (!proposalElement) return;

    const contentElement = proposalElement.querySelector('.proposal-content');
    if (contentElement) {
      contentElement.textContent = reasoning;
    }

    // Show the proposal
    proposalElement.style.display = 'block';

    // Highlight agent card
    const agentCard = document.getElementById(`${agent}-agent`);
    if (agentCard) {
      agentCard.classList.add('active');
    }
  }

  handleJudgeDecision(decision) {
    const { winner, reasoning, confidence, timestamp } = decision;

    this.judgeDecision = decision;

    // Update winner status
    this.updateAgentStatus(winner, 'active');

    // Update other agents to inactive
    ['claude', 'gemini', 'gpt'].forEach(agent => {
      if (agent !== winner) {
        this.updateAgentStatus(agent, 'inactive');
        this.hideProposal(agent);

        // Remove active highlight
        const agentCard = document.getElementById(`${agent}-agent`);
        if (agentCard) {
          agentCard.classList.remove('active');
        }
      }
    });

    // Display judge decision
    this.displayJudgeDecision(decision);

    // Update win statistics
    this.incrementWinCount(winner);

    // Log judge decision
    this.dashboard.logActivity('competition', 'JUDGE',
      `${winner} wins with ${confidence} confidence`);

    // Clear competition after delay
    setTimeout(() => {
      this.clearCompetition();
    }, 10000);
  }

  displayJudgeDecision(decision) {
    const judgePanel = document.getElementById('judge-panel');
    const judgeDecisionElement = document.getElementById('judge-decision');
    const judgeReasoningElement = document.getElementById('judge-reasoning');

    if (!judgePanel || !judgeDecisionElement || !judgeReasoningElement) return;

    judgeDecisionElement.innerHTML = `
      <div class="winner-announcement">
        🏆 <strong>${decision.winner.toUpperCase()}</strong> wins!
        <span class="confidence badge badge-${this.getConfidenceBadgeClass(decision.confidence)}">
          ${decision.confidence} confidence
        </span>
      </div>
    `;

    judgeReasoningElement.textContent = decision.reasoning;

    judgePanel.style.display = 'block';
  }

  getConfidenceBadgeClass(confidence) {
    switch (confidence) {
      case 'high': return 'success';
      case 'medium': return 'warning';
      case 'low': return 'error';
      default: return 'inactive';
    }
  }

  updateAgentStatus(agent, status) {
    const statusElement = document.getElementById(`${agent}-status`);
    if (statusElement) {
      statusElement.className = `agent-status ${status}`;
    }

    // Update dashboard system data
    this.dashboard.updateAgentStatus(agent, status);
  }

  incrementProposalCount(agent) {
    const proposalElement = document.getElementById(`${agent}-proposals`);
    if (proposalElement) {
      const current = parseInt(proposalElement.textContent) || 0;
      proposalElement.textContent = current + 1;
    }

    // Update win rate
    this.updateWinRate(agent);
  }

  incrementWinCount(agent) {
    const systemData = this.dashboard.getSystemData();
    const agentData = systemData.agents[agent];

    if (agentData) {
      agentData.wins++;
      this.updateWinRate(agent);
    }
  }

  updateWinRate(agent) {
    const systemData = this.dashboard.getSystemData();
    const agentData = systemData.agents[agent];

    if (agentData && agentData.proposals > 0) {
      const winRate = Math.round((agentData.wins / agentData.proposals) * 100);
      const winRateElement = document.getElementById(`${agent}-winrate`);
      if (winRateElement) {
        winRateElement.textContent = `${winRate}%`;
      }
    }
  }

  updateAgentStats(agentsData) {
    Object.keys(agentsData).forEach(agent => {
      const data = agentsData[agent];

      // Update proposals count
      const proposalElement = document.getElementById(`${agent}-proposals`);
      if (proposalElement) {
        proposalElement.textContent = data.proposals || 0;
      }

      // Update win rate
      this.updateWinRate(agent);

      // Update status
      this.updateAgentStatus(agent, data.status);
    });
  }

  hideProposal(agent) {
    const proposalElement = document.getElementById(`${agent}-proposal`);
    if (proposalElement) {
      proposalElement.style.display = 'none';
    }
  }

  clearCompetition() {
    // Hide all proposals
    ['claude', 'gemini', 'gpt'].forEach(agent => {
      this.hideProposal(agent);
      this.updateAgentStatus(agent, 'inactive');

      const agentCard = document.getElementById(`${agent}-agent`);
      if (agentCard) {
        agentCard.classList.remove('active');
      }
    });

    // Hide judge panel
    const judgePanel = document.getElementById('judge-panel');
    if (judgePanel) {
      judgePanel.style.display = 'none';
    }

    // Clear state
    this.activeCompetition = null;
    this.proposals = {};
    this.judgeDecision = null;

    this.dashboard.logActivity('competition', 'SYSTEM', 'Competition cleared');
  }

  // Public API methods
  getCompetitionStatus() {
    return {
      active: !!this.activeCompetition,
      proposals: this.proposals,
      judgeDecision: this.judgeDecision
    };
  }

  startCompetition(type) {
    this.clearCompetition();
    this.activeCompetition = {
      type,
      startTime: Date.now(),
      status: 'waiting_for_proposals'
    };

    this.dashboard.logActivity('competition', 'SYSTEM',
      `New ${type} competition started`);
  }

  destroy() {
    this.clearCompetition();
    console.log('🔄 AgentCompetition destroyed');
  }
}

// Export for dashboard-core.js
window.AgentCompetition = AgentCompetition;