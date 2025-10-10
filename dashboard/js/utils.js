/**
 * Shared utility functions for the Agent Adventures Dashboard
 */

const Utils = {
  /**
   * Escapes HTML special characters in a string to prevent XSS.
   * @param {string} text The string to escape.
   * @returns {string} The escaped string.
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// Export for use in other modules
window.Utils = Utils;
