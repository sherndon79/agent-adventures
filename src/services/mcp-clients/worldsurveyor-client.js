import { HTTPMCPClient } from './http-mcp-client.js';
import { config } from '../../config/environment.js';

/**
 * WorldSurveyor MCP client for Isaac Sim spatial waypoint management
 * Handles waypoint creation, listing, and spatial navigation
 */
export class WorldSurveyorClient extends HTTPMCPClient {
  constructor(options = {}) {
    const serviceUrl = config.mcp.services.worldSurveyor;
    super('WorldSurveyor', serviceUrl, options);
  }

  // ========== WorldSurveyor-specific Methods ==========

  /**
   * Create a spatial waypoint
   */
  async createWaypoint(position, waypointType = 'point_of_interest', name = null, target = null, metadata = null) {
    const params = { position, waypoint_type: waypointType };
    if (name) params.name = name;
    if (target) params.target = target;
    if (metadata) params.metadata = metadata;

    return await this.executeCommand('worldsurveyor_create_waypoint', params);
  }

  /**
   * List all waypoints with optional filtering
   */
  async listWaypoints(waypointType = null) {
    const params = {};
    if (waypointType) params.waypoint_type = waypointType;

    return await this.executeCommand('worldsurveyor_list_waypoints', params);
  }

  /**
   * Clear all waypoints from the scene
   */
  async clearWaypoints(confirm = false) {
    return await this.executeCommand('worldsurveyor_clear_waypoints', { confirm });
  }
}

export default WorldSurveyorClient;