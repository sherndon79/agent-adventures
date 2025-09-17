import { EventEmitter } from 'eventemitter3';
import { readFile, readdir } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { pathToFileURL } from 'url';

/**
 * Manages agent lifecycle, plugin loading, and coordination
 */
export class AgentManager extends EventEmitter {
  constructor(dependencies = {}) {
    super();

    this.dependencies = dependencies;
    this.agents = new Map(); // agentId -> agent instance
    this.manifests = new Map(); // agentId -> manifest
    this.config = {
      agentDirectories: ['src/agents', 'plugins'],
      maxConcurrentLoads: 5,
      healthCheckInterval: 30000,
      defaultAgentConfig: {},
      ...dependencies.config?.agentManager
    };

    this.loadingQueue = [];
    this.isProcessingQueue = false;

    // Health monitoring
    this.healthCheckTimer = null;
    this.systemHealth = {
      status: 'unknown',
      lastCheck: null,
      agentHealth: new Map()
    };
  }

  /**
   * Initialize the agent manager
   */
  async initialize() {
    try {
      // Start health monitoring
      this._startHealthMonitoring();

      // Auto-discover and load agents
      if (this.config.autoDiscover !== false) {
        await this.discoverAgents();
      }

      this.emit('manager:initialized');
      return { success: true };

    } catch (error) {
      this.emit('manager:error', { error, phase: 'initialization' });
      throw error;
    }
  }

  /**
   * Discover agents in configured directories
   */
  async discoverAgents() {
    const discoveries = [];

    for (const directory of this.config.agentDirectories) {
      try {
        const agentIds = await this._discoverAgentsInDirectory(directory);
        discoveries.push(...agentIds);
      } catch (error) {
        console.warn(`Failed to discover agents in ${directory}:`, error.message);
      }
    }

    return discoveries;
  }

  /**
   * Load all discovered agents
   */
  async loadDiscoveredAgents() {
    const results = [];
    let totalAgentsLoaded = 0;

    for (const [agentId, manifest] of this.manifests.entries()) {
      try {
        const result = await this.loadAgent(manifest);
        totalAgentsLoaded += result.agentCount;
        results.push({ agentId, success: true, agentCount: result.agentCount });
      } catch (error) {
        console.warn(`Failed to load agent ${agentId}:`, error.message);
        results.push({ agentId, success: false, error: error.message, agentCount: 0 });
      }
    }

    return { results, totalAgentsLoaded };
  }

  /**
   * Load an agent from a plugin path or manifest
   */
  async loadAgent(agentSpec, config = {}) {
    const agentId = typeof agentSpec === 'string' ? agentSpec : agentSpec.id;

    if (this.agents.has(agentId)) {
      throw new Error(`Agent ${agentId} is already loaded`);
    }

    // Add to loading queue
    return new Promise((resolve, reject) => {
      this.loadingQueue.push({
        agentSpec,
        config,
        resolve,
        reject
      });

      this._processLoadingQueue();
    });
  }

  /**
   * Unload an agent
   */
  async unloadAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { success: false, reason: `Agent ${agentId} not found` };
    }

    try {
      // Stop and destroy the agent
      await agent.destroy();

      // Clean up
      this.agents.delete(agentId);
      this.manifests.delete(agentId);
      this.systemHealth.agentHealth.delete(agentId);

      this.emit('agent:unloaded', { agentId });

      return { success: true };

    } catch (error) {
      this.emit('agent:error', { agentId, error, phase: 'unload' });
      throw error;
    }
  }

  /**
   * Reload an agent (unload then load)
   */
  async reloadAgent(agentId) {
    const manifest = this.manifests.get(agentId);
    if (!manifest) {
      throw new Error(`Cannot reload ${agentId}: manifest not found`);
    }

    const agent = this.agents.get(agentId);
    const config = agent ? agent.config : {};

    await this.unloadAgent(agentId);
    return await this.loadAgent(manifest, config);
  }

  /**
   * Start all loaded agents
   */
  async startAllAgents() {
    const results = [];

    for (const [agentId, agent] of this.agents.entries()) {
      try {
        await agent.start();
        results.push({ agentId, success: true });
      } catch (error) {
        results.push({ agentId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Stop all running agents
   */
  async stopAllAgents() {
    const results = [];

    for (const [agentId, agent] of this.agents.entries()) {
      try {
        await agent.stop();
        results.push({ agentId, success: true });
      } catch (error) {
        results.push({ agentId, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Get list of all agents
   */
  listAgents() {
    return Array.from(this.agents.entries()).map(([agentId, agent]) => ({
      id: agentId,
      state: agent.state,
      manifest: this.manifests.get(agentId),
      status: agent.getStatus(),
      metrics: agent.getMetrics()
    }));
  }

  /**
   * Get specific agent status
   */
  getAgentStatus(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return null;
    }

    return {
      id: agentId,
      manifest: this.manifests.get(agentId),
      status: agent.getStatus(),
      metrics: agent.getMetrics(),
      health: this.systemHealth.agentHealth.get(agentId)
    };
  }

  /**
   * Get system health status
   */
  getSystemHealth() {
    return {
      ...this.systemHealth,
      totalAgents: this.agents.size,
      runningAgents: Array.from(this.agents.values()).filter(a => a.state === 'running').length
    };
  }

  /**
   * Perform system health check
   */
  async performSystemHealthCheck() {
    const startTime = Date.now();
    const agentHealth = new Map();
    const issues = [];

    // Check each agent
    for (const [agentId, agent] of this.agents.entries()) {
      try {
        const health = await agent.performHealthCheck();
        agentHealth.set(agentId, health);

        if (health.status !== 'healthy') {
          issues.push({
            agentId,
            status: health.status,
            issues: health.issues
          });
        }
      } catch (error) {
        const errorHealth = {
          status: 'unhealthy',
          issues: [{ type: 'health-check-failed', message: error.message }]
        };
        agentHealth.set(agentId, errorHealth);
        issues.push({ agentId, status: 'unhealthy', error: error.message });
      }
    }

    // Determine overall system health
    const healthyAgents = Array.from(agentHealth.values()).filter(h => h.status === 'healthy').length;
    const totalAgents = agentHealth.size;

    let systemStatus = 'healthy';
    if (totalAgents === 0) {
      systemStatus = 'no-agents';
    } else if (healthyAgents === 0) {
      systemStatus = 'unhealthy';
    } else if (healthyAgents < totalAgents) {
      systemStatus = 'degraded';
    }

    this.systemHealth = {
      status: systemStatus,
      lastCheck: Date.now(),
      checkDuration: Date.now() - startTime,
      agentHealth,
      issues,
      summary: {
        totalAgents,
        healthyAgents,
        degradedAgents: Array.from(agentHealth.values()).filter(h => h.status === 'degraded').length,
        unhealthyAgents: Array.from(agentHealth.values()).filter(h => h.status === 'unhealthy').length
      }
    };

    this.emit('system:health-checked', this.systemHealth);
    return this.systemHealth;
  }

  /**
   * Shutdown the agent manager
   */
  async shutdown() {
    try {
      // Stop health monitoring
      this._stopHealthMonitoring();

      // Stop all agents
      await this.stopAllAgents();

      // Destroy all agents
      for (const agentId of this.agents.keys()) {
        await this.unloadAgent(agentId);
      }

      this.emit('manager:shutdown');
      return { success: true };

    } catch (error) {
      this.emit('manager:error', { error, phase: 'shutdown' });
      throw error;
    }
  }

  // ========== Private Methods ==========

  /**
   * Discover agents in a directory
   */
  async _discoverAgentsInDirectory(directory) {
    try {
      const resolvedDir = resolve(directory);
      const entries = await readdir(resolvedDir, { withFileTypes: true });

      const discoveries = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = join(resolvedDir, entry.name, 'manifest.json');

          try {
            const manifestContent = await readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);

            manifest.path = join(resolvedDir, entry.name);
            manifest.manifestPath = manifestPath;

            this.manifests.set(manifest.name, manifest);
            discoveries.push(manifest.name);

          } catch (error) {
            console.warn(`Invalid manifest in ${entry.name}:`, error.message);
          }
        }
      }

      return discoveries;

    } catch (error) {
      console.warn(`Cannot read directory ${directory}:`, error.message);
      return [];
    }
  }

  /**
   * Process the agent loading queue
   */
  async _processLoadingQueue() {
    if (this.isProcessingQueue || this.loadingQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      const concurrent = Math.min(this.config.maxConcurrentLoads, this.loadingQueue.length);
      const batch = this.loadingQueue.splice(0, concurrent);

      await Promise.all(
        batch.map(item => this._loadSingleAgent(item))
      );

      // Process next batch if queue has more items
      if (this.loadingQueue.length > 0) {
        setImmediate(() => this._processLoadingQueue());
      }

    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Load a single agent
   */
  async _loadSingleAgent({ agentSpec, config, resolve, reject }) {
    try {
      const result = await this._doLoadAgent(agentSpec, config);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }

  /**
   * Actually load an agent
   */
  async _doLoadAgent(agentSpec, config) {
    let manifest;
    let agentId;

    // Handle different agent spec formats
    if (typeof agentSpec === 'string') {
      // Agent ID - look up manifest
      manifest = this.manifests.get(agentSpec);
      if (!manifest) {
        throw new Error(`Agent manifest not found: ${agentSpec}`);
      }
      agentId = agentSpec;
    } else if (agentSpec.path) {
      // Direct path specification
      manifest = agentSpec;
      agentId = manifest.name;
    } else {
      throw new Error('Invalid agent specification');
    }

    // Load the agent module
    const modulePath = resolve(manifest.path, manifest.main || 'index.js');
    const moduleUrl = pathToFileURL(modulePath).href;

    // Dynamic import with cache busting for reloads
    const AgentClass = await import(`${moduleUrl}?t=${Date.now()}`);
    const AgentConstructor = AgentClass.default || AgentClass[manifest.name];

    if (!AgentConstructor) {
      throw new Error(`Agent class not found in ${modulePath}`);
    }

    // Merge configuration
    const agentConfig = {
      ...this.config.defaultAgentConfig,
      ...manifest.config?.default,
      ...config
    };

    // Create agent instance(s) - handle multi-LLM agents
    const agents = [];
    if (manifest.llm_models && manifest.llm_models.length > 0) {
      // Multi-LLM agent - create multiple instances for competitive agents
      for (const llmModelConfig of manifest.llm_models) {
        const llmModel = llmModelConfig.model || llmModelConfig; // Extract model name
        const instanceId = `${agentId}-${llmModel}`;

        const agentInstance = new AgentConstructor(instanceId, llmModel, agentConfig, this.dependencies);

        // Validate agent interface
        if (typeof agentInstance.initialize !== 'function') {
          throw new Error(`Agent ${instanceId} does not implement required interface`);
        }

        // Initialize the agent
        await agentInstance.initialize();

        // Store the agent instance
        this.agents.set(instanceId, agentInstance);
        agents.push(agentInstance);

        this.emit('agent:loaded', { agentId: instanceId, manifest });
      }
    } else {
      // Standard agent
      const agent = new AgentConstructor(agentId, agentConfig, this.dependencies);

      // Validate agent interface
      if (typeof agent.initialize !== 'function') {
        throw new Error(`Agent ${agentId} does not implement required interface`);
      }

      // Initialize the agent
      await agent.initialize();

      // Store the agent instance
      this.agents.set(agentId, agent);
      agents.push(agent);

      this.emit('agent:loaded', { agentId, manifest });
    }

    return {
      success: true,
      agentId,
      manifest,
      agentCount: agents.length
    };
  }

  /**
   * Start health monitoring
   */
  _startHealthMonitoring() {
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckTimer = setInterval(
        () => this.performSystemHealthCheck(),
        this.config.healthCheckInterval
      );

      // Perform initial health check
      setTimeout(() => this.performSystemHealthCheck(), 1000);
    }
  }

  /**
   * Stop health monitoring
   */
  _stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
}

export default AgentManager;