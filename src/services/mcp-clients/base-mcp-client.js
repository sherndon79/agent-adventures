/**
 * Base MCP client wrapper for Isaac Sim extensions
 * Provides common functionality for all MCP client implementations
 */
export class BaseMCPClient {
  constructor(serviceName, options = {}) {
    this.serviceName = serviceName;
    this.options = {
      timeout: options.timeout || 10000,
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000,
      enableLogging: options.enableLogging !== false,
      ...options
    };

    this.isConnected = false;
    this.lastError = null;
    this.metrics = {
      commandsExecuted: 0,
      commandsFailed: 0,
      averageResponseTime: 0,
      lastActivity: null
    };
  }

  /**
   * Execute MCP command with error handling and retries
   */
  async executeCommand(commandName, params = {}, options = {}) {
    const startTime = Date.now();
    const { retries = this.options.retries } = options;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (this.options.enableLogging) {
          console.log(`[${this.serviceName}] Executing: ${commandName}`, params);
        }

        const result = await this._executeCommand(commandName, params, options);

        // Update metrics
        const responseTime = Date.now() - startTime;
        this._updateMetrics(responseTime, true);

        return {
          success: true,
          result,
          responseTime,
          attempt: attempt + 1
        };

      } catch (error) {
        this.lastError = error;

        if (attempt < retries) {
          if (this.options.enableLogging) {
            console.warn(`[${this.serviceName}] Retry ${attempt + 1}/${retries} for ${commandName}:`, error.message);
          }
          await this._delay(this.options.retryDelay * (attempt + 1));
        } else {
          // All retries exhausted
          const responseTime = Date.now() - startTime;
          this._updateMetrics(responseTime, false);

          return {
            success: false,
            error: error.message,
            responseTime,
            attempts: retries + 1
          };
        }
      }
    }
  }

  /**
   * Check if client is healthy and responsive
   */
  async healthCheck() {
    // Derive standardized tool name: e.g., worldbuilder_health_check
    const serviceKey = String(this.serviceName || '').toLowerCase();
    const toolName = `${serviceKey}_health_check`;
    try {
      const result = await this.executeCommand(toolName, {});
      return {
        status: result.success ? 'healthy' : 'degraded',
        lastError: this.lastError,
        metrics: this.getMetrics()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        lastError: error.message,
        metrics: this.getMetrics()
      };
    }
  }

  /**
   * Get client metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      successRate: this.metrics.commandsExecuted > 0
        ? ((this.metrics.commandsExecuted - this.metrics.commandsFailed) / this.metrics.commandsExecuted) * 100
        : 100
    };
  }

  // ========== Abstract Methods (Override in subclasses) ==========

  /**
   * Actually execute the MCP command - implement in subclasses
   */
  async _executeCommand(commandName, params, options) {
    throw new Error(`_executeCommand not implemented for ${this.serviceName}`);
  }

  // ========== Private Helper Methods ==========

  /**
   * Update performance metrics
   */
  _updateMetrics(responseTime, success) {
    this.metrics.commandsExecuted++;
    this.metrics.lastActivity = Date.now();

    if (success) {
      // Update average response time
      const totalCommands = this.metrics.commandsExecuted;
      this.metrics.averageResponseTime =
        (this.metrics.averageResponseTime * (totalCommands - 1) + responseTime) / totalCommands;
    } else {
      this.metrics.commandsFailed++;
    }
  }

  /**
   * Delay utility for retries
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default BaseMCPClient;
