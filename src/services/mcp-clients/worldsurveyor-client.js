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

  // ========== Group Management Methods ==========

  /**
   * Create a new waypoint group
   */
  async createGroup(name, description = '', color = '#4A90E2', parentGroupId = null) {
    const params = { name, description, color };
    if (parentGroupId) params.parent_group_id = parentGroupId;

    return await this.executeCommand('worldsurveyor_create_group', params);
  }

  /**
   * List waypoint groups
   */
  async listGroups(parentGroupId = null) {
    const params = {};
    if (parentGroupId) params.parent_group_id = parentGroupId;

    return await this.executeCommand('worldsurveyor_list_groups', params);
  }

  /**
   * Get all waypoints in a group
   */
  async getGroupWaypoints(groupId, includeNested = false) {
    return await this.executeCommand('worldsurveyor_get_group_waypoints', {
      group_id: groupId,
      include_nested: includeNested
    });
  }

  /**
   * Add waypoint to groups
   */
  async addWaypointToGroups(waypointId, groupIds) {
    return await this.executeCommand('worldsurveyor_add_waypoint_to_groups', {
      waypoint_id: waypointId,
      group_ids: groupIds
    });
  }

  /**
   * Remove a waypoint group
   */
  async removeGroup(groupId, cascade = false) {
    return await this.executeCommand('worldsurveyor_remove_group', {
      group_id: groupId,
      cascade
    });
  }

  // ========== Extended Waypoint Management ==========

  /**
   * Get debug status information
   */
  async getDebugStatus() {
    return await this.executeCommand('worldsurveyor_debug_status');
  }

  /**
   * Export waypoints to file
   */
  async exportWaypoints(format = 'json', outputPath = null, includeGroups = true) {
    const params = { format, include_groups: includeGroups };
    if (outputPath) params.output_path = outputPath;

    return await this.executeCommand('worldsurveyor_export_waypoints', params);
  }

  /**
   * Get specific group details
   */
  async getGroup(groupId) {
    return await this.executeCommand('worldsurveyor_get_group', {
      group_id: groupId
    });
  }

  /**
   * Get group hierarchy information
   */
  async getGroupHierarchy(rootGroupId = null, maxDepth = null) {
    const params = {};
    if (rootGroupId) params.root_group_id = rootGroupId;
    if (maxDepth !== null) params.max_depth = maxDepth;

    return await this.executeCommand('worldsurveyor_get_group_hierarchy', params);
  }

  /**
   * Get groups that a waypoint belongs to
   */
  async getWaypointGroups(waypointId) {
    return await this.executeCommand('worldsurveyor_get_waypoint_groups', {
      waypoint_id: waypointId
    });
  }

  /**
   * Navigate camera to a waypoint
   */
  async gotoWaypoint(waypointId, animationDuration = 2.0, lookAtTarget = true) {
    return await this.executeCommand('worldsurveyor_goto_waypoint', {
      waypoint_id: waypointId,
      animation_duration: animationDuration,
      look_at_target: lookAtTarget
    });
  }

  /**
   * Import waypoints from file
   */
  async importWaypoints(filePath, format = 'auto', mergeGroups = true, overwriteExisting = false) {
    return await this.executeCommand('worldsurveyor_import_waypoints', {
      file_path: filePath,
      format,
      merge_groups: mergeGroups,
      overwrite_existing: overwriteExisting
    });
  }

  /**
   * Remove an individual waypoint
   */
  async removeWaypoint(waypointId) {
    return await this.executeCommand('worldsurveyor_remove_waypoint', {
      waypoint_id: waypointId
    });
  }

  /**
   * Remove waypoint from specific groups
   */
  async removeWaypointFromGroups(waypointId, groupIds) {
    return await this.executeCommand('worldsurveyor_remove_waypoint_from_groups', {
      waypoint_id: waypointId,
      group_ids: groupIds
    });
  }

  /**
   * Control visibility of an individual waypoint marker
   */
  async setIndividualMarkerVisible(waypointId, visible) {
    return await this.executeCommand('worldsurveyor_set_individual_marker_visible', {
      waypoint_id: waypointId,
      visible
    });
  }

  /**
   * Control visibility of all waypoint markers
   */
  async setMarkersVisible(visible) {
    return await this.executeCommand('worldsurveyor_set_markers_visible', {
      visible
    });
  }

  /**
   * Control visibility of specific waypoint markers
   */
  async setSelectiveMarkersVisible(waypointIds, visible) {
    return await this.executeCommand('worldsurveyor_set_selective_markers_visible', {
      waypoint_ids: waypointIds,
      visible
    });
  }

  /**
   * Update waypoint properties
   */
  async updateWaypoint(waypointId, options = {}) {
    const params = { waypoint_id: waypointId };

    if (options.position !== undefined) params.position = options.position;
    if (options.target !== undefined) params.target = options.target;
    if (options.name !== undefined) params.name = options.name;
    if (options.waypointType !== undefined) params.waypoint_type = options.waypointType;
    if (options.metadata !== undefined) params.metadata = options.metadata;

    return await this.executeCommand('worldsurveyor_update_waypoint', params);
  }
}

export default WorldSurveyorClient;