import { HTTPMCPClient } from './http-mcp-client.js';
import { config } from '../../config/environment.js';

/**
 * WorldViewer MCP client for Isaac Sim camera control and cinematography
 * Handles camera positioning, cinematic movements, and viewport control
 */
export class WorldViewerClient extends HTTPMCPClient {
  constructor(options = {}) {
    const serviceUrl = config.mcp.services.worldViewer;
    super('WorldViewer', serviceUrl, options);
  }

  // ========== WorldViewer-specific Methods ==========

  /**
   * Set camera position and target
   */
  async setCameraPosition(position, target = null, upVector = null) {
    const params = { position };
    if (target) params.target = target;
    if (upVector) params.up_vector = upVector;

    return await this.executeCommand('worldviewer_set_camera_position', params);
  }

  /**
   * Frame an object in the viewport
   */
  async frameObject(objectPath, distance = null) {
    const params = { object_path: objectPath };
    if (distance !== null) params.distance = distance;

    return await this.executeCommand('worldviewer_frame_object', params);
  }

  /**
   * Position camera in orbital coordinates
   */
  async orbitCamera(center, distance, elevation, azimuth) {
    return await this.executeCommand('worldviewer_orbit_camera', {
      center,
      distance,
      elevation,
      azimuth
    });
  }

  /**
   * Get current camera status
   */
  async getCameraStatus() {
    return await this.executeCommand('worldviewer_get_camera_status');
  }

  /**
   * Get asset transform information
   */
  async getAssetTransform(usdPath, calculationMode = 'auto') {
    return await this.executeCommand('worldviewer_get_asset_transform', {
      usd_path: usdPath,
      calculation_mode: calculationMode
    });
  }

  /**
   * Smooth camera movement between positions
   */
  async smoothMove(startPosition, endPosition, startTarget, endTarget, options = {}) {
    const params = {
      start_position: startPosition,
      end_position: endPosition,
      start_target: startTarget,
      end_target: endTarget
    };

    if (options.startRotation) params.start_rotation = options.startRotation;
    if (options.endRotation) params.end_rotation = options.endRotation;
    if (options.speed) params.speed = options.speed;
    if (options.duration) params.duration = options.duration;
    if (options.easingType) params.easing_type = options.easingType;
    if (options.executionMode) params.execution_mode = options.executionMode;

    return await this.executeCommand('worldviewer_smooth_move', params);
  }

  /**
   * Animated orbital camera movement around a center point or target object
   */
  async orbitShot(center, distance = 10.0, startAzimuth = 0.0, endAzimuth = 360.0, elevation = 15.0, duration = 8.0, options = {}) {
    const params = {
      center,
      distance,
      start_azimuth: startAzimuth,
      end_azimuth: endAzimuth,
      elevation,
      duration
    };

    if (options.targetObject) params.target_object = options.targetObject;
    if (options.startPosition) params.start_position = options.startPosition;
    if (options.startTarget) params.start_target = options.startTarget;
    if (options.endTarget) params.end_target = options.endTarget;
    if (options.orbitCount) params.orbit_count = options.orbitCount;
    if (options.executionMode) params.execution_mode = options.executionMode;

    return await this.executeCommand('worldviewer_orbit_shot', params);
  }

  /**
   * Cinematic arc shot between positions
   */
  async arcShot(startPosition, endPosition, startTarget, endTarget, options = {}) {
    const params = {
      start_position: startPosition,
      end_position: endPosition,
      start_target: startTarget,
      end_target: endTarget
    };

    if (options.speed) params.speed = options.speed;
    if (options.duration) params.duration = options.duration;
    if (options.movementStyle) params.movement_style = options.movementStyle;
    if (options.executionMode) params.execution_mode = options.executionMode;

    return await this.executeCommand('worldviewer_arc_shot', params);
  }

  /**
   * Stop active cinematic movement
   */
  async stopMovement() {
    return await this.executeCommand('worldviewer_stop_movement');
  }

  /**
   * Get movement status
   */
  async getMovementStatus(movementId) {
    return await this.executeCommand('worldviewer_movement_status', {
      movement_id: movementId
    });
  }

  /**
   * Get performance metrics
   */
  async getMetricsJSON(format = 'json') {
    return await this.executeCommand('worldviewer_get_metrics', { format });
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetricsPrometheus() {
    return await this.executeCommand('worldviewer_metrics_prometheus');
  }

  /**
   * Get shot queue status
   */
  async getQueueStatus() {
    return await this.executeCommand('worldviewer_get_queue_status');
  }

  /**
   * Start/resume queue processing
   */
  async playQueue() {
    return await this.executeCommand('worldviewer_play_queue');
  }

  /**
   * Pause queue processing
   */
  async pauseQueue() {
    return await this.executeCommand('worldviewer_pause_queue');
  }

  /**
   * Stop and clear queue
   */
  async stopQueue() {
    return await this.executeCommand('worldviewer_stop_queue');
  }
}

export default WorldViewerClient;