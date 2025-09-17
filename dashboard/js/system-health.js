/**
 * System Health Module for Agent Adventures Dashboard
 * Monitors system performance, service status, and overall health
 */

class SystemHealth {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.healthStatus = 'unknown';
    this.services = {
      isaacSim: 'unknown',
      eventBus: 'healthy',
      agents: 'inactive',
      streaming: 'inactive'
    };

    this.performanceMetrics = {
      cpu: 0,
      memory: 0,
      eventQueue: 0
    };

    this.updateInterval = null;
    this.bindEvents();
    this.startHealthMonitoring();

    console.log('✅ SystemHealth module initialized');
  }

  bindEvents() {
    // Health monitoring is automatic, no user controls needed
  }

  startHealthMonitoring() {
    // Simulate periodic health checks
    this.updateInterval = setInterval(() => {
      this.simulateHealthCheck();
    }, 5000);
  }

  updateHealth(data) {
    // Update performance metrics
    if (data.cpu !== undefined) this.performanceMetrics.cpu = data.cpu;
    if (data.memory !== undefined) this.performanceMetrics.memory = data.memory;
    if (data.eventQueue !== undefined) this.performanceMetrics.eventQueue = data.eventQueue;

    // Update service statuses
    if (data.services) {
      Object.keys(data.services).forEach(service => {
        if (this.services[service] !== undefined) {
          this.services[service] = data.services[service];
        }
      });
    }

    // Update UI
    this.updatePerformanceDisplays();
    this.updateServiceStatuses();
    this.updateOverallHealth();
  }

  simulateHealthCheck() {
    // Generate realistic system metrics
    const cpuUsage = Math.min(100, Math.max(0, this.performanceMetrics.cpu + (Math.random() - 0.5) * 10));
    const memoryUsage = Math.min(512, Math.max(0, this.performanceMetrics.memory + (Math.random() - 0.5) * 20));
    const eventQueue = Math.max(0, Math.floor(this.performanceMetrics.eventQueue + (Math.random() - 0.7) * 3));

    this.updateHealth({
      cpu: cpuUsage,
      memory: memoryUsage,
      eventQueue: eventQueue,
      services: {
        eventBus: 'healthy',
        agents: this.getAgentServiceStatus(),
        streaming: this.dashboard.modules.streamViewer?.getStreamStatus()?.active ? 'healthy' : 'inactive'
      }
    });
  }

  getAgentServiceStatus() {
    const systemData = this.dashboard.getSystemData();
    const activeAgents = Object.values(systemData.agents).filter(agent => agent.status === 'active').length;

    if (activeAgents === 0) return 'inactive';
    if (activeAgents < 3) return 'warning';
    return 'healthy';
  }

  updatePerformanceDisplays() {
    // CPU Usage
    this.updatePerformanceBar('cpu-usage', 'cpu-value', this.performanceMetrics.cpu, '%', 100);

    // Memory Usage
    this.updatePerformanceBar('memory-usage', 'memory-value', this.performanceMetrics.memory, ' MB', 512);

    // Event Queue
    this.updatePerformanceBar('queue-usage', 'queue-value', this.performanceMetrics.eventQueue, '', 50);
  }

  updatePerformanceBar(barId, valueId, value, unit, maxValue) {
    const barElement = document.getElementById(barId);
    const valueElement = document.getElementById(valueId);

    if (barElement) {
      const percentage = (value / maxValue) * 100;
      barElement.style.width = `${Math.min(100, percentage)}%`;

      // Color coding based on usage
      let colorClass = '';
      if (percentage > 80) {
        colorClass = 'error';
        barElement.style.background = 'var(--error-red)';
      } else if (percentage > 60) {
        colorClass = 'warning';
        barElement.style.background = 'var(--warning-yellow)';
      } else {
        colorClass = 'success';
        barElement.style.background = 'var(--primary-blue)';
      }
    }

    if (valueElement) {
      const displayValue = unit === ' MB' ? Math.round(value) : Math.round(value * 10) / 10;
      valueElement.textContent = `${displayValue}${unit}`;
    }
  }

  updateServiceStatuses() {
    // Isaac Sim Status
    this.updateServiceStatus('isaac-sim-status', {
      status: this.services.isaacSim,
      detail: this.getServiceDetail('isaacSim')
    });

    // Event Bus Status
    this.updateServiceStatus('event-bus-status', {
      status: this.services.eventBus,
      detail: this.getServiceDetail('eventBus')
    });

    // Agents Status
    this.updateServiceStatus('agents-status', {
      status: this.services.agents,
      detail: this.getServiceDetail('agents')
    });

    // Streaming Status
    this.updateServiceStatus('streaming-status', {
      status: this.services.streaming,
      detail: this.getServiceDetail('streaming')
    });
  }

  updateServiceStatus(elementId, serviceData) {
    const serviceElement = document.getElementById(elementId);
    if (!serviceElement) return;

    const indicatorElement = serviceElement.querySelector('.service-indicator');
    const detailElement = serviceElement.querySelector('.service-detail');

    if (indicatorElement) {
      indicatorElement.className = `service-indicator ${serviceData.status}`;
    }

    if (detailElement) {
      detailElement.textContent = serviceData.detail;
    }
  }

  getServiceDetail(serviceName) {
    switch (serviceName) {
      case 'isaacSim':
        switch (this.services.isaacSim) {
          case 'healthy': return 'Connected via MCP';
          case 'mock': return 'Mock Mode';
          case 'inactive': return 'Not connected';
          default: return 'Not connected (Mock Mode)';
        }

      case 'eventBus':
        return this.services.eventBus === 'healthy' ? 'Active' : 'Error';

      case 'agents':
        const systemData = this.dashboard.getSystemData();
        const activeCount = Object.values(systemData.agents).filter(agent => agent.status === 'active').length;
        return `${activeCount}/3 running`;

      case 'streaming':
        return this.services.streaming === 'healthy' ? 'Streaming active' : 'Not streaming';

      default:
        return 'Unknown';
    }
  }

  updateOverallHealth() {
    const healthIndicator = document.getElementById('overall-health');
    if (!healthIndicator) return;

    // Calculate overall health based on services and performance
    let healthScore = 0;
    let totalServices = 0;

    // Service health scores
    Object.values(this.services).forEach(status => {
      totalServices++;
      switch (status) {
        case 'healthy': healthScore += 1; break;
        case 'warning': healthScore += 0.5; break;
        case 'inactive': healthScore += 0.3; break;
        case 'error': healthScore += 0; break;
        default: healthScore += 0.1; break;
      }
    });

    // Performance impact
    const cpuImpact = this.performanceMetrics.cpu > 80 ? -0.2 : 0;
    const memoryImpact = this.performanceMetrics.memory > 400 ? -0.1 : 0;

    const overallScore = (healthScore / totalServices) + cpuImpact + memoryImpact;

    let healthStatus, healthText, healthClass;

    if (overallScore >= 0.8) {
      healthStatus = 'healthy';
      healthText = 'All Systems Healthy';
      healthClass = 'healthy';
    } else if (overallScore >= 0.5) {
      healthStatus = 'warning';
      healthText = 'Some Issues Detected';
      healthClass = 'warning';
    } else {
      healthStatus = 'error';
      healthText = 'System Issues';
      healthClass = 'error';
    }

    this.healthStatus = healthStatus;

    // Update health indicator
    const statusElement = healthIndicator.querySelector('.health-status');
    const textElement = healthIndicator.querySelector('span');

    if (statusElement) {
      statusElement.className = `health-status ${healthClass}`;
    }

    if (textElement) {
      textElement.textContent = healthText;
    }
  }

  // Service-specific methods
  setServiceStatus(serviceName, status) {
    if (this.services[serviceName] !== undefined) {
      this.services[serviceName] = status;
      this.updateServiceStatuses();
      this.updateOverallHealth();

      this.dashboard.logActivity('system', 'HEALTH',
        `Service ${serviceName} status: ${status}`);
    }
  }

  // Alert system
  checkForAlerts() {
    const alerts = [];

    // Performance alerts
    if (this.performanceMetrics.cpu > 90) {
      alerts.push({ type: 'error', message: 'CPU usage critical (>90%)' });
    } else if (this.performanceMetrics.cpu > 80) {
      alerts.push({ type: 'warning', message: 'CPU usage high (>80%)' });
    }

    if (this.performanceMetrics.memory > 450) {
      alerts.push({ type: 'warning', message: 'Memory usage high (>450MB)' });
    }

    if (this.performanceMetrics.eventQueue > 40) {
      alerts.push({ type: 'warning', message: 'Event queue backing up' });
    }

    // Service alerts
    Object.keys(this.services).forEach(service => {
      if (this.services[service] === 'error') {
        alerts.push({ type: 'error', message: `Service ${service} is down` });
      }
    });

    return alerts;
  }

  // Public API methods
  getHealthSummary() {
    return {
      overall: this.healthStatus,
      services: { ...this.services },
      performance: { ...this.performanceMetrics },
      alerts: this.checkForAlerts()
    };
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
    console.log('🔄 SystemHealth destroyed');
  }
}

// Export for dashboard-core.js
window.SystemHealth = SystemHealth;