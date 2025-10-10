import { BasePhase } from './BasePhase.js';

export class Judging extends BasePhase {
  constructor(dependencies) {
    super('judging', dependencies);
  }

  async enter(context) {
    const { eventBus, judgePanel, storyState } = this.dependencies;
    const { proposals } = context;

    // 1. Announce judging
    eventBus.emit('loop:judging_started', { proposalCount: proposals.length });

    // 2. Evaluate proposals
    const decision = await judgePanel.evaluateBatch({
      batchId: `judging_${Date.now()}`,
      proposals
    });

    // 3. Find the winning proposal object
    const winningProposal = proposals.find(p => p.agentId === decision.winningAgentId);

    // 4. Save winner to story state for later phases (Presentation needs this)
    storyState.updateState('competition', {
      proposals,
      winner: winningProposal,
      decision
    });

    // 5. Transition to the next phase
    return { nextPhase: 'scene-construction', context: { winningProposal } };
  }
}
