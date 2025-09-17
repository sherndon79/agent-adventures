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

    async def _health_check(self, args: Dict[str, Any]) -> str:
        """Check extension health and API status with standardized formatting."""
        try:
            await self._initialize_client()
            result = await self.client.get('/health', timeout=self._get_timeout('simple'))

            status_ok = bool(result.get("success"))
            status_text = "Healthy" if status_ok else "Unhealthy"
            icon = "✅" if status_ok else "❌"

            if status_ok:
                lines = [
                    f"{icon} WorldBuilder Health",
                    "",
                    f"**Service:** {result.get('service', 'Unknown')}",
                    f"**Version:** {result.get('version', 'Unknown')}",
                    f"**Status:** {status_text}",
                    f"**URL:** {result.get('url', 'Unknown')}",
                    f"**Timestamp:** {result.get('timestamp', 'Unknown')}",
                ]
                # Service-specific detail
                lines.append(f"**Scene Object Count:** {result.get('scene_object_count', 0)}")
                return "\n".join(lines)
            else:
                return f"{icon} WorldBuilder Health\n\n**Status:** {status_text}\n**Error:** {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with the WorldBuilder Extension on port 8899?"

    async def _add_element(self, args: Dict[str, Any]) -> str:
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

            if result.get("success"):
                return f"✅ Created {args['element_type']} '{args['name']}' at {args['position']}"
            else:
                return f"❌ Failed to create element: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with the WorldBuilder Extension?"

    def _sanitize_usd_name(self, name: str) -> str:
        """Sanitize name for USD path compatibility by replacing invalid characters."""
        import re
        # Replace spaces and other problematic characters with underscores
        sanitized = re.sub(r'[^a-zA-Z0-9_\-]', '_', name)
        # Ensure it doesn't start with a number
        if sanitized and sanitized[0].isdigit():
            sanitized = f"_{sanitized}"
        return sanitized

    async def _create_batch(self, args: Dict[str, Any]) -> str:
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

            if result.get("success"):
                # Show sanitization notice if name was changed
                if original_name != sanitized_name:
                    message = f"✅ Created batch '{sanitized_name}' with {len(args['elements'])} elements\n" \
                            f"📝 Note: Batch name sanitized from '{original_name}' for USD compatibility"
                else:
                    message = f"✅ Created batch '{sanitized_name}' with {len(args['elements'])} elements"

                return message
            else:
                return f"❌ Failed to create batch: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"

    async def _remove_element(self, args: Dict[str, Any]) -> str:
        """Remove specific element by USD path."""
        try:
            payload = {"element_path": args["usd_path"]}

            await self._initialize_client()
            result = await self.client.post(
                "/remove_element",
                json=payload,
                timeout=10
            )

            if result.get("success"):
                return f"✅ Removed element: {args['usd_path']}"
            else:
                return f"❌ Failed to remove element: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"

    async def _clear_scene(self, args: Dict[str, Any]) -> str:
        """Clear scene or specific paths."""
        if not args.get("confirm", False):
            return "❌ Destructive operation requires confirm=true parameter"

        try:
            payload = {"path": args.get("path", "/World")}

            await self._initialize_client()
            result = await self.client.post(
                "/clear_path",
                json=payload,
                timeout=10
            )

            if result.get("success"):
                return f"✅ Cleared path: {args.get('path', '/World')}"
            else:
                return f"❌ Failed to clear path: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"

    async def _clear_path(self, args: Dict[str, Any]) -> str:
        """Surgical removal of specific USD stage path."""
        path = args.get("path")
        if not path:
            return "❌ Error: path parameter is required"

        if not args.get("confirm", False):
            return "❌ Destructive operation requires confirm=true parameter"

        try:
            payload = {"path": path}

            await self._initialize_client()
            result = await self.client.post(
                "/clear_path",
                json=payload,
                timeout=10
            )

            if result.get("success"):
                return (f"🔧 **Surgical Path Removal Complete**\n\n"
                       f"• **Removed Path:** {path}\n"
                       f"• **Operation:** Targeted USD hierarchy cleanup\n"
                       f"• **Status:** {result.get('message', 'Path cleared successfully')}")
            else:
                return f"❌ Failed to clear path '{path}': {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"

    async def _get_scene(self, args: Dict[str, Any]) -> str:
        """Get complete scene structure."""
        try:
            await self._initialize_client()
            result = await self.client.get('/get_scene', timeout=10)

            if result.get("success"):
                # Extract the full result structure - extension returns hierarchy, statistics, metadata
                scene_data = {
                    "hierarchy": result.get("hierarchy", {}),
                    "statistics": result.get("statistics", {}),
                    "metadata": result.get("metadata", {})
                }
                formatted_scene = json.dumps(scene_data, indent=2)
                return f"📊 Scene Structure:\n```json\n{formatted_scene}\n```"
            else:
                return f"❌ Failed to get scene: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"

    async def _scene_status(self, args: Dict[str, Any]) -> str:
        """Get scene health status."""
        try:
            await self._initialize_client()
            result = await self.client.get('/scene_status', timeout=5)

            if result.get("success"):
                # Support both legacy { scene: { ... } } and flat fields
                scene = result.get("scene") or result
                # Elements
                prim_count = scene.get('prim_count')
                if prim_count is None:
                    prim_count = scene.get('total_prims', 0)
                # Assets (may not be provided by all versions)
                asset_count = scene.get('asset_count', 0)
                # Stage/health inference
                has_stage = scene.get('has_stage')
                if has_stage is None:
                    # Infer active stage from presence of prims or active batches
                    has_stage = bool(prim_count) or bool(scene.get('active_batches', 0))
                stage_text = 'Active' if has_stage else 'None'

                return (
                    "📊 Scene Status:\n"
                    f"• Stage: {stage_text}\n"
                    f"• Elements: {prim_count} prims\n"
                    f"• Assets: {asset_count} assets"
                )
            else:
                return f"❌ Failed to get status: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"

    async def _list_elements(self, args: Dict[str, Any]) -> str:
        """Get flat listing of scene elements."""
        try:
            await self._initialize_client()
            result = await self.client.get('/list_elements', timeout=10)

            if result.get("success"):
                elements = result.get("elements", [])
                if not elements:
                    return "📋 Scene is empty - no elements found"

                filter_type = args.get("filter_type", "")
                if filter_type:
                    elements = [e for e in elements if filter_type.lower() in e.get("type", "").lower()]

                element_list = "\n".join([
                    f"• {e.get('path', 'Unknown')} ({e.get('type', 'Unknown')})"
                    for e in elements
                ])

                return f"📋 Scene Elements ({len(elements)} found):\n{element_list}"
            else:
                return f"❌ Failed to list elements: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"

    async def _place_asset(self, args: Dict[str, Any]) -> str:
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

            if result.get("success"):
                return (f"✅ Asset placed successfully!\n"
                       f"• Name: {result.get('asset_name', 'Unknown')}\n"
                       f"• Path: {result.get('prim_path', 'Unknown')}\n"
                       f"• Position: {result.get('position', 'Unknown')}\n"
                       f"• Request ID: {result.get('request_id', 'Unknown')}\n"
                       f"• Status: {result.get('status', 'Unknown')}")
            else:
                return f"❌ Asset placement failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with the WorldBuilder Extension on port 8899?"

    async def _transform_asset(self, args: Dict[str, Any]) -> str:
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

            if result.get("success"):
                # Transform parameters from request for display
                transform_info = []
                if "position" in args:
                    transform_info.append(f"• Position: {args['position']}")
                if "rotation" in args:
                    transform_info.append(f"• Rotation: {args['rotation']}")
                if "scale" in args:
                    transform_info.append(f"• Scale: {args['scale']}")

                return (f"✅ Asset transformed successfully!\n"
                       f"• Path: {args['prim_path']}\n"
                       f"• Request ID: {result.get('request_id', 'Unknown')}\n"
                       f"• Message: {result.get('message', 'Transform completed')}\n"
                       + ("\n".join(transform_info) if transform_info else ""))
            else:
                return f"❌ Asset transformation failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with the WorldBuilder Extension on port 8899?"

    async def _batch_info(self, args: Dict[str, Any]) -> str:
        """Get detailed information about a specific batch/group in the scene."""
        try:
            batch_name = args.get('batch_name')
            if not batch_name:
                return "❌ Error: batch_name is required"

            await self._initialize_client()
            result = await self.client.get("/batch_info", params={'batch_name': batch_name})

            if result.get('success'):
                element_count = result.get('element_count', 0)
                batch_path = result.get('batch_path', 'Unknown')
                created_at = result.get('created_at')
                source = result.get('source', 'unknown')
                element_names = result.get('element_names', [])
                child_elements = result.get('child_elements', [])

                # Format creation time
                import datetime
                created_str = "Unknown"
                if created_at:
                    try:
                        created_str = datetime.datetime.fromtimestamp(created_at).strftime("%Y-%m-%d %H:%M:%S")
                    except:
                        created_str = str(created_at)

                # Format child element details (from stage discovery)
                element_details = []
                for elem in child_elements:
                    element_details.append(
                        f"  - **{elem.get('name', 'Unknown')}** ({elem.get('type', 'Unknown')})\n"
                        f"    Path: {elem.get('path', 'Unknown')}"
                    )

                # Fallback to old format for memory-tracked batches
                if not element_details and result.get('elements'):
                    for elem in result.get('elements', []):
                        pos = elem.get('position', [0, 0, 0])
                        element_details.append(
                            f"  - **{elem.get('name', 'Unknown')}** ({elem.get('type', 'Unknown')})\n"
                            f"    Position: [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}]"
                        )

                element_text = "\n".join(element_details) if element_details else "  (No elements found)"

                return (f"✅ **Batch Information: {batch_name}**\n"
                       f"• Batch Path: `{batch_path}`\n"
                       f"• Element Count: {element_count}\n"
                       f"• Created: {created_str}\n"
                       f"• Data Source: {source}\n"
                       f"• Element Names: {', '.join(element_names) if element_names else 'None'}\n\n"
                       f"**Child Elements:**\n{element_text}")
            else:
                return f"❌ Failed to get batch info: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running?"

    async def _request_status(self, args: Dict[str, Any]) -> str:
        """Get status of ongoing operations and request queue."""
        try:
            await self._initialize_client()
            result = await self.client.get("/request_status")

            if result.get('success'):
                status_data = result.get('status', {})
                queue_info = status_data.get('queue_info', {})
                return (f"✅ **Request Status**\n"
                       f"• Queue Size: {queue_info.get('pending', 0)}\n"
                       f"• Processing: {queue_info.get('active', 0)}\n"
                       f"• Completed: {queue_info.get('completed', 0)}\n"
                       f"• Failed: {queue_info.get('failed', 0)}\n"
                       f"• System Status: {status_data.get('system_status', 'Unknown')}")
            else:
                return f"❌ Failed to get request status: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running?"

    async def _get_metrics(self, args: Dict[str, Any]) -> str:
        """Get performance metrics and statistics from WorldBuilder extension."""
        try:
            format_type = args.get('format', 'json')

            endpoint = "/metrics.prom" if format_type == "prom" else "/metrics"
            await self._initialize_client()
            result = await self.client.get(endpoint)

            if format_type == "prom":
                # Uniform: use _raw_text from shared client for text/plain
                prom_text = result.get('_raw_text', str(result))
                return f"✅ **WorldBuilder Metrics (Prometheus)**\n```\n{prom_text}\n```"
            else:
                if result.get('success'):
                    metrics = result.get('metrics', {})
                    api_metrics = metrics.get('api', {})
                    scene_metrics = metrics.get('scene', {})
                    return (f"✅ **WorldBuilder Metrics**\n"
                           f"• **API Stats:**\n"
                           f"  - Requests: {api_metrics.get('requests_received', 0)}\n"
                           f"  - Successful: {api_metrics.get('successful_requests', 0)}\n"
                           f"  - Failed: {api_metrics.get('failed_requests', 0)}\n"
                           f"  - Uptime: {api_metrics.get('uptime_seconds', 0):.1f}s\n"
                           f"• **Scene Stats:**\n"
                           f"  - Elements: {scene_metrics.get('element_count', 0)}\n"
                           f"  - Batches: {scene_metrics.get('batch_count', 0)}")
                else:
                    return f"❌ Failed to get metrics: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running?"

    async def _query_objects_by_type(self, args: Dict[str, Any]) -> str:
        """Query objects by semantic type (furniture, lighting, etc.)."""
        try:
            object_type = args.get('type')
            if not object_type:
                return "❌ Error: type parameter is required"

            await self._initialize_client()
            params = {'type': object_type}
            result = await self.client.get(
                "/query/objects_by_type",
                params=params,
                timeout=self._get_timeout('simple')
            )

            if result.get('success'):
                objects = result.get('objects', [])
                count = result.get('count', 0)

                if count == 0:
                    return f"✅ **No objects found**\n• Type: {object_type}\n• Consider checking spelling or try broader categories like 'furniture', 'primitive', 'lighting'"

                # Format object list
                object_list = []
                for obj in objects[:10]:  # Limit to first 10 for readability
                    pos = obj.get('position', [0, 0, 0])
                    object_list.append(
                        f"  - **{obj.get('name', 'Unknown')}** ({obj.get('type', 'Unknown')})\n"
                        f"    Path: `{obj.get('path', 'Unknown')}`\n"
                        f"    Position: [{pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f}]"
                    )

                more_text = f"\n\n*Showing {min(10, count)} of {count} objects*" if count > 10 else ""

                return (f"✅ **Found {count} objects of type '{object_type}'**\n\n"
                       + "\n\n".join(object_list) + more_text)
            else:
                return f"❌ Query failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with WorldBuilder extension?"

    async def _query_objects_in_bounds(self, args: Dict[str, Any]) -> str:
        """Query objects within spatial bounds."""
        try:
            min_bounds = args.get('min')
            max_bounds = args.get('max')

            if not min_bounds or not max_bounds:
                return "❌ Error: min and max bounds are required"

            if len(min_bounds) != 3 or len(max_bounds) != 3:
                return "❌ Error: bounds must be [x,y,z] coordinates"

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

            if result.get('success'):
                objects = result.get('objects', [])
                count = result.get('count', 0)
                bounds = result.get('bounds', {})

                if count == 0:
                    return f"✅ **No objects found in bounds**\n• Min: [{min_bounds[0]}, {min_bounds[1]}, {min_bounds[2]}]\n• Max: [{max_bounds[0]}, {max_bounds[1]}, {max_bounds[2]}]"

                # Format object list
                object_list = []
                for obj in objects[:10]:  # Limit to first 10
                    pos = obj.get('position', [0, 0, 0])
                    object_list.append(
                        f"  - **{obj.get('name', 'Unknown')}** ({obj.get('type', 'Unknown')})\n"
                        f"    Position: [{pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f}]"
                    )

                more_text = f"\n\n*Showing {min(10, count)} of {count} objects*" if count > 10 else ""

                return (f"✅ **Found {count} objects in bounds**\n"
                       f"• Min: [{min_bounds[0]}, {min_bounds[1]}, {min_bounds[2]}]\n"
                       f"• Max: [{max_bounds[0]}, {max_bounds[1]}, {max_bounds[2]}]\n\n"
                       + "\n\n".join(object_list) + more_text)
            else:
                return f"❌ Query failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with WorldBuilder extension?"

    async def _query_objects_near_point(self, args: Dict[str, Any]) -> str:
        """Query objects near a specific point within radius."""
        try:
            point = args.get('point')
            radius = args.get('radius', 5.0)

            if not point:
                return "❌ Error: point parameter is required"

            if len(point) != 3:
                return "❌ Error: point must be [x,y,z] coordinates"

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

            if result.get('success'):
                objects = result.get('objects', [])
                count = result.get('count', 0)
                query_point = result.get('query_point', point)
                query_radius = result.get('radius', radius)

                if count == 0:
                    return f"✅ **No objects found near point**\n• Point: [{point[0]}, {point[1]}, {point[2]}]\n• Radius: {radius} units"

                # Format object list (sorted by distance)
                object_list = []
                for obj in objects[:10]:  # Limit to first 10
                    pos = obj.get('position', [0, 0, 0])
                    distance = obj.get('distance_from_point', 0)
                    object_list.append(
                        f"  - **{obj.get('name', 'Unknown')}** ({obj.get('type', 'Unknown')})\n"
                        f"    Distance: {distance:.1f} units\n"
                        f"    Position: [{pos[0]:.1f}, {pos[1]:.1f}, {pos[2]:.1f}]"
                    )

                more_text = f"\n\n*Showing {min(10, count)} of {count} objects (sorted by distance)*" if count > 10 else ""

                return (f"✅ **Found {count} objects near point**\n"
                       f"• Point: [{point[0]}, {point[1]}, {point[2]}]\n"
                       f"• Radius: {radius} units\n\n"
                       + "\n\n".join(object_list) + more_text)
            else:
                return f"❌ Query failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with WorldBuilder extension?"

    async def _calculate_bounds(self, args: Dict[str, Any]) -> str:
        """Calculate combined bounding box for multiple objects."""
        try:
            objects = args.get('objects', [])

            if not objects:
                return "❌ Error: objects list is required"

            if not isinstance(objects, list) or len(objects) < 1:
                return "❌ Error: objects must be a non-empty list"

            payload = {"objects": objects}
            await self._initialize_client()
            result = await self.client.post(
                "/transform/calculate_bounds",
                json=payload,
                timeout=self._get_timeout('standard')
            )

            if result.get('success'):
                bounds = result.get('bounds', {})
                count = result.get('object_count', 0)

                min_coords = bounds.get('min', [0, 0, 0])
                max_coords = bounds.get('max', [0, 0, 0])
                center = bounds.get('center', [0, 0, 0])
                size = bounds.get('size', [0, 0, 0])
                volume = result.get('volume', 0.0)

                return (f"✅ **Calculated combined bounds for {count} objects**\n\n"
                       f"• **Min bounds:** [{min_coords[0]:.2f}, {min_coords[1]:.2f}, {min_coords[2]:.2f}]\n"
                       f"• **Max bounds:** [{max_coords[0]:.2f}, {max_coords[1]:.2f}, {max_coords[2]:.2f}]\n"
                       f"• **Center:** [{center[0]:.2f}, {center[1]:.2f}, {center[2]:.2f}]\n"
                       f"• **Size (W×H×D):** {size[0]:.2f} × {size[1]:.2f} × {size[2]:.2f}\n"
                       f"• **Volume:** {volume:.2f} cubic units\n\n"
                       f"*Combined bounding box encompasses all {count} objects*")
            else:
                return f"❌ Bounds calculation failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with WorldBuilder extension?"

    async def _find_ground_level(self, args: Dict[str, Any]) -> str:
        """Find ground level at position using consensus algorithm."""
        try:
            position = args.get('position')
            search_radius = args.get('search_radius', 10.0)

            if not position:
                return "❌ Error: position is required"

            if len(position) != 3:
                return "❌ Error: position must be [x,y,z] coordinates"

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

            if result.get('success'):
                ground_y = result.get('ground_level', 0.0)
                method = result.get('detection_method', 'unknown')
                confidence = result.get('confidence', 0.0)
                reference_objects = result.get('reference_objects', [])

                method_desc = {
                    'consensus': 'Consensus from nearby objects',
                    'lowest_object': 'Lowest nearby object',
                    'surface_detection': 'Surface detection',
                    'default': 'Default ground level (no objects found)'
                }.get(method, method)

                reference_text = ""
                if reference_objects:
                    ref_list = [f"  - {obj}" for obj in reference_objects[:5]]
                    more_ref = f"\n  - *...and {len(reference_objects) - 5} more*" if len(reference_objects) > 5 else ""
                    reference_text = f"\n\n**Reference objects:**\n" + "\n".join(ref_list) + more_ref

                return (f"✅ **Ground level detected**\n\n"
                       f"• **Position:** [{position[0]}, {position[1]}, {position[2]}]\n"
                       f"• **Ground level (Y):** {ground_y:.2f}\n"
                       f"• **Detection method:** {method_desc}\n"
                       f"• **Confidence:** {confidence:.1%}\n"
                       f"• **Search radius:** {search_radius} units"
                       + reference_text)
            else:
                return f"❌ Ground level detection failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with WorldBuilder extension?"

    async def _align_objects(self, args: Dict[str, Any]) -> str:
        """Align objects along specified axis with optional spacing."""
        try:
            objects = args.get('objects', [])
            axis = args.get('axis')
            alignment = args.get('alignment', 'center')
            spacing = args.get('spacing')

            if not objects:
                return "❌ Error: objects list is required"

            if not axis:
                return "❌ Error: axis is required (x, y, or z)"

            if len(objects) < 2:
                return "❌ Error: at least 2 objects required for alignment"

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

            if result.get('success'):
                aligned_count = result.get('successful_alignments', 0)
                axis_used = result.get('axis', axis)
                alignment_used = result.get('alignment', alignment)
                spacing_used = result.get('spacing')
                transformations = result.get('alignment_results', [])

                axis_names = {'x': 'X (left-right)', 'y': 'Y (up-down)', 'z': 'Z (forward-back)'}
                axis_display = axis_names.get(axis_used, axis_used)

                alignment_names = {
                    'min': 'minimum (left/bottom/front)',
                    'max': 'maximum (right/top/back)',
                    'center': 'center (middle)'
                }
                alignment_display = alignment_names.get(alignment_used, alignment_used)

                spacing_text = ""
                if spacing_used is not None:
                    spacing_text = f"\n• **Spacing:** {spacing_used} units between objects"

                # Show transformation details
                transform_details = ""
                if transformations:
                    details = []
                    for t in transformations[:5]:  # Limit to first 5
                        old_pos = t.get('old_position', [0, 0, 0])
                        new_pos = t.get('new_position', [0, 0, 0])
                        details.append(
                            f"  - **{t.get('object', 'Unknown')}**\n"
                            f"    From: [{old_pos[0]:.2f}, {old_pos[1]:.2f}, {old_pos[2]:.2f}]\n"
                            f"    To: [{new_pos[0]:.2f}, {new_pos[1]:.2f}, {new_pos[2]:.2f}]"
                        )

                    more_details = f"\n\n*Showing 5 of {len(transformations)} transformations*" if len(transformations) > 5 else ""
                    transform_details = f"\n\n**Object movements:**\n" + "\n\n".join(details) + more_details

                return (f"✅ **Aligned {aligned_count} objects successfully**\n\n"
                       f"• **Axis:** {axis_display}\n"
                       f"• **Alignment:** {alignment_display}"
                       + spacing_text + transform_details)
            else:
                return f"❌ Object alignment failed: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with WorldBuilder extension?"

    async def _metrics_prometheus(self, args: Dict[str, Any]) -> str:
        """Get WorldBuilder metrics in Prometheus format for monitoring systems."""
        try:
            await self._initialize_client()
            result = await self.client.get("/metrics.prom", timeout=self._get_timeout('fast'))
            prom_text = result.get('_raw_text', str(result))
            return f"✅ **Prometheus Metrics Retrieved**\n\n```\n{prom_text}\n```"
        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}. Is Isaac Sim running with WorldBuilder extension?"

# Initialize server instance
worldbuilder_server = WorldBuilderMCP()

# Module-level helpers to ensure robust tool execution even if class attributes change
async def _scene_status(args: Dict[str, Any]) -> str:
    """Get scene health status (module-level helper)."""
    try:
        await worldbuilder_server._initialize_client()
        result = await worldbuilder_server.client.get('/scene_status', timeout=5)

        if result.get("success"):
            scene = result.get("scene") or result
            prim_count = scene.get('prim_count')
            if prim_count is None:
                prim_count = scene.get('total_prims', 0)
            asset_count = scene.get('asset_count', 0)
            has_stage = scene.get('has_stage')
            if has_stage is None:
                has_stage = bool(prim_count) or bool(scene.get('active_batches', 0))
            stage_text = 'Active' if has_stage else 'None'

            return (
                "📊 Scene Status:\n"
                f"• Stage: {stage_text}\n"
                f"• Elements: {prim_count} prims\n"
                f"• Assets: {asset_count} assets"
            )
        else:
            return f"❌ Failed to get status: {result.get('error', 'Unknown error')}"
    except aiohttp.ClientError as e:
        return f"❌ Connection error: {str(e)}"

# FastMCP tool definitions using decorators
@mcp.tool()
async def worldbuilder_add_element(
    element_type: str,
    name: str,
    position: List[float],
    color: List[float] = [0.5, 0.5, 0.5],
    scale: List[float] = [1.0, 1.0, 1.0],
    parent_path: str = "/World"
) -> str:
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
) -> str:
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
async def worldbuilder_remove_element(usd_path: str) -> str:
    """Remove specific elements from Isaac Sim scene by USD path.

    Args:
        usd_path: USD path of element to remove (e.g., '/World/my_cube')
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._remove_element({"usd_path": usd_path})
    return result

@mcp.tool()
async def worldbuilder_clear_scene(path: str = "/World", confirm: bool = False) -> str:
    """Clear entire scenes or specific paths (bulk removal).

    Args:
        path: USD path to clear (e.g., '/World' for entire scene)
        confirm: Confirmation flag for destructive operation
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._clear_scene({"path": path, "confirm": confirm})
    return result

@mcp.tool()
async def worldbuilder_clear_path(path: str, confirm: bool = False) -> str:
    """Surgical removal of specific USD stage paths. More precise than clear_scene for targeted hierarchy cleanup.

    Args:
        path: Specific USD path to remove (e.g., '/World/Buildings/House1', '/World/incomplete_batch')
        confirm: Confirmation flag for destructive operation
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._clear_path({"path": path, "confirm": confirm})
    return result

@mcp.tool()
async def worldbuilder_get_scene(include_metadata: bool = True) -> str:
    """Get complete scene structure with hierarchical details.

    Args:
        include_metadata: Include detailed metadata for each element
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._get_scene({"include_metadata": include_metadata})
    return result

@mcp.tool()
async def worldbuilder_scene_status() -> str:
    """Get scene health status and basic statistics."""
    await worldbuilder_server._initialize_client()
    result = await _scene_status({})
    return result

@mcp.tool()
async def worldbuilder_list_elements(filter_type: str = "") -> str:
    """Get flat listing of all scene elements.

    Args:
        filter_type: Filter by element type (cube, sphere, etc.)
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._list_elements({"filter_type": filter_type})
    return result

@mcp.tool()
async def worldbuilder_health_check() -> str:
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
) -> str:
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
) -> str:
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
async def worldbuilder_batch_info(batch_name: str) -> str:
    """Get detailed information about a specific batch/group in the scene.

    Args:
        batch_name: Name of the batch to get information about
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._batch_info({"batch_name": batch_name})
    return result

@mcp.tool()
async def worldbuilder_request_status() -> str:
    """Get status of ongoing operations and request queue."""
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._request_status({})
    return result

@mcp.tool()
async def worldbuilder_get_metrics(format_type: str = "json") -> str:
    """Get performance metrics and statistics from WorldBuilder extension.

    Args:
        format_type: Output format: json for structured data, prom for Prometheus format
    """
    await worldbuilder_server._initialize_client()
    result = await worldbuilder_server._get_metrics({"format": format_type})
    return result

@mcp.tool()
async def worldbuilder_query_objects_by_type(object_type: str) -> str:
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
) -> str:
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
) -> str:
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
async def worldbuilder_calculate_bounds(objects: List[str]) -> str:
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
) -> str:
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
) -> str:
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
async def worldbuilder_metrics_prometheus() -> str:
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
