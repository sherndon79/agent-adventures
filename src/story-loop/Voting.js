import { BasePhase } from './BasePhase.js';

export class Voting extends BasePhase {
  constructor(dependencies) {
    super('voting', dependencies);
  }

  async enter(context) {
    const { eventBus, voteCollector, voteTimer, storyState } = this.dependencies;
    const { genres } = context;

    // 1. Save genres to story state immediately (before voting starts)
    // This allows dashboard to show genres even during voting
    console.log('[Voting] Saving genres to story state:', { genreCount: genres?.length });
    storyState.updateState('voting', {
      genres,
      winner: null,
      tally: {}
    });
    console.log('[Voting] Genres saved to story state');

    // 2. Announce voting
    eventBus.emit('loop:voting_started', context);

    // 3. Start collecting votes with genres from context
    voteCollector.startVoting(genres);

    // 4. Update vote tally in story state whenever votes are received
    const voteReceivedHandler = eventBus.subscribe('vote:received', () => {
      const currentTally = voteCollector.getTally();
      console.log('[Voting] Updating tally in story state:', {
        tallyKeys: Object.keys(currentTally.tally),
        totalVotes: currentTally.totalVotes
      });
      storyState.updateState('voting', {
        genres,
        winner: null,
        tally: currentTally.tally
      });
    });

    // 5. Wait for the voting to complete
    const winner = await new Promise(resolve => {
      eventBus.once('voting:complete', (event) => {
        const result = voteCollector.getWinner();
        resolve(result.winner);
      });
    });

    // 6. Cleanup vote received handler
    if (voteReceivedHandler) {
      voteReceivedHandler();
    }

    // 7. Stop collecting votes
    voteCollector.stopVoting();

    // 8. Update story state with winner and final votes
    const finalTally = voteCollector.getTally();
    console.log('[Voting] Saving final tally to story state:', {
      winner: winner?.name,
      tallyKeys: Object.keys(finalTally.tally),
      totalVotes: finalTally.totalVotes
    });
    storyState.updateState('voting', {
      genres,
      winner,
      tally: finalTally.tally
    });

    // 9. Transition to the next phase
    return { nextPhase: 'agent-competition', context: { winningGenre: winner } };
  }
}
