export class BasePhase {
  constructor(name, dependencies) {
    this.name = name;
    this.dependencies = dependencies;
  }

  async enter(context) {
    throw new Error("Method 'enter()' must be implemented.");
  }

  async exit() {
    // Optional cleanup logic
  }
}
