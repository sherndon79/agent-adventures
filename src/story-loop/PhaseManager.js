import { EventEmitter } from 'eventemitter3';

export class PhaseManager extends EventEmitter {
  constructor(dependencies) {
    super();
    this.dependencies = dependencies;
    this.phases = new Map();
    this.currentPhase = null;
  }

  registerPhase(phase) {
    this.phases.set(phase.name, phase);
  }

  async transitionTo(phaseName, context) {
    if (this.currentPhase) {
      await this.currentPhase.exit();
    }

    const nextPhase = this.phases.get(phaseName);
    if (!nextPhase) {
      throw new Error(`Phase ${phaseName} not registered.`);
    }

    this.currentPhase = nextPhase;
    const result = await this.currentPhase.enter(context);

    if (result && result.nextPhase) {
      this.transitionTo(result.nextPhase, result.context);
    }
  }

  getCurrentPhase() {
    return this.currentPhase ? this.currentPhase.name : 'idle';
  }
}
