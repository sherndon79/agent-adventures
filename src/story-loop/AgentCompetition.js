import { BasePhase } from './BasePhase.js';

export class AgentCompetition extends BasePhase {
  constructor(dependencies) {
    super('agent-competition', dependencies);
  }

  async enter(context) {
    const { eventBus, agentManager } = this.dependencies;
    const { winningGenre } = context;

    // 1. Announce competition
    eventBus.emit('loop:competition_started', { genre: winningGenre });

    // 2. Send prompts to agents
    const proposals = await this._runCompetition(winningGenre);

    // 3. Transition to the next phase
    return { nextPhase: 'judging', context: { proposals } };
  }

  async _runCompetition(genre) {
    // Run the full three-prompt competition sequence:
    // 1. Scene/Asset Design
    // 2. Camera Choreography
    // 3. Audio/Narration Design
    const { agentManager, eventBus } = this.dependencies;
    const agents = Array.from(agentManager.agents.values());
    const agentMap = new Map(agents.map(agent => [agent.id, agent]));
    const competitionId = `competition_${Date.now()}`;

    console.log('[AgentCompetition] Starting three-stage competition with', agents.length, 'agents');

    // STAGE 1: Asset/Scene Design
    console.log('[AgentCompetition] Stage 1/3: Scene Design');
    eventBus.emit('loop:competition_stage', { stage: 1, name: 'Scene Design' });

    const assetProposals = await Promise.allSettled(
      agents.map(agent =>
        agent.generateProposal({
          id: `${competitionId}_assets`,
          type: 'asset_placement',
          genre
        })
      )
    );

    const successfulAssets = assetProposals
      .filter(r => r.status === 'fulfilled')
      .map(r => ({ agentId: r.value.agentId, proposal: r.value }));

    if (successfulAssets.length === 0) {
      console.error('[AgentCompetition] No agents succeeded in scene design');
      return [];
    }

    // STAGE 2: Camera Choreography
    console.log('[AgentCompetition] Stage 2/3: Camera Choreography');
    eventBus.emit('loop:competition_stage', { stage: 2, name: 'Camera Choreography' });

    const cameraProposals = await Promise.allSettled(
      successfulAssets.map(({ agentId, proposal: assetProposal }) => (async () => {
        const agent = agentMap.get(agentId);
        if (!agent) {
          throw new Error(`Agent ${agentId} not found for camera planning stage`);
        }

        return agent.generateProposal({
          id: `${competitionId}_camera`,
          type: 'camera_planning',
          genre,
          assetProposal: assetProposal.data
        });
      })())
    );

    const successfulCameras = cameraProposals
      .filter(r => r.status === 'fulfilled')
      .map(r => ({ agentId: r.value.agentId, proposal: r.value }));

    const cameraMap = new Map(successfulCameras.map(({ agentId, proposal }) => [agentId, proposal]));

    // STAGE 3: Audio/Narration Design
    console.log('[AgentCompetition] Stage 3/3: Audio & Narration');
    eventBus.emit('loop:competition_stage', { stage: 3, name: 'Audio & Narration' });

    const audioProposals = await Promise.allSettled(
      successfulAssets.map(({ agentId, proposal: assetProposal }) => (async () => {
        const agent = agentMap.get(agentId);
        if (!agent) {
          throw new Error(`Agent ${agentId} not found for audio stage`);
        }

        const cameraProposal = cameraMap.get(agentId);

        return agent.generateProposal({
          id: `${competitionId}_audio`,
          type: 'audio_narration',
          genre,
          assetProposal: assetProposal.data,
          cameraProposal: cameraProposal?.data
        });
      })())
    );

    const successfulAudio = audioProposals
      .filter(r => r.status === 'fulfilled')
      .map(r => ({ agentId: r.value.agentId, proposal: r.value }));

    const audioMap = new Map(successfulAudio.map(({ agentId, proposal }) => [agentId, proposal]));

    // Combine all three stages into complete proposals
    const completeProposals = successfulAssets.map(({ agentId, proposal: assetProposal }) => {
      const cameraProposal = cameraMap.get(agentId);
      const audioProposal = audioMap.get(agentId);

      return {
        ...assetProposal,
        data: {
          ...assetProposal.data,
          shots: cameraProposal?.data?.shots || [],
          narration: audioProposal?.data?.narration || null,
          music: audioProposal?.data?.music || null,
          ambient: audioProposal?.data?.ambient || null,
          audioSpec: audioProposal?.data || null
        }
      };
    });

    console.log('[AgentCompetition] Competition complete:', completeProposals.length, 'complete proposals');
    return completeProposals;
  }
}
