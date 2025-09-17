/**
 * Activity Log Module for Agent Adventures Dashboard
 * Handles real-time logging, filtering, and display of system events
 */

class ActivityLog {
  constructor(dashboard) {
    this.dashboard = dashboard;
    this.logEntries = [];
    this.maxLogEntries = 1000;
    this.currentFilter = 'all';
    this.autoScroll = true;

    this.bindEvents();
    this.initializeLog();

    console.log('✅ ActivityLog module initialized');
  }

  bindEvents() {
    const clearButton = document.getElementById('clear-log');
    if (clearButton) {
      clearButton.addEventListener('click', () => {
        this.clearLog();
      });
    }

    const levelSelect = document.getElementById('log-level');
    if (levelSelect) {
      levelSelect.addEventListener('change', (e) => {
        this.setFilter(e.target.value);
      });
    }

    const autoScrollCheckbox = document.getElementById('auto-scroll');
    if (autoScrollCheckbox) {
      autoScrollCheckbox.addEventListener('change', (e) => {
        this.autoScroll = e.target.checked;
      });
    }
  }

  initializeLog() {
    this.addEntry('system', 'INIT', 'Activity Log initialized');
  }

  addEntry(level, source, message) {
    const timestamp = new Date();
    const entry = {
      id: Date.now() + Math.random(),
      timestamp,
      level: level.toLowerCase(),
      source: source.toUpperCase(),
      message: message.trim()
    };

    // Add to entries array
    this.logEntries.push(entry);

    // Limit entries to prevent memory issues
    if (this.logEntries.length > this.maxLogEntries) {
      this.logEntries.shift();
    }

    // Update display
    this.updateLogDisplay();

    // Auto-scroll if enabled
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  }

  updateLogDisplay() {
    const logContainer = document.getElementById('activity-log');
    if (!logContainer) return;

    // Filter entries based on current filter
    const filteredEntries = this.getFilteredEntries();

    // Limit displayed entries for performance
    const maxDisplayEntries = 200;
    const displayEntries = filteredEntries.slice(-maxDisplayEntries);

    // Build HTML
    const logHTML = displayEntries.map(entry => this.createLogEntryHTML(entry)).join('');

    // Update container
    logContainer.innerHTML = logHTML;
  }

  createLogEntryHTML(entry) {
    const timeString = entry.timestamp.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const levelClass = this.getLevelClass(entry.level);
    const sourceClass = this.getSourceClass(entry.source);

    return `
      <div class="log-entry ${levelClass}" data-level="${entry.level}">
        <span class="log-time">${timeString}</span>
        <span class="log-source ${sourceClass}">${entry.source}</span>
        <span class="log-message">${this.escapeHtml(entry.message)}</span>
      </div>
    `;
  }

  getLevelClass(level) {
    switch (level) {
      case 'error': return 'error';
      case 'warning': return 'warning';
      case 'competition': return 'competition';
      case 'agent': return 'agent';
      case 'stream': return 'system';
      default: return 'system';
    }
  }

  getSourceClass(source) {
    // Additional CSS classes based on source
    switch (source) {
      case 'CLAUDE':
      case 'GEMINI':
      case 'GPT':
        return 'agent-source';
      case 'JUDGE':
        return 'judge-source';
      case 'STREAM':
      case 'PLAYER':
        return 'stream-source';
      default:
        return 'system-source';
    }
  }

  getFilteredEntries() {
    if (this.currentFilter === 'all') {
      return this.logEntries;
    }

    return this.logEntries.filter(entry => {
      switch (this.currentFilter) {
        case 'competitions':
          return entry.level === 'competition' || entry.source === 'JUDGE';

        case 'agents':
          return ['CLAUDE', 'GEMINI', 'GPT'].includes(entry.source) || entry.level === 'agent';

        case 'system':
          return ['SYSTEM', 'WEBSOCKET', 'HEALTH', 'METRICS', 'COMMAND', 'INIT'].includes(entry.source);

        case 'errors':
          return entry.level === 'error';

        default:
          return true;
      }
    });
  }

  setFilter(filter) {
    this.currentFilter = filter;
    this.updateLogDisplay();

    // Log the filter change
    this.addEntry('system', 'LOG', `Filter changed to: ${filter}`);
  }

  clearLog() {
    this.logEntries = [];
    this.updateLogDisplay();

    // Add a clear entry
    this.addEntry('system', 'LOG', 'Activity log cleared');
  }

  scrollToBottom() {
    const logContainer = document.getElementById('activity-log');
    if (logContainer) {
      setTimeout(() => {
        logContainer.scrollTop = logContainer.scrollHeight;
      }, 10);
    }
  }

  // Utility methods
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  formatLogLevel(level) {
    switch (level) {
      case 'error': return 'ERROR';
      case 'warning': return 'WARN';
      case 'competition': return 'COMP';
      case 'agent': return 'AGENT';
      case 'stream': return 'STREAM';
      default: return 'INFO';
    }
  }

  // Enhanced logging methods for different types
  logAgentActivity(agent, action, details) {
    this.addEntry('agent', agent.toUpperCase(), `${action}: ${details}`);
  }

  logCompetitionEvent(event, details) {
    this.addEntry('competition', 'COMP', `${event}: ${details}`);
  }

  logSystemEvent(component, event, details = '') {
    this.addEntry('system', component.toUpperCase(), details ? `${event}: ${details}` : event);
  }

  logError(component, error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    this.addEntry('error', component.toUpperCase(), errorMessage);
  }

  logWarning(component, message) {
    this.addEntry('warning', component.toUpperCase(), message);
  }

  // Bulk operations
  addMultipleEntries(entries) {
    entries.forEach(entry => {
      this.addEntry(entry.level, entry.source, entry.message);
    });
  }

  // Search functionality
  searchLogs(query) {
    const normalizedQuery = query.toLowerCase();
    return this.logEntries.filter(entry =>
      entry.message.toLowerCase().includes(normalizedQuery) ||
      entry.source.toLowerCase().includes(normalizedQuery)
    );
  }

  // Export functionality
  exportLogs(format = 'json') {
    switch (format) {
      case 'json':
        return JSON.stringify(this.logEntries, null, 2);

      case 'csv':
        const csvHeader = 'Timestamp,Level,Source,Message\n';
        const csvRows = this.logEntries.map(entry =>
          `${entry.timestamp.toISOString()},${entry.level},${entry.source},"${entry.message.replace(/"/g, '""')}"`
        ).join('\n');
        return csvHeader + csvRows;

      case 'txt':
        return this.logEntries.map(entry =>
          `[${entry.timestamp.toISOString()}] ${entry.level.toUpperCase()} ${entry.source}: ${entry.message}`
        ).join('\n');

      default:
        return this.exportLogs('json');
    }
  }

  // Statistics
  getLogStatistics() {
    const stats = {
      total: this.logEntries.length,
      byLevel: {},
      bySource: {},
      timeRange: null
    };

    if (this.logEntries.length > 0) {
      stats.timeRange = {
        start: this.logEntries[0].timestamp,
        end: this.logEntries[this.logEntries.length - 1].timestamp
      };

      this.logEntries.forEach(entry => {
        // Count by level
        stats.byLevel[entry.level] = (stats.byLevel[entry.level] || 0) + 1;

        // Count by source
        stats.bySource[entry.source] = (stats.bySource[entry.source] || 0) + 1;
      });
    }

    return stats;
  }

  // Public API methods
  getRecentEntries(count = 50) {
    return this.logEntries.slice(-count);
  }

  getEntriesByLevel(level) {
    return this.logEntries.filter(entry => entry.level === level);
  }

  getEntriesBySource(source) {
    return this.logEntries.filter(entry => entry.source === source.toUpperCase());
  }

  destroy() {
    this.clearLog();
    console.log('🔄 ActivityLog destroyed');
  }
}

// Export for dashboard-core.js
window.ActivityLog = ActivityLog;