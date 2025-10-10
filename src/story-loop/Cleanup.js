import { BasePhase } from './BasePhase.js';

export class Cleanup extends BasePhase {
  constructor(dependencies) {
    super('cleanup', dependencies);
  }

  async enter(context) {
    const { eventBus, mcpClients, storyState } = this.dependencies;

    // Allow a shorter dwell time by default while still respecting overrides
    const cleanupCountdown = Number.parseInt(process.env.STORY_LOOP_CLEANUP_COUNTDOWN || '20', 10) * 1000;

    // 1. Announce cleanup
    eventBus.emit('loop:cleanup_started', { duration: cleanupCountdown });

    // 2. Wait for the countdown
    console.log(`[Cleanup] Waiting ${Math.round(cleanupCountdown / 1000)}s before resetting scene`);
    await new Promise(resolve => setTimeout(resolve, cleanupCountdown));

    // 3. Clear the scene
    await mcpClients.worldBuilder.clearScene('/World', true);

    // 4. Reset state
    storyState.updateState('voting', { genres: [], votes: {}, winner: null });
    storyState.updateState('competition', { proposals: [], winner: null });

    // 5. Transition back to the start of the loop
    return { nextPhase: 'genre-selection', context: {} };
  }
}
