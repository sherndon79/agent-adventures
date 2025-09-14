#!/usr/bin/env python3
"""
MCP Server for Agent WorldViewer Extension

Provides Model Context Protocol interface to the Agent WorldViewer extension
for camera control and viewport management in Isaac Sim.

Uses FastMCP with Streamable HTTP transport (modern MCP protocol).
"""

import asyncio
import json
import sys
import os
from typing import Any, Dict, List, Optional
import logging
import uvicorn

import aiohttp
from mcp.server.fastmcp import FastMCP

# Add shared modules to path
shared_path = os.path.join(os.path.dirname(__file__), '..', '..', 'shared')
if shared_path not in sys.path:
    sys.path.insert(0, shared_path)

# Import shared modules
from logging_setup import setup_logging
from mcp_base_client import MCPBaseClient

# Import types for FastMCP compatibility
import mcp.types as types

logger = logging.getLogger("worldviewer-server")


def get_movement_style_schema(shot_type: str) -> Dict:
    """
    Generate movement_style schema property for a specific shot type.
    This dynamically creates the enum based on available styles for the shot.
    """
    # Style mappings for each shot type - these match CINEMATIC_STYLES in cinematic_controller_sync.py
    style_mappings = {}
    
    styles = style_mappings.get(shot_type, ["standard"])
    
    return {
        "type": "string",
        "enum": styles,
        "default": "standard",
        "description": f"Movement style for {shot_type.replace('_', ' ')} - affects timing, easing, and cinematic characteristics"
    }


class CameraResponseFormatter:
    """Unified response formatting for camera operations"""
    
    SUCCESS_TEMPLATES = {
        'set_position': "✅ Camera position set to {position}",
        'frame_object': "✅ Camera framed on object: {object_path}",
        'orbit_camera': "✅ Camera positioned in orbit around {center}",
        'stop_movement': "✅ {message}",
        'get_status': "📷 Camera Status",
        'health_check': "✅ Extension Health: {status}"
    }
    
    ERROR_TEMPLATE = "❌ {operation} failed: {error}"
    
    # User-friendly troubleshooting hints for common errors
    TROUBLESHOOTING_HINTS = {
        "Could not connect": "💡 Troubleshooting:\n• Ensure Isaac Sim is running\n• Check that WorldViewer extension is enabled\n• Verify extension HTTP API is active on port 8900",
        "timed out": "💡 Troubleshooting:\n• Isaac Sim may be busy processing\n• Try reducing queue load or wait a moment\n• Check Isaac Sim console for errors",
        "Object not found": "💡 Troubleshooting:\n• Verify the USD path exists (e.g., '/World/my_object')\n• Check object spelling and case sensitivity\n• Use WorldBuilder MCP to list scene elements",
        "No viewport connection": "💡 Troubleshooting:\n• Ensure Isaac Sim viewport is active\n• Try reloading the WorldViewer extension\n• Check Isaac Sim camera setup",
        "HTTP 500": "💡 Troubleshooting:\n• Isaac Sim internal error occurred\n• Check Isaac Sim console logs\n• Try reloading the WorldViewer extension\n• Restart Isaac Sim if issues persist"
    }
    
    @classmethod
    def format_success(cls, operation: str, response: Dict, **template_vars) -> str:
        """Format successful operation response"""
        template = cls.SUCCESS_TEMPLATES.get(operation, "✅ Operation successful")
        
        # Merge response data with template variables
        format_vars = {**template_vars, **response}
        
        try:
            message = template.format(**format_vars)
        except KeyError:
            # Fallback if template variables don't match
            message = template
        
        # Add additional details for specific operations
        if operation == 'set_position':
            if 'target' in format_vars and format_vars['target']:
                message += f" looking at {format_vars['target']}"
        elif operation == 'frame_object':
            if 'calculated_distance' in response:
                message += f" (distance: {response['calculated_distance']:.2f})"
        elif operation == 'orbit_camera':
            if all(k in format_vars for k in ['distance', 'elevation', 'azimuth']):
                message += f"\n• Distance: {format_vars['distance']}"
                message += f"\n• Elevation: {format_vars['elevation']}°"
                message += f"\n• Azimuth: {format_vars['azimuth']}°"
        elif operation == 'get_status':
            camera_status = response.get('camera_status') or response
            message = "📷 Camera Status:\n"
            connected = camera_status.get('connected', 'Unknown')
            message += f"• Connected: {connected}\n"
            
            if camera_status.get('position'):
                pos = camera_status['position']
                message += f"• Position: [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}]\n"
            
            if camera_status.get('target'):
                target = camera_status['target']
                message += f"• Target: [{target[0]:.2f}, {target[1]:.2f}, {target[2]:.2f}]\n"
            
            if camera_status.get('forward_vector'):
                fwd = camera_status['forward_vector']
                message += f"• Forward: [{fwd[0]:.3f}, {fwd[1]:.3f}, {fwd[2]:.3f}]\n"
            
            if camera_status.get('right_vector'):
                right = camera_status['right_vector']
                message += f"• Right: [{right[0]:.3f}, {right[1]:.3f}, {right[2]:.3f}]\n"
                
            if camera_status.get('up_vector'):
                up = camera_status['up_vector']
                message += f"• Up: [{up[0]:.3f}, {up[1]:.3f}, {up[2]:.3f}]\n"
            
            if camera_status.get('camera_path'):
                message += f"• Camera Path: {camera_status['camera_path']}\n"
        elif operation == 'stop_movement':
            # Format rich stop_movement response
            message = f"✅ {response.get('message', 'Stopped camera movement')}\n"
            
            if response.get('stopped_at_position'):
                pos = response['stopped_at_position']
                message += f"\n📍 Camera Position: [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}]"
            
            if response.get('stopped_at_target'):
                target = response['stopped_at_target']
                message += f"\n🎯 Looking At: [{target[0]:.2f}, {target[1]:.2f}, {target[2]:.2f}]"
            
            if response.get('interrupted_movement_id'):
                message += f"\n🎬 Interrupted: {response['interrupted_movement_id']}"
                if response.get('interrupted_operation'):
                    message += f" ({response['interrupted_operation']})"
                if response.get('progress_when_stopped'):
                    message += f" - {response['progress_when_stopped']} complete"
            
            if response.get('stopped_count', 0) > 1:
                message += f"\n📊 Total Stopped: {response['stopped_count']} movements"
        elif operation == 'health_check':
            # Update for standardized health format
            message = "✅ WorldViewer Health\n"
            message += f"• Service: {response.get('service', 'Agent WorldViewer API')}\n"
            message += f"• Version: {response.get('version', '1.0.0')}\n"
            message += f"• URL: {response.get('url', 'Unknown')}\n"
            message += f"• Timestamp: {response.get('timestamp', 'unknown')}\n"
            # Add extension-specific status
            camera_position = response.get('camera_position', [0.0, 0.0, 0.0])
            message += f"• Camera Position: [{camera_position[0]:.2f}, {camera_position[1]:.2f}, {camera_position[2]:.2f}]"
        
        return message
    
    @classmethod
    def format_error(cls, operation: str, error: str) -> str:
        """Format error response with user-friendly operation name and troubleshooting hints"""
        friendly_operation = operation.replace('_', ' ').title()
        error_message = cls.ERROR_TEMPLATE.format(operation=friendly_operation, error=error)
        
        # Add troubleshooting hints for common error patterns
        for error_pattern, hint in cls.TROUBLESHOOTING_HINTS.items():
            if error_pattern.lower() in error.lower():
                error_message += f"\n\n{hint}"
                break
        
        return error_message

shared_compat_path = os.path.join(os.path.dirname(__file__), '..', '..', 'shared')
if shared_compat_path not in sys.path:
    sys.path.insert(0, shared_compat_path)

# Add agentworld-extensions to path for unified config
extensions_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'agentworld-extensions')
if os.path.exists(extensions_path) and extensions_path not in sys.path:
    sys.path.insert(0, extensions_path)

try:
    from agent_world_config import create_worldviewer_config
    config = create_worldviewer_config()
except ImportError:
    # Fallback if unified config not available
    config = None

try:
    from pydantic_compat import (
        create_compatible_position_schema,
        validate_position,
        PYDANTIC_VERSION
    )
    HAS_COMPAT = True
except ImportError:
    HAS_COMPAT = False
    PYDANTIC_VERSION = 1


def create_position_schema(description: str = "Camera position as [x, y, z]") -> Dict:
    """Create position schema compatible with target environment."""
    if HAS_COMPAT:
        return create_compatible_position_schema(description)
    else:
        # Fallback to basic schema without v2 constraints
        return {
            "type": "array",
            "items": {"type": "number"},
            "description": description + " (exactly 3 items required)"
        }


# Create FastMCP server instance
mcp = FastMCP("worldviewer")

class WorldViewerMCP:
    """MCP Server for Agent WorldViewer Extension"""

    def __init__(self):
        # Use configuration if available, otherwise fallback to defaults
        env_base = os.getenv("AGENT_WORLDVIEWER_BASE_URL") or os.getenv("WORLDVIEWER_API_URL")
        if config:
            self.base_url = env_base or config.get_server_url()
            self.timeout = config.get('mcp_timeout', 10.0)
            self.retry_attempts = config.get('mcp_retry_attempts', 3)
        else:
            self.base_url = env_base or "http://localhost:8900"
            self.timeout = 10.0
            self.retry_attempts = 3

        # Initialize unified auth client
        self.client = MCPBaseClient("WORLDVIEWER", self.base_url)

        # Response formatter
        self.formatter = CameraResponseFormatter()
    
async def _initialize_client(self):
        """Initialize the unified auth client"""
        if not self.client._initialized:
            await worldviewer_server.client.initialize()
    
async def __aenter__(self):
        """Async context manager entry"""
        await worldviewer_server._initialize_client()
        return self
    
async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await worldviewer_server.client.close()

# Initialize server instance
worldviewer_server = WorldViewerMCP()

# FastMCP tool definitions using decorators
@mcp.tool()
async def worldviewer_set_camera_position(
    position: List[float],
    target: Optional[List[float]] = None,
    up_vector: Optional[List[float]] = None
) -> str:
    """Set camera position and optionally target in Isaac Sim viewport.

    Args:
        position: Camera position as [x, y, z] (exactly 3 items required)
        target: Optional look-at target as [x, y, z] (exactly 3 items required)
        up_vector: Optional up vector as [x, y, z] (exactly 3 items required)
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._set_camera_position({
        "position": position,
        "target": target,
        "up_vector": up_vector
    })
    return result[0].text

@mcp.tool()
async def worldviewer_frame_object(
    object_path: str,
    distance: Optional[float] = None
) -> str:
    """Frame an object in the Isaac Sim viewport.

    Args:
        object_path: USD path to the object (e.g., '/World/my_cube')
        distance: Optional distance from object (auto-calculated if not provided)
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._frame_object({
        "object_path": object_path,
        "distance": distance
    })
    return result[0].text

@mcp.tool()
async def worldviewer_orbit_camera(
    center: List[float],
    distance: float,
    elevation: float,
    azimuth: float
) -> str:
    """Position camera in orbital coordinates around a center point.

    Args:
        center: Center point to orbit around as [x, y, z] (exactly 3 items required)
        distance: Distance from center point
        elevation: Elevation angle in degrees (-90 to 90)
        azimuth: Azimuth angle in degrees (0 = front, 90 = right)
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._orbit_camera({
        "center": center,
        "distance": distance,
        "elevation": elevation,
        "azimuth": azimuth
    })
    return result[0].text

@mcp.tool()
async def worldviewer_get_camera_status() -> str:
    """Get current camera status and position."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._get_camera_status({})
    return result[0].text

@mcp.tool()
async def worldviewer_get_asset_transform(
    usd_path: str,
    calculation_mode: str = "auto"
) -> str:
    """Get transform information (position, rotation, scale, bounds) for a specific asset in the scene.

    Args:
        usd_path: USD path to the asset (e.g., '/World/my_cube' or '/World/ProperCity')
        calculation_mode: How to calculate position for complex assets (auto, center, pivot, bounds)
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._get_asset_transform({
        "usd_path": usd_path,
        "calculation_mode": calculation_mode
    })
    return result[0].text

@mcp.tool()
async def worldviewer_extension_health() -> str:
    """Check Agent WorldViewer extension health and API status."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._extension_health({})
    return result[0].text

@mcp.tool()
async def worldviewer_smooth_move(
    start_position: List[float],
    end_position: List[float],
    start_target: List[float],
    end_target: List[float],
    start_rotation: Optional[List[float]] = None,
    end_rotation: Optional[List[float]] = None,
    speed: Optional[float] = None,
    duration: Optional[float] = None,
    easing_type: str = "ease_in_out",
    execution_mode: str = "auto"
) -> str:
    """Smooth camera movement between two camera states (position + rotation) with easing.

    Args:
        start_position: Starting camera position [x, y, z]
        end_position: Ending camera position [x, y, z]
        start_target: Starting look-at target [x, y, z] (required for practical cinematography)
        end_target: Ending look-at target [x, y, z] (required for practical cinematography)
        start_rotation: Starting camera rotation [pitch, yaw, roll] in degrees (optional)
        end_rotation: Ending camera rotation [pitch, yaw, roll] in degrees (optional)
        speed: Average speed in units per second (alternative to duration)
        duration: Duration in seconds (overrides speed if provided)
        easing_type: Movement easing function (linear, ease_in, ease_out, ease_in_out, bounce, elastic)
        execution_mode: Execution mode (auto or manual)
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._smooth_move({
        "start_position": start_position,
        "end_position": end_position,
        "start_target": start_target,
        "end_target": end_target,
        "start_rotation": start_rotation,
        "end_rotation": end_rotation,
        "speed": speed,
        "duration": duration,
        "easing_type": easing_type,
        "execution_mode": execution_mode
    })
    return result[0].text

@mcp.tool()
async def worldviewer_arc_shot(
    start_position: List[float],
    end_position: List[float],
    start_target: List[float],
    end_target: List[float],
    speed: Optional[float] = None,
    duration: Optional[float] = None,
    movement_style: str = "standard",
    execution_mode: str = "auto"
) -> str:
    """Cinematic arc shot with curved Bezier path between two camera positions.

    Args:
        start_position: Starting camera position [x, y, z]
        end_position: Ending camera position [x, y, z]
        start_target: Starting look-at target [x, y, z] (required for practical cinematography)
        end_target: Ending look-at target [x, y, z] (required for practical cinematography)
        speed: Average speed in units per second (alternative to duration)
        duration: Duration in seconds (overrides speed if provided)
        movement_style: Arc movement style
        execution_mode: Execution mode (auto or manual)
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._arc_shot({
        "start_position": start_position,
        "end_position": end_position,
        "start_target": start_target,
        "end_target": end_target,
        "speed": speed,
        "duration": duration,
        "movement_style": movement_style,
        "execution_mode": execution_mode
    })
    return result[0].text

@mcp.tool()
async def worldviewer_stop_movement() -> str:
    """Stop an active cinematic movement."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._stop_movement({})
    return result[0].text

@mcp.tool()
async def worldviewer_movement_status(movement_id: str) -> str:
    """Get status of a cinematic movement.

    Args:
        movement_id: ID of the movement to check
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._movement_status({"movement_id": movement_id})
    return result[0].text

@mcp.tool()
async def worldviewer_get_metrics(format: str = "json") -> str:
    """Get performance metrics and statistics from WorldViewer extension.

    Args:
        format: Output format (json or prom)
    """
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._get_metrics({"format": format})
    return result[0].text

@mcp.tool()
async def worldviewer_metrics_prometheus() -> str:
    """Get WorldViewer metrics in Prometheus format for monitoring systems."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._metrics_prometheus({})
    return result[0].text

@mcp.tool()
async def worldviewer_get_queue_status() -> str:
    """Get comprehensive shot queue status with timing information and queue state."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._get_queue_status({})
    return result[0].text

@mcp.tool()
async def worldviewer_play_queue() -> str:
    """Start/resume queue processing."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._play_queue({})
    return result[0].text

@mcp.tool()
async def worldviewer_pause_queue() -> str:
    """Pause queue processing (current movement continues, no new movements start)."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._pause_queue({})
    return result[0].text

@mcp.tool()
async def worldviewer_stop_queue() -> str:
    """Stop and clear entire queue."""
    await worldviewer_server._initialize_client()
    result = await worldviewer_server._stop_queue({})
    return result[0].text

async def execute_camera_operation(operation: str, method: str, endpoint: str,
                                   data: Optional[Dict] = None, **template_vars) -> List[types.TextContent]:
    """Unified camera operation execution with consistent response formatting"""
    try:
        await worldviewer_server._initialize_client()

        if method.upper() == "GET":
            response = await worldviewer_server.client.get(endpoint)
        elif method.upper() == "POST":
            response = await worldviewer_server.client.post(endpoint, json=data)
        else:
            raise ValueError(f"Unsupported method: {method}")

        if response.get("success"):
            message = worldviewer_server.formatter.format_success(operation, response, **template_vars)
            return [types.TextContent(type="text", text=message)]
        else:
            error_message = worldviewer_server.formatter.format_error(operation, response.get('error', 'Unknown error'))
            return [types.TextContent(type="text", text=error_message)]

    except aiohttp.ClientError as e:
        error_message = worldviewer_server.formatter.format_error(operation, f"Connection error: {str(e)}")
        return [types.TextContent(type="text", text=error_message)]
    except Exception as e:
        error_message = worldviewer_server.formatter.format_error(operation, f"Execution error: {str(e)}")
        return [types.TextContent(type="text", text=error_message)]
    
async def _set_camera_position(args: Dict[str, Any]) -> List[types.TextContent]:
    """Set camera position"""

    position = args.get("position")
    target = args.get("target")
    up_vector = args.get("up_vector")

    # Manual validation for compatibility with Pydantic v1
    try:
        if HAS_COMPAT:
            validate_position(position)
            if target:
                validate_position(target)
            if up_vector:
                validate_position(up_vector)
        else:
            # Basic validation fallback
            if not isinstance(position, list) or len(position) != 3:
                raise ValueError("position must be an array of exactly 3 numbers")
            if target and (not isinstance(target, list) or len(target) != 3):
                raise ValueError("target must be an array of exactly 3 numbers")
            if up_vector and (not isinstance(up_vector, list) or len(up_vector) != 3):
                raise ValueError("up_vector must be an array of exactly 3 numbers")
    except ValueError as e:
        return [types.TextContent(type="text", text=f"❌ Parameter validation error: {str(e)}")]

    request_data = {"position": position}
    if target:
        request_data["target"] = target
    if up_vector:
        request_data["up_vector"] = up_vector

    return await execute_camera_operation(
        "set_position", "POST", "/camera/set_position",
        request_data, position=position, target=target
    )
    
async def _frame_object(args: Dict[str, Any]) -> List[types.TextContent]:
        """Frame object in viewport"""
        
        object_path = args.get("object_path")
        distance = args.get("distance")
        
        request_data = {"object_path": object_path}
        if distance is not None:
            request_data["distance"] = distance
        
        return await execute_camera_operation(
            "frame_object", "POST", "/camera/frame_object", 
            request_data, object_path=object_path
        )
    
async def _orbit_camera(args: Dict[str, Any]) -> List[types.TextContent]:
        """Position camera in orbit"""
        
        center = args.get("center")
        distance = args.get("distance")
        elevation = args.get("elevation")
        azimuth = args.get("azimuth")
        
        # Manual validation for compatibility with Pydantic v1
        try:
            if HAS_COMPAT:
                validate_position(center)
            else:
                if not isinstance(center, list) or len(center) != 3:
                    raise ValueError("center must be an array of exactly 3 numbers")
        except ValueError as e:
            return [types.TextContent(type="text", text=f"❌ Parameter validation error: {str(e)}")]
        
        request_data = {
            "center": center,
            "distance": distance,
            "elevation": elevation,
            "azimuth": azimuth
        }
        
        return await execute_camera_operation(
            "orbit_camera", "POST", "/camera/orbit", 
            request_data, center=center, distance=distance, elevation=elevation, azimuth=azimuth
        )
    
async def _get_camera_status(args: Dict[str, Any]) -> List[types.TextContent]:
        """Get camera status"""
        return await execute_camera_operation(
            "get_status", "GET", "/camera/status"
        )
    
async def _get_asset_transform(args: Dict[str, Any]) -> List[types.TextContent]:
        """Get asset transform information for camera operations"""
        usd_path = args.get("usd_path", "")
        calculation_mode = args.get("calculation_mode", "auto")
        
        if not usd_path:
            return [types.TextContent(type="text", text="❌ Error: usd_path is required")]
        
        try:
            await worldviewer_server._initialize_client()
            result = await worldviewer_server.client.get("/get_asset_transform", params={
                "usd_path": usd_path,
                "calculation_mode": calculation_mode
            })
            
            if result.get("success"):
                # Format the transform data nicely
                pos = result.get("position", [0, 0, 0])
                bounds = result.get("bounds", {})
                bounds_center = bounds.get("center", [0, 0, 0])
                asset_type = result.get("type", "unknown")
                child_count = result.get("child_count", 0)
                calc_mode = result.get("calculation_mode", "auto")
                
                transform_text = (
                    f"🔍 Asset Transform: {usd_path}\n"
                    f"• Type: {asset_type} ({child_count} children)\n"
                    f"• Position: [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}]\n"
                    f"• Bounds Center: [{bounds_center[0]:.2f}, {bounds_center[1]:.2f}, {bounds_center[2]:.2f}]\n"
                    f"• Calculation Mode: {calc_mode}\n"
                    f"• Source: worldviewer"
                )
                
                # Add bounds info if available
                if bounds.get("min") and bounds.get("max"):
                    bounds_min = bounds["min"]
                    bounds_max = bounds["max"]
                    size = [bounds_max[i] - bounds_min[i] for i in range(3)]
                    transform_text += (
                        f"\n• Bounds Size: [{size[0]:.2f}, {size[1]:.2f}, {size[2]:.2f}]"
                        f"\n• Bounds Min: [{bounds_min[0]:.2f}, {bounds_min[1]:.2f}, {bounds_min[2]:.2f}]"
                        f"\n• Bounds Max: [{bounds_max[0]:.2f}, {bounds_max[1]:.2f}, {bounds_max[2]:.2f}]"
                    )
                
                return [types.TextContent(type="text", text=transform_text)]
            else:
                error_msg = result.get('error', 'Unknown error')
                return [types.TextContent(type="text", text=f"❌ Failed to get asset transform: {error_msg}")]
                    
        except aiohttp.ServerTimeoutError:
            return [types.TextContent(type="text", text="❌ Request timed out - Isaac Sim may be busy")]
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Connection error: {str(e)}")]
    
async def _extension_health(args: Dict[str, Any]) -> List[types.TextContent]:
        """Check extension health"""
        return await execute_camera_operation(
            "health_check", "GET", "/health", status="healthy"
        )
    
    # =====================================================================
    # CINEMATIC MOVEMENT TOOL HANDLERS
    # =====================================================================
    
async def _smooth_move(args: Dict[str, Any]) -> List[types.TextContent]:
        """Execute smooth camera movement"""
        return await execute_camera_operation(
            "smooth_move", "POST", "/camera/smooth_move", args,
            start_position=args.get("start_position"),
            end_position=args.get("end_position"),
            duration=args.get("duration", 3.0)
        )
    
async def _arc_shot(args: Dict[str, Any]) -> List[types.TextContent]:
        """Execute arc shot cinematic movement with curved Bezier path"""
        return await execute_camera_operation(
            "arc_shot", "POST", "/camera/arc_shot", args,
            start_position=args.get("start_position"),
            end_position=args.get("end_position"),
            start_target=args.get("start_target"),
            end_target=args.get("end_target"),
            duration=args.get("duration", 6.0)
        )
    
async def _stop_movement(args: Dict[str, Any]) -> List[types.TextContent]:
        """Stop all active cinematic movements"""
        return await execute_camera_operation(
            "stop_movement", "POST", "/camera/stop_movement", {},
            description="Stopping all camera movements"
        )
    
async def _movement_status(args: Dict[str, Any]) -> List[types.TextContent]:
        """Get status of a cinematic movement"""
        movement_id = args.get("movement_id")
        if not movement_id:
            return [types.TextContent(type="text", text="❌ Movement ID is required")]
        
        return await execute_camera_operation(
            "movement_status", "GET", f"/camera/movement_status?movement_id={movement_id}", None,
            movement_id=movement_id
        )
    
async def _get_metrics(args: Dict[str, Any]) -> List[types.TextContent]:
        """Get performance metrics and statistics from WorldViewer extension"""
        format_type = args.get("format", "json")
        
        try:
            if format_type == "prom":
                await worldviewer_server._initialize_client()
                response = await worldviewer_server.client.get("/metrics.prom")
            else:
                await worldviewer_server._initialize_client()
                response = await worldviewer_server.client.get("/metrics")
            
            # Handle Prometheus format special response
            if format_type == "prom" and "_raw_text" in response:
                prom_data = response["_raw_text"]
                return [types.TextContent(type="text", text=f"📊 **WorldViewer Metrics (Prometheus)**\n```\n{prom_data}\n```")]
            elif response.get("success"):
                if format_type == "json":
                    metrics_json = json.dumps(response.get("metrics", {}), indent=2)
                    return [types.TextContent(type="text", text=f"📊 **WorldViewer Metrics (JSON)**\n```json\n{metrics_json}\n```")]
                elif format_type == "prom":
                    prom_data = response.get("prometheus_metrics", "# No Prometheus metrics available")
                    return [types.TextContent(type="text", text=f"📊 **WorldViewer Metrics (Prometheus)**\n```\n{prom_data}\n```")]
                else:
                    return [types.TextContent(type="text", text="❌ Error: format must be 'json' or 'prom'")]
            else:
                error_msg = response.get('error', 'Unknown error')
                return [types.TextContent(type="text", text=f"❌ Failed to get WorldViewer metrics: {error_msg}")]
                
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Error getting metrics: {str(e)}")]
    
async def _metrics_prometheus(args: Dict[str, Any]) -> List[types.TextContent]:
        """Get WorldViewer metrics in Prometheus format."""
        try:
            await worldviewer_server._initialize_client()
            response = await worldviewer_server.client.get("/metrics.prom")
            
            # For Prometheus format, check for _raw_text field first (special response format)
            if "_raw_text" in response:
                prom_data = response["_raw_text"]
                return [types.TextContent(type="text", text=f"📊 **WorldViewer Prometheus Metrics**\n\n```\n{prom_data}\n```")]
            elif response.get("success"):
                # Fallback to prometheus_metrics field
                prom_data = response.get("prometheus_metrics", "# No Prometheus metrics available")
                return [types.TextContent(type="text", text=f"📊 **WorldViewer Prometheus Metrics**\n\n```\n{prom_data}\n```")]
            else:
                error_msg = response.get('error', 'Unknown error')
                return [types.TextContent(type="text", text=f"❌ Failed to get Prometheus metrics: {error_msg}")]
                
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Error getting Prometheus metrics: {str(e)}")]

async def _get_queue_status(args: Dict[str, Any]) -> List[types.TextContent]:
        """Get comprehensive shot queue status with timing information"""
        try:
            await worldviewer_server._initialize_client()
            response = await worldviewer_server.client.get("/camera/shot_queue_status")
            
            if response.get("success"):
                # Format the response nicely
                status_text = "🎬 **WorldViewer Queue Status**\n\n"
                
                # Queue state
                queue_state = response.get("queue_state", "unknown")
                shot_count = response.get("shot_count", 0)
                active_count = response.get("active_count", 0)
                queued_count = response.get("queued_count", 0)
                
                status_text += f"**Queue State:** {queue_state.title()}\n"
                status_text += f"**Total Shots:** {shot_count} ({active_count} active, {queued_count} queued)\n\n"
                
                # Active shot info
                active_shot = response.get("active_shot")
                if active_shot:
                    movement_id = active_shot.get("movement_id", "N/A")
                    operation = active_shot.get("operation", "N/A")
                    progress = active_shot.get("progress", 0) * 100  # Convert to percentage
                    remaining_time = active_shot.get("remaining_time", 0)
                    total_duration = active_shot.get("total_duration", 0)
                    
                    status_text += f"**Active Shot:** {movement_id} ({operation})\n"
                    status_text += f"**Progress:** {progress:.1f}%\n"
                    status_text += f"**Duration:** {total_duration:.1f}s (remaining: {remaining_time:.1f}s)\n\n"
                
                # Overall timing information
                total_duration = response.get("total_duration", 0)
                remaining_duration = response.get("remaining_duration", 0)
                if total_duration > 0:
                    status_text += f"**Total Queue Duration:** {total_duration:.1f}s\n"
                    status_text += f"**Estimated Remaining:** {remaining_duration:.1f}s\n\n"
                
                # Queue details if there are queued shots
                queued_shots = response.get("queued_shots", [])
                if queued_shots:
                    status_text += "**Queued Shots:**\n"
                    for i, shot in enumerate(queued_shots, 1):
                        mov_id = shot.get("movement_id", f"shot_{i}")
                        operation = shot.get("operation", "unknown")
                        duration = shot.get("estimated_duration", 0)
                        status_text += f"  {i}. {mov_id} ({operation}) - {duration:.1f}s\n"
                
                return [types.TextContent(type="text", text=status_text)]
            else:
                error_msg = response.get('error', 'Unknown error')
                return [types.TextContent(type="text", text=f"❌ Failed to get queue status: {error_msg}")]
                
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Error getting queue status: {str(e)}")]

async def _play_queue(args: Dict[str, Any]) -> List[types.TextContent]:
        """Start/resume queue processing"""
        try:
            await worldviewer_server._initialize_client()
            response = await worldviewer_server.client.post("/camera/queue/play")
            
            if response.get("success"):
                queue_state = response.get("queue_state", "unknown")
                active_count = response.get("active_count", 0)
                queued_count = response.get("queued_count", 0)
                message = response.get("message", "Queue started")
                
                return [types.TextContent(type="text", text=f"▶️ **Queue Play**\n\n{message}\n\n**State:** {queue_state.title()}\n**Active:** {active_count} | **Queued:** {queued_count}")]
            else:
                error_msg = response.get('error', 'Unknown error')
                return [types.TextContent(type="text", text=f"❌ Failed to play queue: {error_msg}")]
                
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Error playing queue: {str(e)}")]

async def _pause_queue(args: Dict[str, Any]) -> List[types.TextContent]:
        """Pause queue processing"""
        try:
            await worldviewer_server._initialize_client()
            response = await worldviewer_server.client.post("/camera/queue/pause")
            
            if response.get("success"):
                queue_state = response.get("queue_state", "unknown")
                active_count = response.get("active_count", 0)
                queued_count = response.get("queued_count", 0)
                message = response.get("message", "Queue paused")
                
                return [types.TextContent(type="text", text=f"⏸️ **Queue Pause**\n\n{message}\n\n**State:** {queue_state.title()}\n**Active:** {active_count} | **Queued:** {queued_count}")]
            else:
                error_msg = response.get('error', 'Unknown error')
                return [types.TextContent(type="text", text=f"❌ Failed to pause queue: {error_msg}")]
                
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Error pausing queue: {str(e)}")]

async def _stop_queue(args: Dict[str, Any]) -> List[types.TextContent]:
        """Stop and clear entire queue"""
        try:
            await worldviewer_server._initialize_client()
            response = await worldviewer_server.client.post("/camera/queue/stop")
            
            if response.get("success"):
                queue_state = response.get("queue_state", "unknown")
                stopped_movements = response.get("stopped_movements", 0)
                message = response.get("message", "Queue stopped")
                
                return [types.TextContent(type="text", text=f"⏹️ **Queue Stop**\n\n{message}\n\n**State:** {queue_state.title()}\n**Stopped Movements:** {stopped_movements}")]
            else:
                error_msg = response.get('error', 'Unknown error')
                return [types.TextContent(type="text", text=f"❌ Failed to stop queue: {error_msg}")]
                
        except Exception as e:
            return [types.TextContent(type="text", text=f"❌ Error stopping queue: {str(e)}")]
    
async def main():
    """Main entry point for the FastMCP server."""
    # Unified logging (stderr by default; env-driven options)
    setup_logging('worldviewer')
    logger.info("🚀 Starting WorldViewer MCP Server (FastMCP)")

    # Get port from environment variable
    port = int(os.getenv("MCP_SERVER_PORT", 8701))

    # Create the FastMCP ASGI application
    app = mcp.create_app()

    logger.info(f"WorldViewer MCP Server starting on http://0.0.0.0:{port}")
    logger.info("Using modern FastMCP with Streamable HTTP transport")

    # Run with uvicorn
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
