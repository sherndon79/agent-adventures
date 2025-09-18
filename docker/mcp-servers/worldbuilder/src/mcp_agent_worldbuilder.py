#!/usr/bin/env python3
"""
Isaac Sim WorldBuilder MCP Server

Provides Claude Code with direct Isaac Sim worldbuilding capabilities through MCP tools.
Interfaces with the Agent WorldBuilder Extension HTTP API running on localhost:8899.

Uses FastMCP with Streamable HTTP transport (modern MCP protocol).
"""

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, List
import aiohttp
import uvicorn
from mcp.server.fastmcp import FastMCP

# Add shared modules to path
shared_path = os.path.join(os.path.dirname(__file__), '..', '..', 'shared')
if shared_path not in sys.path:
    sys.path.insert(0, shared_path)

from logging_setup import setup_logging

# Shared transport helpers from agentworld-extensions
try:
    from omni.agent.worldbuilder.errors import error_response
    from omni.agent.worldbuilder.transport import normalize_transport_response
except ImportError:  # pragma: no cover - fallback when extensions not available
    def error_response(code: str, message: str, *, details=None):
        payload = {"success": False, "error_code": code, "error": message}
        if details:
            payload["details"] = details
        return payload

    def normalize_transport_response(operation: str, response, *, default_error_code: str):
        if isinstance(response, dict):
            response.setdefault("success", True)
            if response["success"] is False:
                response.setdefault("error_code", default_error_code)
                response.setdefault("error", "An unknown error occurred")
            return response
        return error_response(
            "INVALID_RESPONSE",
            "Service returned unexpected response type",
            details={"operation": operation, "type": type(response).__name__},
        )

# Add agentworld-extensions to path for unified config
extensions_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'agentworld-extensions')
if os.path.exists(extensions_path) and extensions_path not in sys.path:
    sys.path.insert(0, extensions_path)

try:
    from agent_world_config import create_worldbuilder_config
    config = create_worldbuilder_config()
except ImportError:
    # Fallback if unified config not available
    config = None

# Import unified auth client
from mcp_base_client import MCPBaseClient

# Configure logging with unified system
logger = logging.getLogger(__name__)

# Create FastMCP server instance
mcp = FastMCP("worldbuilder")

class WorldBuilderMCP:
    """MCP Server for Isaac Sim WorldBuilder Extension integration."""

    def __init__(self, base_url: str = None):
        # Use configuration if available, otherwise fallback to parameter or default
        # Standardized env override
        env_base = os.getenv("AGENT_WORLDBUILDER_BASE_URL") or os.getenv("WORLDBUILDER_API_URL")
        if config:
            self.base_url = env_base or base_url or config.get_server_url()
            self.retry_attempts = config.get('mcp_retry_attempts', 3)
            self.retry_backoff = config.get('mcp_retry_backoff', 0.5)
        else:
            self.base_url = env_base or base_url or "http://localhost:8899"
            self.retry_attempts = 3
            self.retry_backoff = 0.5

        # Initialize unified auth client
        self.client = MCPBaseClient("WORLDBUILDER", self.base_url)

    async def _initialize_client(self):
        """Initialize the unified auth client"""
        if not self.client._initialized:
            await self.client.initialize()

    def _get_timeout(self, operation_type: str = 'standard') -> float:
        """Get timeout for operation type using configuration."""
        if config:
            timeout_key = f'{operation_type}_timeout'
            return config.get(timeout_key, {'simple': 5.0, 'standard': 10.0, 'complex': 15.0}.get(operation_type, 10.0))
        else:
            # Fallback timeouts
            return {'simple': 5.0, 'standard': 10.0, 'complex': 15.0}.get(operation_type, 10.0)

    async def __aenter__(self):
        """Async context manager entry"""
        await self._initialize_client()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.client.close()

    async def _health_check(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Check extension health and API status with standardized formatting."""
        try:
            await self._initialize_client()
            result = await self.client.get('/health', timeout=self._get_timeout('simple'))
            return normalize_transport_response(
                'get_health',
                result,
                default_error_code='HEALTH_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'get_health'},
            )

    async def _add_element(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Add individual 3D element to Isaac Sim scene."""
        try:
            # Prepare API request
            payload = {
                "element_type": args["element_type"],
                "name": args["name"],
                "position": args["position"],
                "color": args.get("color", [0.5, 0.5, 0.5]),
                "scale": args.get("scale", [1.0, 1.0, 1.0]),
                "parent_path": args.get("parent_path", "/World")
            }

            await self._initialize_client()
            result = await self.client.post(
                "/add_element",
                json=payload,
                timeout=self._get_timeout('standard')
            )

            return normalize_transport_response(
                'add_element',
                result,
                default_error_code='ADD_ELEMENT_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with the WorldBuilder Extension?',
                details={'operation': 'add_element'},
            )

    def _sanitize_usd_name(self, name: str) -> Dict[str, Any]:
        """Sanitize name for USD path compatibility by replacing invalid characters."""
        import re
        # Replace spaces and other problematic characters with underscores
        sanitized = re.sub(r'[^a-zA-Z0-9_\-]', '_', name)
        # Ensure it doesn't start with a number
        if sanitized and sanitized[0].isdigit():
            sanitized = f"_{sanitized}"
        return sanitized

    async def _create_batch(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Create hierarchical batch of objects."""
        try:
            # Sanitize batch name for USD path compatibility
            original_name = args["batch_name"]
            sanitized_name = self._sanitize_usd_name(original_name)

            payload = {
                "batch_name": sanitized_name,
                "elements": args["elements"],
                "parent_path": args.get("parent_path", "/World")
            }

            await self._initialize_client()
            result = await self.client.post(
                "/create_batch",
                json=payload,
                timeout=self._get_timeout('complex')
            )

            normalized = normalize_transport_response(
                'create_batch',
                result,
                default_error_code='CREATE_BATCH_FAILED',
            )
            if normalized.get('success') and original_name != sanitized_name:
                details = normalized.setdefault('details', {})
                details['sanitized_from'] = original_name
                details['sanitized_to'] = sanitized_name
            return normalized

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'create_batch'},
            )

    async def _remove_element(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Remove specific element by USD path."""
        try:
            payload = {"element_path": args["usd_path"]}

            await self._initialize_client()
            result = await self.client.post(
                "/remove_element",
                json=payload,
                timeout=10
            )
            return normalize_transport_response(
                'remove_element',
                result,
                default_error_code='REMOVE_ELEMENT_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'remove_element'},
            )

    async def _clear_scene(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Clear scene or specific paths."""
        if not args.get("confirm", False):
            return error_response(
                'CONFIRMATION_REQUIRED',
                'Destructive operation requires confirm=true parameter',
                details={'operation': 'clear_scene'},
            )

        try:
            payload = {"path": args.get("path", "/World")}

            await self._initialize_client()
            result = await self.client.post(
                "/clear_path",
                json=payload,
                timeout=10
            )
            return normalize_transport_response(
                'clear_path',
                result,
                default_error_code='CLEAR_PATH_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'clear_path'},
            )

    async def _clear_path(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Surgical removal of specific USD stage path."""
        path = args.get("path")
        if not path:
            return error_response(
                'MISSING_PARAMETER',
                'path parameter is required',
                details={'parameter': 'path'},
            )

        if not args.get("confirm", False):
            return error_response(
                'CONFIRMATION_REQUIRED',
                'Destructive operation requires confirm=true parameter',
                details={'operation': 'clear_path', 'path': path},
            )

        try:
            payload = {"path": path}

            await self._initialize_client()
            result = await self.client.post(
                "/clear_path",
                json=payload,
                timeout=10
            )

            return normalize_transport_response(
                'clear_path',
                result,
                default_error_code='CLEAR_PATH_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'clear_path', 'path': path},
            )

    async def _get_scene(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get complete scene structure."""
        try:
            await self._initialize_client()
            result = await self.client.get('/get_scene', timeout=10)
            return normalize_transport_response(
                'get_scene',
                result,
                default_error_code='GET_SCENE_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'get_scene'},
            )

    async def _scene_status(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get scene health status."""
        try:
            await self._initialize_client()
            result = await self.client.get('/scene_status', timeout=5)
            return normalize_transport_response(
                'scene_status',
                result,
                default_error_code='SCENE_STATUS_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'scene_status'},
            )

    async def _list_elements(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get flat listing of scene elements."""
        try:
            await self._initialize_client()
            result = await self.client.get('/list_elements', timeout=10)
            return normalize_transport_response(
                'list_elements',
                result,
                default_error_code='LIST_ELEMENTS_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}',
                details={'operation': 'list_elements'},
            )

    async def _place_asset(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Place USD asset in Isaac Sim scene via reference."""
        try:
            # Prepare API request payload
            payload = {
                "name": args["name"],
                "asset_path": args["asset_path"],
                "prim_path": args.get("prim_path", args["name"]),
                "position": args.get("position", [0, 0, 0]),
                "rotation": args.get("rotation", [0, 0, 0]),
                "scale": args.get("scale", [1, 1, 1])
            }

            # Call Isaac Sim place_asset API via base client
            await self._initialize_client()
            result = await self.client.post(
                "/place_asset",
                json=payload,
                timeout=10
            )
            return normalize_transport_response(
                'place_asset',
                result,
                default_error_code='PLACE_ASSET_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with the WorldBuilder Extension on port 8899?',
                details={'operation': 'place_asset'},
            )

    async def _transform_asset(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Transform existing asset in Isaac Sim scene."""
        try:
            # Prepare API request payload
            payload = {
                "prim_path": args["prim_path"]
            }

            # Add optional transform parameters if provided
            if "position" in args:
                payload["position"] = args["position"]
            if "rotation" in args:
                payload["rotation"] = args["rotation"]
            if "scale" in args:
                payload["scale"] = args["scale"]

            # Call Isaac Sim transform_asset API via base client
            await self._initialize_client()
            result = await self.client.post(
                "/transform_asset",
                json=payload,
                timeout=10
            )
            return normalize_transport_response(
                'transform_asset',
                result,
                default_error_code='TRANSFORM_ASSET_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with the WorldBuilder Extension on port 8899?',
                details={'operation': 'transform_asset'},
            )

    async def _batch_info(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get detailed information about a specific batch/group in the scene."""
        try:
            batch_name = args.get('batch_name')
            if not batch_name:
                return error_response(
                    'MISSING_PARAMETER',
                    'batch_name is required',
                    details={'parameter': 'batch_name'},
                )

            await self._initialize_client()
            result = await self.client.get("/batch_info", params={'batch_name': batch_name})
            return normalize_transport_response(
                'batch_info',
                result,
                default_error_code='BATCH_INFO_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running?',
                details={'operation': 'batch_info'},
            )

    async def _request_status(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get status of ongoing operations and request queue."""
        try:
            await self._initialize_client()
            result = await self.client.get("/request_status")
            return normalize_transport_response(
                'request_status',
                result,
                default_error_code='REQUEST_STATUS_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running?',
                details={'operation': 'request_status'},
            )

    async def _get_metrics(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get performance metrics and statistics from WorldBuilder extension."""
        try:
            format_type = args.get('format', 'json')

            endpoint = "/metrics.prom" if format_type == "prom" else "/metrics"
            await self._initialize_client()
            result = await self.client.get(endpoint)

            if format_type == "prom":
                prom_text = result.get('_raw_text', str(result))
                return {
                    'success': True,
                    'format': 'prometheus',
                    'metrics': prom_text,
                }

            return normalize_transport_response(
                'get_metrics',
                result,
                default_error_code='METRICS_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running?',
                details={'operation': 'get_metrics'},
            )

    async def _query_objects_by_type(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Query objects by semantic type (furniture, lighting, etc.)."""
        try:
            object_type = args.get('type')
            if not object_type:
                return error_response(
                    'MISSING_PARAMETER',
                    'type parameter is required',
                    details={'parameter': 'type'},
                )

            await self._initialize_client()
            params = {'type': object_type}
            result = await self.client.get(
                "/query/objects_by_type",
                params=params,
                timeout=self._get_timeout('simple')
            )

            return normalize_transport_response(
                'query_objects_by_type',
                result,
                default_error_code='QUERY_OBJECTS_BY_TYPE_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with WorldBuilder extension?',
                details={'operation': 'query_objects_by_type'},
            )

    async def _query_objects_in_bounds(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Query objects within spatial bounds."""
        try:
            min_bounds = args.get('min')
            max_bounds = args.get('max')

            if not min_bounds or not max_bounds:
                return error_response(
                    'VALIDATION_ERROR',
                    'Bounds must include both min and max values',
                    details={'received': {'min': min_bounds, 'max': max_bounds}},
                )

            if len(min_bounds) != 3 or len(max_bounds) != 3:
                return error_response(
                    'VALIDATION_ERROR',
                    'Bounds must be [x, y, z] coordinates',
                    details={'min': min_bounds, 'max': max_bounds},
                )

            params = {
                'min': ','.join(map(str, min_bounds)),
                'max': ','.join(map(str, max_bounds))
            }
            await self._initialize_client()
            result = await self.client.get(
                "/query/objects_in_bounds",
                params=params,
                timeout=self._get_timeout('simple')
            )
            return normalize_transport_response(
                'query_objects_in_bounds',
                result,
                default_error_code='QUERY_OBJECTS_IN_BOUNDS_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with WorldBuilder extension?',
                details={'operation': 'query_objects_in_bounds'},
            )

    async def _query_objects_near_point(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Query objects near a specific point within radius."""
        try:
            point = args.get('point')
            radius = args.get('radius', 5.0)

            if not point:
                return error_response(
                    'MISSING_PARAMETER',
                    'point parameter is required',
                    details={'parameter': 'point'},
                )

            if len(point) != 3:
                return error_response(
                    'VALIDATION_ERROR',
                    'point must be [x, y, z] coordinates',
                    details={'point': point},
                )

            params = {
                'point': ','.join(map(str, point)),
                'radius': radius
            }
            await self._initialize_client()
            result = await self.client.get(
                "/query/objects_near_point",
                params=params,
                timeout=self._get_timeout('simple')
            )
            return normalize_transport_response(
                'query_objects_near_point',
                result,
                default_error_code='QUERY_OBJECTS_NEAR_POINT_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with WorldBuilder extension?',
                details={'operation': 'query_objects_near_point'},
            )

    async def _calculate_bounds(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate combined bounding box for multiple objects."""
        try:
            objects = args.get('objects', [])

            if not objects:
                return error_response(
                    'MISSING_PARAMETER',
                    'objects list is required',
                    details={'parameter': 'objects'},
                )

            if not isinstance(objects, list) or len(objects) < 1:
                return error_response(
                    'VALIDATION_ERROR',
                    'objects must be a non-empty list',
                    details={'objects': objects},
                )

            payload = {"objects": objects}
            await self._initialize_client()
            result = await self.client.post(
                "/transform/calculate_bounds",
                json=payload,
                timeout=self._get_timeout('standard')
            )
            return normalize_transport_response(
                'calculate_bounds',
                result,
                default_error_code='CALCULATE_BOUNDS_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with WorldBuilder extension?',
                details={'operation': 'calculate_bounds'},
            )

    async def _find_ground_level(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Find ground level at position using consensus algorithm."""
        try:
            position = args.get('position')
            search_radius = args.get('search_radius', 10.0)

            if not position:
                return error_response(
                    'MISSING_PARAMETER',
                    'position parameter is required',
                    details={'parameter': 'position'},
                )

            if len(position) != 3:
                return error_response(
                    'VALIDATION_ERROR',
                    'position must be [x, y, z] coordinates',
                    details={'position': position},
                )

            payload = {
                "position": position,
                "search_radius": search_radius
            }
            await self._initialize_client()
            result = await self.client.post(
                "/transform/find_ground_level",
                json=payload,
                timeout=self._get_timeout('standard')
            )
            return normalize_transport_response(
                'find_ground_level',
                result,
                default_error_code='FIND_GROUND_LEVEL_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with WorldBuilder extension?',
                details={'operation': 'find_ground_level'},
            )

    async def _align_objects(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Align objects along specified axis with optional spacing."""
        try:
            objects = args.get('objects', [])
            axis = args.get('axis')
            alignment = args.get('alignment', 'center')
            spacing = args.get('spacing')

            if not objects:
                return error_response(
                    'MISSING_PARAMETER',
                    'objects list is required',
                    details={'parameter': 'objects'},
                )

            if not axis:
                return error_response(
                    'MISSING_PARAMETER',
                    'axis is required (x, y, or z)',
                    details={'parameter': 'axis'},
                )

            if len(objects) < 2:
                return error_response(
                    'VALIDATION_ERROR',
                    'at least 2 objects required for alignment',
                    details={'objects': objects},
                )

            payload = {
                "objects": objects,
                "axis": axis,
                "alignment": alignment
            }
            if spacing is not None:
                payload["spacing"] = spacing

            await self._initialize_client()
            result = await self.client.post(
                "/transform/align_objects",
                json=payload,
                timeout=self._get_timeout('standard')
            )
            return normalize_transport_response(
                'align_objects',
                result,
                default_error_code='ALIGN_OBJECTS_FAILED',
            )

        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with WorldBuilder extension?',
                details={'operation': 'align_objects'},
            )

    async def _metrics_prometheus(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Get WorldBuilder metrics in Prometheus format for monitoring systems."""
        try:
            await self._initialize_client()
            result = await self.client.get("/metrics.prom", timeout=self._get_timeout('fast'))
            prom_text = result.get('_raw_text', str(result))
            return {
                'success': True,
                'format': 'prometheus',
                'metrics': prom_text,
            }
        except aiohttp.ClientError as e:
            return error_response(
                'CONNECTION_ERROR',
                f'Connection error: {e}. Is Isaac Sim running with WorldBuilder extension?',
                details={'operation': 'metrics_prometheus'},
            )

# Initialize server instance
worldbuilder_server = WorldBuilderMCP()

# Module-level helpers to ensure robust tool execution even if class attributes change
async def _scene_status(args: Dict[str, Any]) -> Dict[str, Any]:
    """Get scene health status (module-level helper)."""
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server.client.get('/scene_status', timeout=5)
    return normalize_transport_response(
        'scene_status',
        result,
        default_error_code='SCENE_STATUS_FAILED',
    )

# FastMCP tool definitions using decorators
@mcp.tool()
async def worldbuilder_add_element(
    element_type: str,
    name: str,
    position: List[float],
    color: List[float] = [0.5, 0.5, 0.5],
    scale: List[float] = [1.0, 1.0, 1.0],
    parent_path: str = "/World"
) -> Dict[str, Any]:
    """Add individual 3D elements (cubes, spheres, cylinders) to Isaac Sim scene.

    Args:
        element_type: Type of 3D primitive to create (cube, sphere, cylinder, cone)
        name: Unique name for the element
        position: XYZ position [x, y, z] in world coordinates (exactly 3 items required)
        color: RGB color [r, g, b] values between 0-1 (exactly 3 items required)
        scale: XYZ scale [x, y, z] multipliers (exactly 3 items required)
        parent_path: USD parent path for hierarchical placement (optional, defaults to /World)
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._add_element({
        "element_type": element_type,
        "name": name,
        "position": position,
        "color": color,
        "scale": scale,
        "parent_path": parent_path
    })
    return result

@mcp.tool()
async def worldbuilder_create_batch(
    batch_name: str,
    elements: List[Dict[str, Any]],
    parent_path: str = "/World"
) -> Dict[str, Any]:
    """Create hierarchical batches of objects (furniture sets, buildings, etc.).

    Args:
        batch_name: Name for the batch/group
        elements: List of elements to create as a batch
        parent_path: USD path for the parent group
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._create_batch({
        "batch_name": batch_name,
        "elements": elements,
        "parent_path": parent_path
    })
    return result

@mcp.tool()
async def worldbuilder_remove_element(usd_path: str) -> Dict[str, Any]:
    """Remove specific elements from Isaac Sim scene by USD path.

    Args:
        usd_path: USD path of element to remove (e.g., '/World/my_cube')
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._remove_element({"usd_path": usd_path})
    return result

@mcp.tool()
async def worldbuilder_clear_scene(path: str = "/World", confirm: bool = False) -> Dict[str, Any]:
    """Clear entire scenes or specific paths (bulk removal).

    Args:
        path: USD path to clear (e.g., '/World' for entire scene)
        confirm: Confirmation flag for destructive operation
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._clear_scene({"path": path, "confirm": confirm})
    return result

@mcp.tool()
async def worldbuilder_clear_path(path: str, confirm: bool = False) -> Dict[str, Any]:
    """Surgical removal of specific USD stage paths. More precise than clear_scene for targeted hierarchy cleanup.

    Args:
        path: Specific USD path to remove (e.g., '/World/Buildings/House1', '/World/incomplete_batch')
        confirm: Confirmation flag for destructive operation
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._clear_path({"path": path, "confirm": confirm})
    return result

@mcp.tool()
async def worldbuilder_get_scene(include_metadata: bool = True) -> Dict[str, Any]:
    """Get complete scene structure with hierarchical details.

    Args:
        include_metadata: Include detailed metadata for each element
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._get_scene({"include_metadata": include_metadata})
    return result

@mcp.tool()
async def worldbuilder_scene_status() -> Dict[str, Any]:
    """Get scene health status and basic statistics."""
    await worldbuilder_server._initialize_client()
    result = await _scene_status({})
    return result

@mcp.tool()
async def worldbuilder_list_elements(filter_type: str = "") -> Dict[str, Any]:
    """Get flat listing of all scene elements.

    Args:
        filter_type: Filter by element type (cube, sphere, etc.)
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._list_elements({"filter_type": filter_type})
    return result

@mcp.tool()
async def worldbuilder_health_check() -> Dict[str, Any]:
    """Check Isaac Sim WorldBuilder Extension health and API status."""
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._health_check({})
    return result

@mcp.tool()
async def worldbuilder_place_asset(
    name: str,
    asset_path: str,
    prim_path: str = "",
    position: List[float] = [0, 0, 0],
    rotation: List[float] = [0, 0, 0],
    scale: List[float] = [1, 1, 1]
) -> Dict[str, Any]:
    """Place USD assets in Isaac Sim scene via reference.

    Args:
        name: Unique name for the asset instance
        asset_path: Path to USD asset file (e.g., '/path/to/asset.usd')
        prim_path: Target prim path in scene (e.g., '/World/my_asset')
        position: XYZ position [x, y, z] in world coordinates (exactly 3 items required)
        rotation: XYZ rotation [rx, ry, rz] in degrees (exactly 3 items required)
        scale: XYZ scale [x, y, z] multipliers (exactly 3 items required)
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._place_asset({
        "name": name,
        "asset_path": asset_path,
        "prim_path": prim_path or name,
        "position": position,
        "rotation": rotation,
        "scale": scale
    })
    return result

@mcp.tool()
async def worldbuilder_transform_asset(
    prim_path: str,
    position: List[float] = None,
    rotation: List[float] = None,
    scale: List[float] = None
) -> Dict[str, Any]:
    """Transform existing assets in Isaac Sim scene (move, rotate, scale).

    Args:
        prim_path: USD path of existing asset to transform (e.g., '/World/my_asset')
        position: New XYZ position [x, y, z] in world coordinates (optional)
        rotation: New XYZ rotation [rx, ry, rz] in degrees (optional, exactly 3 items required)
        scale: New XYZ scale [x, y, z] multipliers (optional)
    """
    args = {"prim_path": prim_path}
    if position is not None:
        args["position"] = position
    if rotation is not None:
        args["rotation"] = rotation
    if scale is not None:
        args["scale"] = scale

    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._transform_asset(args)
    return result

@mcp.tool()
async def worldbuilder_batch_info(batch_name: str) -> Dict[str, Any]:
    """Get detailed information about a specific batch/group in the scene.

    Args:
        batch_name: Name of the batch to get information about
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._batch_info({"batch_name": batch_name})
    return result

@mcp.tool()
async def worldbuilder_request_status() -> Dict[str, Any]:
    """Get status of ongoing operations and request queue."""
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._request_status({})
    return result

@mcp.tool()
async def worldbuilder_get_metrics(format_type: str = "json") -> Dict[str, Any]:
    """Get performance metrics and statistics from WorldBuilder extension.

    Args:
        format_type: Output format: json for structured data, prom for Prometheus format
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._get_metrics({"format": format_type})
    return result

@mcp.tool()
async def worldbuilder_query_objects_by_type(object_type: str) -> Dict[str, Any]:
    """Query objects by semantic type (furniture, lighting, primitive, etc.).

    Args:
        object_type: Object type to search for (e.g. 'furniture', 'lighting', 'decoration', 'architecture', 'vehicle', 'primitive')
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._query_objects_by_type({"type": object_type})
    return result

@mcp.tool()
async def worldbuilder_query_objects_in_bounds(
    min_bounds: List[float],
    max_bounds: List[float]
) -> Dict[str, Any]:
    """Query objects within spatial bounds (3D bounding box).

    Args:
        min_bounds: Minimum bounds [x, y, z]
        max_bounds: Maximum bounds [x, y, z]
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._query_objects_in_bounds({
        "min": min_bounds,
        "max": max_bounds
    })
    return result

@mcp.tool()
async def worldbuilder_query_objects_near_point(
    point: List[float],
    radius: float = 5.0
) -> Dict[str, Any]:
    """Query objects near a specific point within radius.

    Args:
        point: Point coordinates [x, y, z]
        radius: Search radius in world units
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._query_objects_near_point({
        "point": point,
        "radius": radius
    })
    return result

@mcp.tool()
async def worldbuilder_calculate_bounds(objects: List[str]) -> Dict[str, Any]:
    """Calculate combined bounding box for multiple objects. Useful for understanding spatial extent of object groups.

    Args:
        objects: List of USD paths to objects (e.g., ['/World/cube1', '/World/sphere1'])
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._calculate_bounds({"objects": objects})
    return result

@mcp.tool()
async def worldbuilder_find_ground_level(
    position: List[float],
    search_radius: float = 10.0
) -> Dict[str, Any]:
    """Find ground level at a position using consensus algorithm. Analyzes nearby objects to determine appropriate ground height.

    Args:
        position: Position coordinates [x, y, z]
        search_radius: Search radius for ground detection
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._find_ground_level({
        "position": position,
        "search_radius": search_radius
    })
    return result

@mcp.tool()
async def worldbuilder_align_objects(
    objects: List[str],
    axis: str,
    alignment: str = "center",
    spacing: float = None
) -> Dict[str, Any]:
    """Align objects along specified axis (x, y, z) with optional uniform spacing. Useful for organizing object layouts.

    Args:
        objects: List of USD paths to objects to align
        axis: Axis to align along (x=left-right, y=up-down, z=forward-back)
        alignment: Alignment type: min (left/bottom/front), max (right/top/back), center (middle)
        spacing: Uniform spacing between objects (optional)
    """
    args = {
        "objects": objects,
        "axis": axis,
        "alignment": alignment
    }
    if spacing is not None:
        args["spacing"] = spacing

    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._align_objects(args)
    return result

@mcp.tool()
async def worldbuilder_metrics_prometheus() -> Dict[str, Any]:
    """Get WorldBuilder metrics in Prometheus format for monitoring systems."""
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._metrics_prometheus({})
    return result

async def main():
    """Main entry point for the FastMCP server."""
    # Unified logging (stderr by default; env-driven options)
    setup_logging('worldbuilder')
    logger.info("🚀 Starting Isaac Sim WorldBuilder MCP Server (FastMCP)")

    # Get port from environment variable
    port = int(os.getenv("MCP_SERVER_PORT", 8700))

    # Create the FastMCP ASGI application for Streamable HTTP transport
    app = mcp.streamable_http_app

    logger.info(f"WorldBuilder MCP Server starting on http://0.0.0.0:{port}")
    logger.info("Using modern FastMCP with Streamable HTTP transport")

    # Run with uvicorn
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()

if __name__ == "__main__":
    asyncio.run(main())
