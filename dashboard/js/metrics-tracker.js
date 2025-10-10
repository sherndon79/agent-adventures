/**
 * Metrics Tracker Module for Agent Adventures Dashboard
 * Handles token usage, cost calculation, and performance metrics
 */

class MetricsTracker {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.tokenChart = null;
    this.metricsHistory = [];
    this.maxHistoryPoints = 50;

    this.initializeChart();
    this.bindEvents();
    console.log('✅ MetricsTracker module initialized');
  }

  bindEvents() {
    const resetButton = document.getElementById('reset-metrics');
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        this.resetMetrics();
      });
    }


  }

  initializeChart() {
    const canvas = document.getElementById('token-usage-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    this.tokenChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Token Usage',
          data: [],
          borderColor: 'rgba(37, 99, 235, 1)',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          }
        },
        scales: {
          x: {
            display: false,
            grid: {
              display: false
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(75, 85, 99, 0.3)'
            },
            ticks: {
              color: 'rgba(203, 213, 225, 0.8)',
              font: {
                size: 11
              }
            }
          }
        },
        elements: {
          point: {
            radius: 0,
            hoverRadius: 4
          }
        }
      }
    });
  }

  updateMetrics(metrics) {
    // Update metric displays
    this.updateMetricDisplay('total-tokens', this.formatNumber(metrics.totalTokens || 0));
    this.updateMetricDisplay('estimated-cost', this.formatCurrency(metrics.totalCost || 0));
    this.updateMetricDisplay('total-competitions', metrics.competitions || 0);
    this.updateMetricDisplay('avg-response-time', `${metrics.avgResponseTime || 0}ms`);

    // Add to history for chart
    this.addToHistory(metrics);

    // Update chart
    this.updateChart();

    // Update change indicators
    this.updateChangeIndicators(metrics);
  }

  updateMetricDisplay(elementId, value) {
    const element = document.getElementById(elementId);
    if (element) {
      element.textContent = value;
    }
  }

  addToHistory(metrics) {
    const now = new Date();
    const historyPoint = {
      timestamp: now,
      tokens: metrics.totalTokens || 0,
      cost: metrics.totalCost || 0,
      competitions: metrics.competitions || 0,
      responseTime: metrics.avgResponseTime || 0
    };

    this.metricsHistory.push(historyPoint);

    // Keep only recent history
    if (this.metricsHistory.length > this.maxHistoryPoints) {
      this.metricsHistory.shift();
    }
  }

  updateChart() {
    if (!this.tokenChart || this.metricsHistory.length === 0) return;

    const labels = this.metricsHistory.map(point =>
      point.timestamp.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      })
    );

    const tokenData = this.metricsHistory.map(point => point.tokens);

    this.tokenChart.data.labels = labels;
    this.tokenChart.data.datasets[0].data = tokenData;
    this.tokenChart.update('none');
  }

  updateChangeIndicators(metrics) {
    if (this.metricsHistory.length < 2) return;

    const previous = this.metricsHistory[this.metricsHistory.length - 2];
    const current = this.metricsHistory[this.metricsHistory.length - 1];

    // Token change
    const tokenChange = current.tokens - previous.tokens;
    this.updateChangeIndicator('total-tokens', tokenChange, 'tokens');

    // Cost change
    const costChange = current.cost - previous.cost;
    this.updateChangeIndicator('estimated-cost', costChange, 'currency');

    // Competition change
    const competitionChange = current.competitions - previous.competitions;
    this.updateChangeIndicator('total-competitions', competitionChange, 'number');

    // Response time change
    const responseTimeChange = current.responseTime - previous.responseTime;
    this.updateChangeIndicator('avg-response-time', responseTimeChange, 'time', true);
  }

  updateChangeIndicator(metricId, change, type, isInverse = false) {
    const metricCard = document.querySelector(`#${metricId}`).closest('.metric-card');
    const changeElement = metricCard?.querySelector('.metric-change');

    if (!changeElement) return;

    let changeText = '';
    let changeClass = '';

    if (change === 0) {
      changeText = 'No change';
      changeClass = 'text-muted';
    } else {
      const sign = change > 0 ? '+' : '';
      const absChange = Math.abs(change);

      switch (type) {
        case 'tokens':
          changeText = `${sign}${this.formatNumber(absChange)} today`;
          break;
        case 'currency':
          changeText = `${sign}${this.formatCurrency(absChange)} today`;
          break;
        case 'number':
          changeText = `${sign}${absChange} today`;
          break;
        case 'time':
          changeText = `${sign}${absChange}ms vs last`;
          break;
      }

      // Color coding (inverse for response time - lower is better)
      if (isInverse) {
        changeClass = change < 0 ? 'text-success' : 'text-error';
      } else {
        changeClass = change > 0 ? 'text-success' : 'text-muted';
      }
    }

    changeElement.textContent = changeText;
    changeElement.className = `metric-change ${changeClass}`;
  }

  resetMetrics() {
    // Clear history
    this.metricsHistory = [];

    // Reset chart
    if (this.tokenChart) {
      this.tokenChart.data.labels = [];
      this.tokenChart.data.datasets[0].data = [];
      this.tokenChart.update();
    }

    // Reset displays
    this.updateMetricDisplay('total-tokens', '0');
    this.updateMetricDisplay('estimated-cost', '$0.00');
    this.updateMetricDisplay('total-competitions', '0');
    this.updateMetricDisplay('avg-response-time', '0ms');

    // Reset change indicators
    const changeElements = document.querySelectorAll('.metric-change');
    changeElements.forEach(element => {
      element.textContent = '+0 today';
      element.className = 'metric-change text-muted';
    });

    this.dashboard.logActivity('system', 'METRICS', 'Metrics reset successfully');
  }



  formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  formatCurrency(amount) {
    return '$' + amount.toFixed(2);
  }

  // Public API methods
  getMetricsHistory() {
    return [...this.metricsHistory];
  }

  exportMetrics() {
    const exportData = {
      history: this.metricsHistory,
      exportTime: new Date().toISOString(),
      totalPoints: this.metricsHistory.length
    };

    return JSON.stringify(exportData, null, 2);
  }

  destroy() {
    if (this.tokenChart) {
      this.tokenChart.destroy();
    }
    console.log('🔄 MetricsTracker destroyed');
  }
}

// Export for dashboard-core.js
window.MetricsTracker = MetricsTracker;