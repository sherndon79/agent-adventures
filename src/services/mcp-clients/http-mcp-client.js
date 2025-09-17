/**
 * HTTP-based MCP client implementation
 * Implements the MCP Streamable HTTP protocol to connect to validated MCP servers
 */

import { BaseMCPClient } from './base-mcp-client.js';

export class HTTPMCPClient extends BaseMCPClient {
  constructor(serviceName, serviceUrl, options = {}) {
    super(serviceName, options);
    this.serviceUrl = serviceUrl;
    this.sessionId = null;
    this.httpClient = null;
  }

  /**
   * Initialize the HTTP MCP connection
   */
  async initialize() {
    if (this.isConnected) return;

    try {
      // Import fetch dynamically for Node.js compatibility
      if (!globalThis.fetch) {
        const { default: fetch } = await import('node-fetch');
        globalThis.fetch = fetch;
      }

      // Step 1: Initialize connection
      const sessionId = await this._initialize();
      this.sessionId = sessionId;

      // Step 2: Send initialized notification
      await this._notifyInitialized();

      this.isConnected = true;

      if (this.options.enableLogging) {
        console.log(`[${this.serviceName}] Connected to HTTP MCP server at ${this.serviceUrl}`);
        if (sessionId) {
          console.log(`[${this.serviceName}] Session ID: ${sessionId}`);
        }
      }

    } catch (error) {
      console.error(`[${this.serviceName}] Failed to initialize HTTP MCP connection:`, error.message);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Execute MCP command implementation
   */
  async _executeCommand(commandName, params = {}, options = {}) {
    // Ensure we're connected
    if (!this.isConnected) {
      await this.initialize();
    }

    try {
      const success = await this._toolsCall(commandName, params);
      return success;
    } catch (error) {
      console.error(`[${this.serviceName}] Command ${commandName} failed:`, error.message);
      throw error;
    }
  }

  // ========== Private HTTP MCP Protocol Methods ==========

  /**
   * MCP Initialize step
   */
  async _initialize() {
    const payload = {
      "jsonrpc": "2.0",
      "id": 1,
      "method": "initialize",
      "params": {
        "protocolVersion": "2025-06-18",
        "capabilities": {"sampling": null, "elicitation": null, "experimental": null, "roots": null},
        "clientInfo": {"name": "agent-adventures", "version": "0.1.0"},
      },
    };

    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream"
    };

    const response = await fetch(this.serviceUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.options.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Extract session ID from headers
    const sessionId = response.headers.get("mcp-session-id") || "";

    // Read the initialization response (may be streaming)
    const text = await response.text();
    if (text) {
      try {
        JSON.parse(text); // Validate response is valid JSON
      } catch (e) {
        if (this.options.enableLogging) {
          console.log(`[${this.serviceName}] Received non-JSON response during init:`, text.substring(0, 100));
        }
      }
    }

    return sessionId;
  }

  /**
   * MCP Initialized notification step
   */
  async _notifyInitialized() {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    };

    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const payload = {"jsonrpc": "2.0", "method": "notifications/initialized", "params": {}};

    const response = await fetch(this.serviceUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.options.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  /**
   * MCP Tools/Call step
   */
  async _toolsCall(toolName, args = {}) {
    const headers = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
    };

    if (this.sessionId) {
      headers["mcp-session-id"] = this.sessionId;
    }

    const payload = {
      "jsonrpc": "2.0",
      "id": 2,
      "method": "tools/call",
      "params": {"name": toolName, "arguments": args}
    };

    const response = await fetch(this.serviceUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(this.options.timeout)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    try {
      // Handle Server-Sent Events (SSE) format
      if (text.startsWith('event: message') || text.includes('event: message')) {
        if (this.options.enableLogging) {
          console.log(`[${this.serviceName}] Detected SSE format, parsing...`);
        }

        // Parse SSE format properly
        const jsonData = this._parseSSE(text);
        if (jsonData) {
          if (this.options.enableLogging) {
            console.log(`[${this.serviceName}] SSE parsing successful`);
          }

          const result = jsonData.result || {};
          const isError = !!jsonData.error || !!result.isError;

          if (isError) {
            throw new Error(jsonData.error?.message || result.error || 'MCP tool call failed');
          }

          return result;
        } else {
          if (this.options.enableLogging) {
            console.log(`[${this.serviceName}] SSE parsing returned null, falling back to JSON`);
          }
        }
      }

      // Handle regular JSON format
      if (this.options.enableLogging) {
        console.log(`[${this.serviceName}] Parsing as regular JSON`);
      }

      const data = JSON.parse(text);
      const result = data.result || {};
      const isError = !!data.error || !!result.isError;

      if (isError) {
        throw new Error(data.error?.message || result.error || 'MCP tool call failed');
      }

      return result;
    } catch (parseError) {
      if (this.options.enableLogging) {
        console.log(`[${this.serviceName}] Raw response:`, text.substring(0, 200));
        console.log(`[${this.serviceName}] Parse error:`, parseError.message);
      }
      throw new Error(`Failed to parse MCP response: ${parseError.message}`);
    }
  }

  /**
   * Parse Server-Sent Events (SSE) format
   */
  _parseSSE(text) {
    try {
      // Split into lines and process SSE format
      const lines = text.split('\n');
      let currentEvent = null;
      let dataLines = [];

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.substring(7).trim();
        } else if (line.startsWith('data: ')) {
          const dataContent = line.substring(6);
          dataLines.push(dataContent);
        } else if (line.trim() === '' && dataLines.length > 0) {
          // End of an SSE message - parse the accumulated data
          if (currentEvent === 'message') {
            const jsonString = dataLines.join('\n');
            try {
              return JSON.parse(jsonString);
            } catch (jsonError) {
              if (this.options.enableLogging) {
                console.log(`[${this.serviceName}] Failed to parse SSE JSON:`, jsonString.substring(0, 100));
              }
              return null;
            }
          }
          // Reset for next message
          currentEvent = null;
          dataLines = [];
        }
      }

      // Handle case where there's no trailing empty line
      if (currentEvent === 'message' && dataLines.length > 0) {
        const jsonString = dataLines.join('\n');
        try {
          return JSON.parse(jsonString);
        } catch (jsonError) {
          if (this.options.enableLogging) {
            console.log(`[${this.serviceName}] Failed to parse SSE JSON:`, jsonString.substring(0, 100));
          }
          return null;
        }
      }

      return null;
    } catch (error) {
      if (this.options.enableLogging) {
        console.log(`[${this.serviceName}] SSE parsing error:`, error.message);
      }
      return null;
    }
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    this.isConnected = false;
    this.sessionId = null;
    this.httpClient = null;
  }
}

export default HTTPMCPClient;