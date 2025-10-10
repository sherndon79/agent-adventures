import { PhaseManager } from './PhaseManager.js';
import { GenreSelection } from './GenreSelection.js';
import { Voting } from './Voting.js';
import { AgentCompetition } from './AgentCompetition.js';
import { Judging } from './Judging.js';
import { SceneConstruction } from './SceneConstruction.js';
import { Presentation } from './Presentation.js';
import { Cleanup } from './Cleanup.js';

export class StoryLoopManager {
  constructor(dependencies) {
    this.dependencies = dependencies;
    this.phaseManager = new PhaseManager(dependencies);
    this.isRunning = false;

    this._registerPhases();
  }

  _registerPhases() {
    this.phaseManager.registerPhase(new GenreSelection(this.dependencies));
    this.phaseManager.registerPhase(new Voting(this.dependencies));
    this.phaseManager.registerPhase(new AgentCompetition(this.dependencies));
    this.phaseManager.registerPhase(new Judging(this.dependencies));
    this.phaseManager.registerPhase(new SceneConstruction(this.dependencies));
    this.phaseManager.registerPhase(new Presentation(this.dependencies));
    this.phaseManager.registerPhase(new Cleanup(this.dependencies));
  }

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.dependencies.eventBus.emit('story_loop:started');
    this.phaseManager.transitionTo('genre-selection', {});
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.dependencies.eventBus.emit('story_loop:stopped');
    // The current phase will complete, but it won't transition to the next one.
  }

  getStatus() {
    return {
      running: this.isRunning,
      phase: this.phaseManager.getCurrentPhase()
    };
  }
}
