import { produce } from 'immer';
import { EventEmitter } from 'eventemitter3';

/**
 * Immutable story state management with versioning, transactions, and change tracking
 */
export class StoryState extends EventEmitter {
  constructor(initialState = {}, options = {}) {
    super();

    this.options = {
      maxVersions: options.maxVersions || 100,
      persistenceInterval: options.persistenceInterval || 30000,
      enableChangeTracking: options.enableChangeTracking !== false,
      ...options
    };

    // Initialize state structure
    this.state = {
      narrative: {
        current_scene: null,
        genre: null,
        act: 1,
        tension_level: 'setup',
        active_characters: [],
        story_threads: [],
        ...initialState.narrative
      },
      audience: {
        current_poll: null,
        sentiment: 'neutral',
        energy_level: 'medium',
        platform_stats: {
          twitch: { viewers: 0, engagement: 0 },
          youtube: { viewers: 0, engagement: 0 }
        },
        ...initialState.audience
      },
      scene: {
        assets: [],
        camera_position: [0, 0, 0],
        lighting: 'default',
        waypoints: [],
        ...initialState.scene
      },
      technical: {
        stream_quality: 'good',
        scene_complexity: 'low',
        performance_metrics: {},
        ...initialState.technical
      },
      ...initialState
    };

    // Version management
    this.versions = [this._createVersion(this.state, 'Initial state')];
    this.currentVersion = 0;

    // Transaction management
    this.activeTransactions = new Map();
    this.transactionIdCounter = 0;

    // Change tracking
    this.changeHistory = [];
    this.subscriptions = new Map(); // path -> Set(callbacks)

    // Persistence
    if (this.options.persistenceInterval > 0) {
      this.persistenceTimer = setInterval(
        () => this._persistState(),
        this.options.persistenceInterval
      );
    }
  }

  /**
   * Get the current state (immutable)
   */
  getState() {
    return Object.freeze(this.state);
  }

  /**
   * Get state at specific path
   */
  getPath(path) {
    return this._getNestedValue(this.state, path);
  }

  /**
   * Update state at specific path
   */
  updateState(path, updater, metadata = {}) {
    const oldValue = this._getNestedValue(this.state, path);

    // Use immer for immutable updates
    const newState = produce(this.state, draft => {
      if (typeof updater === 'function') {
        const target = this._getNestedDraft(draft, path, true);
        const result = updater(target);
        if (result !== undefined) {
          this._setNestedValue(draft, path, result);
        }
      } else {
        this._setNestedValue(draft, path, updater);
      }
    });

    const newValue = this._getNestedValue(newState, path);

    // Only update if value actually changed
    if (!this._deepEqual(oldValue, newValue)) {
      const previousState = this.state;
      this.state = newState;

      // Create new version
      this._createNewVersion(`Updated ${path}`, { path, oldValue, newValue, ...metadata });

      // Track change
      if (this.options.enableChangeTracking) {
        this._trackChange(path, oldValue, newValue, metadata);
      }

      // Emit change events
      this._emitChangeEvents(path, newValue, oldValue);

      return {
        success: true,
        oldValue,
        newValue,
        version: this.currentVersion
      };
    }

    return { success: false, reason: 'No change detected' };
  }

  /**
   * Subscribe to changes at specific path
   */
  subscribeToChanges(path, callback) {
    if (!this.subscriptions.has(path)) {
      this.subscriptions.set(path, new Set());
    }

    this.subscriptions.get(path).add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.subscriptions.get(path);
      if (callbacks) {
        callbacks.delete(callback);
        if (callbacks.size === 0) {
          this.subscriptions.delete(path);
        }
      }
    };
  }

  /**
   * Create a transaction for atomic multi-step updates
   */
  createTransaction(description = 'Unnamed transaction') {
    const transactionId = `tx_${++this.transactionIdCounter}_${Date.now()}`;

    this.activeTransactions.set(transactionId, {
      id: transactionId,
      description,
      startState: this.state,
      startVersion: this.currentVersion,
      changes: [],
      timestamp: Date.now()
    });

    return {
      id: transactionId,
      update: (path, updater, metadata = {}) => {
        return this.updateState(path, updater, {
          ...metadata,
          transactionId
        });
      },
      commit: () => this.commitTransaction(transactionId),
      rollback: () => this.rollbackTransaction(transactionId)
    };
  }

  /**
   * Commit a transaction
   */
  commitTransaction(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Transaction is already committed through individual updates
    // Just clean up and emit completion event
    this.activeTransactions.delete(transactionId);

    this.emit('transaction:committed', {
      transactionId,
      description: transaction.description,
      changeCount: transaction.changes.length,
      startVersion: transaction.startVersion,
      endVersion: this.currentVersion
    });

    return {
      success: true,
      transactionId,
      finalVersion: this.currentVersion
    };
  }

  /**
   * Rollback a transaction
   */
  rollbackTransaction(transactionId) {
    const transaction = this.activeTransactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }

    // Rollback to transaction start state
    this.state = transaction.startState;
    this.currentVersion = transaction.startVersion;

    // Remove versions created during transaction
    this.versions = this.versions.slice(0, transaction.startVersion + 1);

    this.activeTransactions.delete(transactionId);

    this.emit('transaction:rolledback', {
      transactionId,
      description: transaction.description
    });

    return {
      success: true,
      transactionId,
      rolledBackToVersion: transaction.startVersion
    };
  }

  /**
   * Rollback to specific version
   */
  rollbackToVersion(versionIndex) {
    if (versionIndex < 0 || versionIndex >= this.versions.length) {
      throw new Error(`Invalid version index: ${versionIndex}`);
    }

    const version = this.versions[versionIndex];
    const previousState = this.state;

    this.state = version.state;
    this.currentVersion = versionIndex;

    // Remove newer versions
    this.versions = this.versions.slice(0, versionIndex + 1);

    this.emit('state:rolledback', {
      fromVersion: this.currentVersion,
      toVersion: versionIndex,
      description: version.description
    });

    return {
      success: true,
      version: versionIndex,
      description: version.description
    };
  }

  /**
   * Get version history
   */
  getVersionHistory() {
    return this.versions.map(({ state, ...version }) => version);
  }

  /**
   * Get change history
   */
  getChangeHistory(path = null, limit = 50) {
    let history = this.changeHistory;

    if (path) {
      history = history.filter(change =>
        change.path === path || change.path.startsWith(path + '.')
      );
    }

    return history.slice(-limit);
  }

  /**
   * Create a new version
   */
  _createNewVersion(description, metadata = {}) {
    const version = this._createVersion(this.state, description, metadata);

    this.versions.push(version);
    this.currentVersion = this.versions.length - 1;

    // Trim old versions
    if (this.versions.length > this.options.maxVersions) {
      this.versions = this.versions.slice(-this.options.maxVersions);
      this.currentVersion = this.versions.length - 1;
    }

    return version;
  }

  /**
   * Create version object
   */
  _createVersion(state, description, metadata = {}) {
    return {
      version: this.currentVersion + 1,
      state: JSON.parse(JSON.stringify(state)), // Deep clone
      timestamp: Date.now(),
      description,
      metadata
    };
  }

  /**
   * Track changes for history
   */
  _trackChange(path, oldValue, newValue, metadata) {
    const change = {
      path,
      oldValue,
      newValue,
      timestamp: Date.now(),
      version: this.currentVersion,
      metadata
    };

    this.changeHistory.push(change);

    // Limit history size
    if (this.changeHistory.length > 1000) {
      this.changeHistory = this.changeHistory.slice(-500);
    }
  }

  /**
   * Emit change events to subscribers
   */
  _emitChangeEvents(path, newValue, oldValue) {
    // Emit specific path changes
    const callbacks = this.subscriptions.get(path);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback({ path, newValue, oldValue, timestamp: Date.now() });
        } catch (error) {
          console.error(`Error in change callback for ${path}:`, error);
        }
      });
    }

    // Emit parent path changes
    const pathParts = path.split('.');
    for (let i = pathParts.length - 1; i > 0; i--) {
      const parentPath = pathParts.slice(0, i).join('.');
      const parentCallbacks = this.subscriptions.get(parentPath);

      if (parentCallbacks) {
        const parentNewValue = this._getNestedValue(this.state, parentPath);
        parentCallbacks.forEach(callback => {
          try {
            callback({
              path: parentPath,
              newValue: parentNewValue,
              oldValue: undefined, // Parent value calculation would be expensive
              childPath: path,
              timestamp: Date.now()
            });
          } catch (error) {
            console.error(`Error in parent change callback for ${parentPath}:`, error);
          }
        });
      }
    }

    // Emit global state change
    this.emit('state:changed', {
      path,
      newValue,
      oldValue,
      state: this.state,
      version: this.currentVersion
    });
  }

  /**
   * Get nested value from object using dot notation
   */
  _getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) =>
      current && current[key] !== undefined ? current[key] : undefined, obj
    );
  }

  /**
   * Set nested value using dot notation
   */
  _setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();

    const target = keys.reduce((current, key) => {
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      return current[key];
    }, obj);

    target[lastKey] = value;
  }

  /**
   * Get nested draft for immer updates
   */
  _getNestedDraft(draft, path, createPath = false) {
    const keys = path.split('.');

    return keys.reduce((current, key) => {
      if (createPath && (current[key] === undefined || current[key] === null)) {
        current[key] = {};
      }
      return current[key];
    }, draft);
  }

  /**
   * Deep equality check
   */
  _deepEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /**
   * Persist state (placeholder for actual persistence)
   */
  _persistState() {
    // This would typically save to database, file, etc.
    if (this.options.enableLogging) {
      console.log('[StoryState] Persisting state...', {
        version: this.currentVersion,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.persistenceTimer) {
      clearInterval(this.persistenceTimer);
    }
    this.removeAllListeners();
    this.subscriptions.clear();
    this.activeTransactions.clear();
  }
}

export default StoryState;