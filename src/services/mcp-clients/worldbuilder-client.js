import { HTTPMCPClient } from './http-mcp-client.js';
import { config } from '../../config/environment.js';

/**
 * WorldBuilder MCP client for Isaac Sim scene construction
 * Handles 3D asset placement, spatial queries, and scene management
 */
export class WorldBuilderClient extends HTTPMCPClient {
  constructor(options = {}) {
    const serviceUrl = config.mcp.services.worldBuilder;
    super('WorldBuilder', serviceUrl, options);
  }

  // ========== WorldBuilder-specific Methods ==========

  /**
   * Add a primitive element to the scene
   */
  async addElement(elementType, name, position, color = [0.5, 0.5, 0.5], scale = [1, 1, 1], parentPath = '/World') {
    return await this.executeCommand('worldbuilder_add_element', {
      element_type: elementType,
      name,
      position,
      color,
      scale,
      parent_path: parentPath
    });
  }

  /**
   * Create a batch of objects
   */
  async createBatch(batchName, elements, parentPath = '/World') {
    return await this.executeCommand('worldbuilder_create_batch', {
      batch_name: batchName,
      elements,
      parent_path: parentPath
    });
  }

  /**
   * Remove element from scene
   */
  async removeElement(usdPath) {
    return await this.executeCommand('worldbuilder_remove_element', {
      usd_path: usdPath
    });
  }

  /**
   * Clear scene or specific paths
   */
  async clearScene(path = '/World', confirm = false) {
    return await this.executeCommand('worldbuilder_clear_scene', {
      path,
      confirm
    });
  }

  /**
   * Get complete scene structure
   */
  async getScene(includeMetadata = true) {
    return await this.executeCommand('worldbuilder_get_scene', {
      include_metadata: includeMetadata
    });
  }

  /**
   * Get scene health status
   */
  async getSceneStatus() {
    return await this.executeCommand('worldbuilder_scene_status');
  }

  /**
   * List all scene elements
   */
  async listElements(filterType = '') {
    return await this.executeCommand('worldbuilder_list_elements', {
      filter_type: filterType
    });
  }

  /**
   * Place USD asset in scene
   */
  async placeAsset(name, assetPath, position = [0, 0, 0], rotation = [0, 0, 0], scale = [1, 1, 1], primPath = '') {
    return await this.executeCommand('worldbuilder_place_asset', {
      name,
      asset_path: assetPath,
      position,
      rotation,
      scale,
      prim_path: primPath
    });
  }

  /**
   * Transform existing asset
   */
  async transformAsset(primPath, position = null, rotation = null, scale = null) {
    const params = { prim_path: primPath };
    if (position) params.position = position;
    if (rotation) params.rotation = rotation;
    if (scale) params.scale = scale;

    return await this.executeCommand('worldbuilder_transform_asset', params);
  }

  /**
   * Query objects by type
   */
  async queryObjectsByType(objectType) {
    return await this.executeCommand('worldbuilder_query_objects_by_type', {
      object_type: objectType
    });
  }

  /**
   * Query objects within spatial bounds
   */
  async queryObjectsInBounds(minBounds, maxBounds) {
    return await this.executeCommand('worldbuilder_query_objects_in_bounds', {
      min_bounds: minBounds,
      max_bounds: maxBounds
    });
  }

  /**
   * Query objects near a point
   */
  async queryObjectsNearPoint(point, radius = 5) {
    return await this.executeCommand('worldbuilder_query_objects_near_point', {
      point,
      radius
    });
  }

  /**
   * Calculate combined bounding box
   */
  async calculateBounds(objects) {
    return await this.executeCommand('worldbuilder_calculate_bounds', {
      objects
    });
  }

  /**
   * Find ground level at position
   */
  async findGroundLevel(position, searchRadius = 10) {
    return await this.executeCommand('worldbuilder_find_ground_level', {
      position,
      search_radius: searchRadius
    });
  }

  /**
   * Align objects along specified axis
   */
  async alignObjects(objects, axis, alignment = 'center', spacing = null) {
    const params = { objects, axis, alignment };
    if (spacing !== null) params.spacing = spacing;

    return await this.executeCommand('worldbuilder_align_objects', params);
  }

  /**
   * Get detailed batch information
   */
  async getBatchInfo(batchName) {
    return await this.executeCommand('worldbuilder_batch_info', {
      batch_name: batchName
    });
  }

  /**
   * Get request status
   */
  async getRequestStatus() {
    return await this.executeCommand('worldbuilder_request_status');
  }

  /**
   * Get metrics in JSON format
   */
  async getMetricsJSON(formatType = 'json') {
    return await this.executeCommand('worldbuilder_get_metrics', {
      format_type: formatType
    });
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetricsPrometheus() {
    return await this.executeCommand('worldbuilder_metrics_prometheus');
  }
}

export default WorldBuilderClient;