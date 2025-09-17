#!/usr/bin/env python3
"""
MCP Server for WorldSurveyor - Spatial selection and waypoint management

Provides MCP tools for creating, managing, and organizing spatial waypoints
in Isaac Sim for AI-collaborative 3D scene creation.

Key Features:
- Create waypoints at specified positions with different types
- List and filter waypoints by type and location
- Manage spatial selections and click-to-create mode
- Search for waypoints near positions
- Clear and organize waypoint collections

This server communicates with the WorldSurveyor Isaac Sim extension via HTTP API
to provide natural language access to spatial selection capabilities.
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

# Import shared modules
from logging_setup import setup_logging
from mcp_base_client import MCPBaseClient

# Add agentworld-extensions to path for unified config
extensions_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'agentworld-extensions')
if os.path.exists(extensions_path) and extensions_path not in sys.path:
    sys.path.insert(0, extensions_path)

try:
    from agent_world_config import create_worldsurveyor_config
    config = create_worldsurveyor_config()
except ImportError:
    # Fallback if unified config not available
    config = None


# Configure logging with unified system
logger = logging.getLogger(__name__)

# Create FastMCP server instance
mcp = FastMCP("worldsurveyor")


class WorldSurveyorMCP:
    """
    MCP server for WorldSurveyor spatial selection and waypoint management.

    Provides natural language interface to WorldSurveyor extension running in Isaac Sim.
    Enables creation, management, and organization of spatial waypoints for AI-collaborative
    3D scene creation workflows.
    """

    def __init__(self, base_url: str = "http://localhost:8891"):
        """
        Initialize WorldSurveyor MCP server.

        Args:
            base_url: Base URL of WorldSurveyor HTTP API
        """
        self.base_url = base_url.rstrip('/')

        # Initialize unified auth client
        self.client = MCPBaseClient("WORLDSURVEYOR", self.base_url)

        logger.info(f"WorldSurveyor MCP initialized with base_url: {self.base_url}")

    async def _initialize_client(self):
        """Initialize the unified auth client"""
        if not self.client._initialized:
            await self.client.initialize()

    async def __aenter__(self):
        """Async context manager entry"""
        await self._initialize_client()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        await self.client.close()
    
    def _get_timeout(self, operation_type: str = 'standard') -> float:
        """Uniform timeout helper to match other services."""
        defaults = {
            'simple': 5.0,      # health, small GETs
            'standard': 10.0,   # typical operations
            'complex': 30.0,    # imports/exports
        }
        return defaults.get(operation_type, defaults['standard'])
    
    async def _create_waypoint(self, args: Dict[str, Any]) -> str:
        """Create a new waypoint."""
        try:
            await self._initialize_client()
            result = await self.client.post("/waypoints/create", json=args)

            if result.get('success'):
                waypoint_id = result.get('waypoint_id', 'unknown')
                position = args.get('position', [0, 0, 0])
                waypoint_type = args.get('waypoint_type', 'point_of_interest')
                name = args.get('name', 'Auto-generated')

                return (f"📍 **Waypoint Created Successfully!**\n\n"
                        f"• **ID:** {waypoint_id}\n"
                        f"• **Name:** {name}\n"
                        f"• **Type:** {waypoint_type.replace('_', ' ').title()}\n"
                        f"• **Position:** [{position[0]:.2f}, {position[1]:.2f}, {position[2]:.2f}]\n"
                        f"• **Status:** {result.get('message', 'Ready for use')}")
            else:
                return f"❌ Failed to create waypoint: {result.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return f"❌ Connection error: {str(e)}"
        except Exception as e:
            return f"❌ Error creating waypoint: {str(e)}"
    
    async def _list_waypoints(self, args: Dict[str, Any]) -> str:
        """List waypoints with optional filtering."""
        try:
            params = {}
            if 'waypoint_type' in args:
                params['waypoint_type'] = args['waypoint_type']
            
            await self._initialize_client()
            result = await self.client.get("/waypoints/list", params=params)
            
            if result.get('success'):
                waypoints = result.get('waypoints', [])
                count = result.get('count', 0)
                
                if count == 0:
                    filter_text = f" of type '{args.get('waypoint_type', 'any')}'" if 'waypoint_type' in args else ""
                    return (f"📍 No waypoints found{filter_text}"
        )
                
                # Format waypoint list
                waypoint_lines = []
                for waypoint in waypoints:
                    pos = waypoint.get('position', [0, 0, 0])
                    target = waypoint.get('target', [0, 0, 0])
                    waypoint_type = waypoint.get('waypoint_type', 'unknown').replace('_', ' ').title()
                    name = waypoint.get('name', 'Unnamed')
                    waypoint_id = waypoint.get('id', 'unknown')
                    
                    # For waypoints with target (camera_position and directional_lighting), show both position and target
                    if waypoint.get('waypoint_type') in ['camera_position', 'directional_lighting']:
                        waypoint_lines.append(
                            f"• **{name}** ({waypoint_type}) [ID: {waypoint_id}]\n"
                            f"  Position: [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}]\n"
                            f"  Target: [{target[0]:.2f}, {target[1]:.2f}, {target[2]:.2f}]"
                        )
                    else:
                        waypoint_lines.append(
                            f"• {name} ({waypoint_type}) at [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}] [ID: {waypoint_id}]"
                        )
                
                filter_text = f" (filtered by {args.get('waypoint_type', 'any')})" if 'waypoint_type' in args else ""
                
                return (f"📍 Found {count} waypoint(s){filter_text}:\n\n" + "\n".join(waypoint_lines)
    )
            else:
                return (f"❌ Failed to list waypoints: {result.get('error', 'Unknown error')}"
    )
                
        except aiohttp.ClientError as e:
            return (f"❌ Connection error: {str(e)}"
)
        except Exception as e:
            return (f"❌ Error listing waypoints: {str(e)}"
)
    
    async def _health_check(self, args: Dict[str, Any]) -> str:
        """Check WorldSurveyor health status."""
        try:
            await self._initialize_client()
            result = await self.client.get("/health", timeout=self._get_timeout('simple'))
            
            if result.get('success'):
                service = result.get('service', 'Unknown')
                version = result.get('version', 'Unknown')
                url = result.get('url', 'Unknown')
                timestamp = result.get('timestamp', 'Unknown')
                waypoint_count = result.get('waypoint_count', 0)
                
                return (f"✅ WorldSurveyor Health\n"
                         f"• Service: {service}\n"
                         f"• Version: {version}\n"
                         f"• URL: {url}\n"
                         f"• Timestamp: {timestamp}\n"
                         f"• Waypoint Count: {waypoint_count}"
    )
            else:
                return (f"❌ Health check failed: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"🔌 **Connection Failed - Agent WorldSurveyor**\n\n"
                     f"❌ **Error:** {str(e)}\n\n"
                     f"💡 **Troubleshooting:**\n"
                     f"• Ensure Isaac Sim is running\n"
                     f"• Enable WorldSurveyor extension in Extension Manager\n"
                     f"• Verify API is running on: {self.base_url}\n"
                     f"• Check Isaac Sim logs for extension errors"
)
    
    async def _set_markers_visible(self, args: Dict[str, Any]) -> str:
        """Set waypoint marker visibility in the 3D scene."""
        try:
            visible = args['visible']
            
            payload = {"visible": visible}
            await self._initialize_client()
            result = await self.client.post("/markers/visible", json=payload)
            
            if result.get('success'):
                status = "shown" if visible else "hidden"
                return (f"👁️ Waypoint markers {status} successfully\n\n"
                         f"🎯 **Visual Context:** Waypoint markers provide spatial reference in the 3D scene\n"
                         f"• Red points: Camera position waypoints\n"
                         f"• Blue points: Points of interest\n"
                         f"• Green points: Asset placement markers\n"
                         f"• Markers are visible: {'✅ Yes' if visible else '❌ No'}"
    )
            else:
                return (f"❌ Failed to set marker visibility: {result.get('error', 'Unknown error')}"
    )
                
        except aiohttp.ClientError as e:
            return (f"❌ Connection error: {str(e)}"
)
        except Exception as e:
            return (f"❌ Error setting marker visibility: {str(e)}"
)
    
    async def _debug_status(self, args: Dict[str, Any]) -> str:
        """Get debug draw system status and marker information."""
        try:
            await self._initialize_client()
            result = await self.client.get("/markers/debug")
            
            if result.get('success'):
                debug_status = result.get('debug_status', {})
                waypoint_count = result.get('waypoint_count', 0)
                
                available = debug_status.get('available', False)
                num_points = debug_status.get('num_points', 0)
                markers_visible = debug_status.get('markers_visible', False)
                tracked_markers = debug_status.get('tracked_markers', 0)
                
                status_text = "🔍 **Debug Draw System Status**\n\n"
                status_text += f"• Debug Draw Available: {'✅ Yes' if available else '❌ No'}\n"
                
                if available:
                    status_text += f"• Active Debug Points: {num_points}\n"
                    status_text += f"• Waypoint Markers Visible: {'✅ Yes' if markers_visible else '❌ No'}\n"
                    status_text += f"• Tracked Markers: {tracked_markers}\n"
                    status_text += f"• Total Waypoints: {waypoint_count}\n\n"
                    
                    if not markers_visible and waypoint_count > 0:
                        status_text += "💡 **Tip:** Use `worldsurveyor_set_markers_visible` to show waypoint markers for better spatial context"
                else:
                    error = debug_status.get('error', 'Unknown error')
                    status_text += f"• Error: {error}\n\n"
                    status_text += "💡 **Troubleshooting:**\n"
                    status_text += "• Ensure `isaacsim.util.debug_draw` extension is enabled\n"
                    status_text += "• Check Isaac Sim Extension Manager"
                
                return (status_text
    )
            else:
                return (f"❌ Failed to get debug status: {result.get('error', 'Unknown error')}"
    )
                
        except aiohttp.ClientError as e:
            return (f"❌ Connection error: {str(e)}"
)
        except Exception as e:
            return (f"❌ Error getting debug status: {str(e)}"
)
    
    async def _update_waypoint(self, args: Dict[str, Any]) -> str:
        """Update waypoint name, notes, or metadata."""
        try:
            waypoint_id = args.get('waypoint_id')
            if not waypoint_id:
                return ("❌ Error: waypoint_id is required"
    )
            
            await self._initialize_client()
            result = await self.client.post("/waypoints/update",
                json=args,
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                waypoint = result.get('waypoint', {})
                notes = waypoint.get('metadata', {}).get('notes', '')
                notes_text = f"\nNotes: {notes}" if notes else ""
                
                return (f"✅ Waypoint {waypoint_id} updated successfully\n"
                         f"Name: {waypoint.get('name', 'Unknown')}"
                         f"{notes_text}"
    )
            else:
                return (f"❌ Error updating waypoint: {result.get('error', 'Unknown error')}"
    )
                
        except aiohttp.ClientError as e:
            return (f"❌ Connection error: {str(e)}"
)
        except Exception as e:
            return (f"❌ Error updating waypoint: {str(e)}"
)
    
    async def _clear_all_waypoints(self, args: Dict[str, Any]) -> str:
        """Clear all waypoints from the scene."""
        try:
            confirm = args.get('confirm', False)
            if not confirm:
                return ("⚠️ **Confirmation Required**\n\n"
                         "This operation will permanently delete ALL waypoints from the scene.\n"
                         "To proceed, call this tool with `confirm: true`.\n\n"
                         "This action cannot be undone!"
    )
            
            await self._initialize_client()
            result = await self.client.post("/waypoints/clear",
                json={"confirm": True},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                cleared_count = result.get('cleared_count', 0)
                return (f"🧹 **All Waypoints Cleared Successfully**\n\n"
                         f"• **Waypoints Removed:** {cleared_count}\n"
                         f"• **Scene Status:** Clean slate ready for new waypoints\n"
                         f"• **Markers:** All visual markers removed from 3D scene\n\n"
                         f"✨ The scene is now ready for fresh spatial planning!"
    )
            else:
                return (f"❌ Failed to clear waypoints: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error clearing waypoints: {str(e)}"
)
    
    async def _remove_waypoint(self, args: Dict[str, Any]) -> str:
        """Remove a specific waypoint from the scene."""
        try:
            waypoint_id = args.get('waypoint_id')
            if not waypoint_id:
                return ("❌ Error: waypoint_id is required"
    )
            
            result = await self.client.post(
                "/waypoints/remove",
                json={"waypoint_id": waypoint_id},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                return (f"🗑️ **Waypoint Removed Successfully**\n\n"
                         f"• **Waypoint ID:** {waypoint_id}\n"
                         f"• **Status:** {result.get('message', 'Waypoint removed from scene')}\n"
                         f"• **Marker:** Visual marker cleared from 3D scene"
    )
            else:
                return (f"❌ Failed to remove waypoint: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error removing waypoint: {str(e)}"
)
    
    async def _set_individual_marker_visible(self, args: Dict[str, Any]) -> str:
        """Show or hide a specific waypoint marker."""
        try:
            waypoint_id = args.get('waypoint_id')
            visible = args.get('visible')
            
            if not waypoint_id:
                return ("❌ Error: waypoint_id is required"
    )
            
            if visible is None:
                return ("❌ Error: visible parameter is required"
    )
            
            result = await self.client.post(
                "/markers/individual",
                json={"waypoint_id": waypoint_id, "visible": visible},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                status = "shown" if visible else "hidden"
                return (f"👁️ **Individual Marker {status.title()}**\n\n"
                         f"• **Waypoint ID:** {waypoint_id}\n"
                         f"• **Marker Status:** {status.title()}\n"
                         f"• **Message:** {result.get('message', f'Marker {status}')}"
    )
            else:
                return (f"❌ Failed to set marker visibility: {result.get('error', 'Unknown error')}"
    )
                
        except aiohttp.ClientError as e:
            return (f"❌ Connection error: {str(e)}"
)
        except Exception as e:
            return (f"❌ Error setting marker visibility: {str(e)}"
)
    
    async def _set_selective_markers_visible(self, args: Dict[str, Any]) -> str:
        """Show only specific waypoints while hiding all others."""
        try:
            visible_waypoint_ids = args.get('visible_waypoint_ids', [])
            
            if not isinstance(visible_waypoint_ids, list):
                return ("❌ Error: visible_waypoint_ids must be an array"
    )
            
            if len(visible_waypoint_ids) == 0:
                return ("❌ Error: at least one waypoint ID must be provided"
    )
            
            result = await self.client.post(
                "/markers/selective",
                json={"visible_waypoint_ids": visible_waypoint_ids},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                return (f"🎯 **Selective Visibility Activated**\n\n"
                         f"• **Visible Waypoints:** {len(visible_waypoint_ids)}\n"
                         f"• **Waypoint IDs:** {', '.join(visible_waypoint_ids[:5])}{'...' if len(visible_waypoint_ids) > 5 else ''}\n"
                         f"• **Mode:** Selective visibility (all other waypoints hidden)\n"
                         f"• **Status:** {result.get('message', 'Selective mode activated')}"
    )
            else:
                return (f"❌ Failed to set selective visibility: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error setting selective visibility: {str(e)}"
)
    
    async def _get_metrics(self, args: Dict[str, Any]) -> str:
        """Get API and system metrics for monitoring."""
        try:
            format_type = args.get('format', 'json')
            
            params = {}
            if format_type == 'prom':
                params['format'] = 'prom'
            
            result = await self.client.get(
                "/metrics",
                params=params,
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                metrics = result.get('metrics', {})
                
                if format_type == 'prom' and 'prometheus' in metrics:
                    # Return Prometheus format
                    return (f"📊 **WorldSurveyor Metrics (Prometheus Format)**\n\n"
                             f"```\n{metrics['prometheus']}\n```"
        )
                else:
                    # Return JSON format with formatted display
                    api_metrics = metrics.get('api', {})
                    waypoint_metrics = metrics.get('waypoints', {})
                    
                    uptime_seconds = api_metrics.get('uptime_seconds', 0)
                    uptime_minutes = int(uptime_seconds // 60)
                    uptime_hours = int(uptime_minutes // 60)
                    uptime_display = f"{uptime_hours}h {uptime_minutes % 60}m {uptime_seconds % 60:.0f}s"
                    
                    success_rate = 0
                    total_requests = api_metrics.get('requests_received', 0)
                    if total_requests > 0:
                        success_rate = (api_metrics.get('successful_requests', 0) / total_requests) * 100
                    
                    return (f"📊 **WorldSurveyor System Metrics**\n\n"
                             f"🔌 **API Performance:**\n"
                             f"• **Total Requests:** {total_requests:,}\n"
                             f"• **Successful:** {api_metrics.get('successful_requests', 0):,}\n"
                             f"• **Failed:** {api_metrics.get('failed_requests', 0):,}\n"
                             f"• **Success Rate:** {success_rate:.1f}%\n"
                             f"• **Server Port:** {api_metrics.get('port', 'Unknown')}\n"
                             f"• **Uptime:** {uptime_display}\n"
                             f"• **Status:** {'🟢 Running' if api_metrics.get('server_running', False) else '🔴 Stopped'}\n\n"
                             f"📍 **Waypoint Storage:**\n"
                             f"• **Total Waypoints:** {waypoint_metrics.get('count', 0):,}\n\n"
                             f"⏱️ **Last Updated:** {result.get('timestamp', 'Unknown')}"
        )
            else:
                return (f"❌ Failed to get metrics: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error getting metrics: {str(e)}"
)
    
    # =====================================================================
    # GROUP MANAGEMENT METHODS
    # =====================================================================
    
    async def _create_group(self, args: Dict[str, Any]) -> str:
        """Create a new waypoint group."""
        try:
            name = args.get('name')
            if not name:
                return ("❌ Error: Group name is required"
    )
            
            result = await self.client.post(
                "/groups/create",
                json=args,
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                group_id = result.get('group_id', 'unknown')
                parent_text = f" (child of {args.get('parent_group_id')})" if args.get('parent_group_id') else ""
                
                return (f"📁 **Group Created Successfully!**\n\n"
                         f"• **Group ID:** {group_id}\n"
                         f"• **Name:** {name}\n"
                         f"• **Description:** {args.get('description', 'No description')}\n"
                         f"• **Color:** {args.get('color', '#4A90E2')}\n"
                         f"• **Hierarchy:** {'Root level' if not args.get('parent_group_id') else f'Child group{parent_text}'}\n"
                         f"• **Status:** {result.get('message', 'Ready for waypoint organization')}"
    )
            else:
                return (f"❌ Failed to create group: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error creating group: {str(e)}"
)
    
    async def _list_groups(self, args: Dict[str, Any]) -> str:
        """List waypoint groups with optional parent filtering."""
        try:
            params = {}
            if 'parent_group_id' in args:
                params['parent_group_id'] = args['parent_group_id']
            
            result = await self.client.get(
                "/groups/list",
                params=params,
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                groups = result.get('groups', [])
                count = result.get('count', 0)
                
                if count == 0:
                    filter_text = f" under parent '{args.get('parent_group_id')}'" if 'parent_group_id' in args else ""
                    return (f"📁 No groups found{filter_text}"
        )
                
                # Format group list
                group_lines = []
                for group in groups:
                    name = group.get('name', 'Unnamed')
                    description = group.get('description', '')
                    color = group.get('color', '#4A90E2')
                    desc_text = f" - {description}" if description else ""
                    
                    group_lines.append(
                        f"• {name} (ID: {group.get('id', 'unknown')}) {color}{desc_text}"
                    )
                
                filter_text = f" (children of {args.get('parent_group_id')})" if 'parent_group_id' in args else " (root level)" if 'parent_group_id' not in args else ""
                
                return (f"📁 Found {count} group(s){filter_text}:\n\n" + "\n".join(group_lines)
    )
            else:
                return (f"❌ Failed to list groups: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error listing groups: {str(e)}"
)
    
    async def _get_group(self, args: Dict[str, Any]) -> str:
        """Get detailed information about a specific group."""
        try:
            group_id = args.get('group_id')
            if not group_id:
                return "❌ Error: group_id required"
            
            result = await self.client.get(
                "/groups/get",
                params={'group_id': group_id},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                group = result.get('group', {})
                name = group.get('name', 'Unnamed')
                description = group.get('description', 'No description')
                color = group.get('color', '#4A90E2')
                parent_id = group.get('parent_group_id', 'None')
                created = group.get('created_at', 'Unknown')
                waypoint_count = group.get('waypoint_count', 0)
                
                return (f"📁 **Group Details: {name}**\n\n" +
                         f"• ID: {group_id}\n" +
                         f"• Description: {description}\n" +
                         f"• Color: {color}\n" +
                         f"• Parent Group: {parent_id}\n" +
                         f"• Created: {created}\n" +
                         f"• Waypoints: {waypoint_count}"
    )
            else:
                return (f"❌ Failed to get group: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error listing groups: {str(e)}"
)
    
    async def _get_group_hierarchy(self, args: Dict[str, Any]) -> str:
        """Get complete group hierarchy as nested structure."""
        try:
            result = await self.client.get(
                "/groups/hierarchy",
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                hierarchy = result.get('hierarchy', [])
                total_groups = result.get('total_groups', 0)
                
                if total_groups == 0:
                    return ("📁 No groups found. Create groups to organize your waypoints hierarchically."
        )
                
                # Format hierarchy tree
                def format_hierarchy(groups, indent=0):
                    lines = []
                    prefix = "  " * indent
                    for group in groups:
                        name = group.get('name', 'Unnamed')
                        group_id = group.get('id', 'unknown')
                        description = group.get('description', '')
                        desc_text = f" - {description}" if description else ""
                        
                        lines.append(f"{prefix}📁 {name} (ID: {group_id}){desc_text}")
                        
                        # Add children recursively
                        children = group.get('children', [])
                        if children:
                            lines.extend(format_hierarchy(children, indent + 1))
                    
                    return lines
                
                hierarchy_lines = format_hierarchy(hierarchy)
                
                return (f"🌳 **Group Hierarchy** ({total_groups} total groups)\n\n" + "\n".join(hierarchy_lines)
    )
            else:
                return (f"❌ Failed to get group hierarchy: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error getting group hierarchy: {str(e)}"
)
    
    async def _remove_group(self, args: Dict[str, Any]) -> str:
        """Remove a waypoint group."""
        try:
            group_id = args.get('group_id')
            if not group_id:
                return ("❌ Error: Group ID is required"
    )
            
            cascade = args.get('cascade', False)
            
            result = await self.client.post(
                "/groups/remove",
                json={"group_id": group_id, "cascade": cascade},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                cascade_text = " and all child groups" if cascade else ""
                return (f"🗑️ **Group Removed Successfully**\n\n"
                         f"• **Group ID:** {group_id}\n"
                         f"• **Cascade:** {'Yes' if cascade else 'No'}{cascade_text}\n"
                         f"• **Status:** {result.get('message', 'Group removed from organization')}\n"
                         f"• **Waypoints:** Unassigned from removed group(s)"
    )
            else:
                return (f"❌ Failed to remove group: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error removing group: {str(e)}"
)
    
    async def _add_waypoint_to_groups(self, args: Dict[str, Any]) -> str:
        """Add waypoint to groups."""
        try:
            waypoint_id = args.get('waypoint_id')
            group_ids = args.get('group_ids', [])
            
            if not waypoint_id:
                return ("❌ Error: Waypoint ID is required"
    )
            if not group_ids:
                return ("❌ Error: At least one group ID is required"
    )
            
            result = await self.client.post(
                "/groups/add_waypoint",
                json={"waypoint_id": waypoint_id, "group_ids": group_ids},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                added_count = result.get('added_to_groups', 0)
                return (f"📍➕ **Waypoint Added to Groups**\n\n"
                         f"• **Waypoint ID:** {waypoint_id}\n"
                         f"• **Groups Added:** {added_count}/{len(group_ids)}\n"
                         f"• **Group IDs:** {', '.join(group_ids)}\n"
                         f"• **Status:** {result.get('message', 'Waypoint organized into groups')}"
    )
            else:
                return (f"❌ Failed to add waypoint to groups: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error adding waypoint to groups: {str(e)}"
)
    
    async def _remove_waypoint_from_groups(self, args: Dict[str, Any]) -> str:
        """Remove waypoint from groups."""
        try:
            waypoint_id = args.get('waypoint_id')
            group_ids = args.get('group_ids', [])
            
            if not waypoint_id:
                return ("❌ Error: Waypoint ID is required"
    )
            if not group_ids:
                return ("❌ Error: At least one group ID is required"
    )
            
            result = await self.client.post(
                "/groups/remove_waypoint",
                json={"waypoint_id": waypoint_id, "group_ids": group_ids},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                removed_count = result.get('removed_from_groups', 0)
                return (f"📍➖ **Waypoint Removed from Groups**\n\n"
                         f"• **Waypoint ID:** {waypoint_id}\n"
                         f"• **Groups Removed:** {removed_count}/{len(group_ids)}\n"
                         f"• **Group IDs:** {', '.join(group_ids)}\n"
                         f"• **Status:** {result.get('message', 'Waypoint unassigned from groups')}"
    )
            else:
                return (f"❌ Failed to remove waypoint from groups: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error removing waypoint from groups: {str(e)}"
)
    
    async def _get_waypoint_groups(self, args: Dict[str, Any]) -> str:
        """Get all groups that contain a waypoint."""
        try:
            waypoint_id = args.get('waypoint_id')
            if not waypoint_id:
                return ("❌ Error: Waypoint ID is required"
    )
            
            result = await self.client.get(
                "/groups/of_waypoint",
                params={"waypoint_id": waypoint_id},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                groups = result.get('groups', [])
                count = result.get('count', 0)
                
                if count == 0:
                    return (f"📍 Waypoint {waypoint_id} is not assigned to any groups"
        )
                
                # Format group memberships
                group_lines = []
                for group in groups:
                    name = group.get('name', 'Unnamed')
                    description = group.get('description', '')
                    desc_text = f" - {description}" if description else ""
                    
                    group_lines.append(f"• {name} (ID: {group.get('id', 'unknown')}){desc_text}")
                
                return (f"📍 **Waypoint Group Memberships**\n\n"
                         f"• **Waypoint ID:** {waypoint_id}\n"
                         f"• **Member of {count} group(s):**\n\n" + "\n".join(group_lines)
    )
            else:
                return (f"❌ Failed to get waypoint groups: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error getting waypoint groups: {str(e)}"
)
    
    async def _get_group_waypoints(self, args: Dict[str, Any]) -> str:
        """Get all waypoints in a group."""
        try:
            group_id = args.get('group_id')
            if not group_id:
                return ("❌ Error: Group ID is required"
    )
            
            include_nested = args.get('include_nested', False)
            
            result = await self.client.get(
                "/groups/waypoints",
                params={"group_id": group_id, "include_nested": str(include_nested).lower()},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                waypoints = result.get('waypoints', [])
                count = result.get('count', 0)
                
                if count == 0:
                    nested_text = " (including nested groups)" if include_nested else ""
                    return (f"📁 Group {group_id} contains no waypoints{nested_text}"
        )
                
                # Format waypoint list
                waypoint_lines = []
                for waypoint in waypoints:
                    pos = waypoint.get('position', [0, 0, 0])
                    waypoint_type = waypoint.get('waypoint_type', 'unknown').replace('_', ' ').title()
                    name = waypoint.get('name', 'Unnamed')
                    waypoint_id = waypoint.get('id', 'unknown')
                    
                    waypoint_lines.append(
                        f"• {name} ({waypoint_type}) at [{pos[0]:.2f}, {pos[1]:.2f}, {pos[2]:.2f}] (ID: {waypoint_id})"
                    )
                
                nested_text = f" (including nested groups)" if include_nested else ""
                
                return (f"📁 **Group Contents**\n\n"
                         f"• **Group ID:** {group_id}\n"
                         f"• **Waypoints:** {count}{nested_text}\n\n" + "\n".join(waypoint_lines)
    )
            else:
                return (f"❌ Failed to get group waypoints: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error getting group waypoints: {str(e)}"
)
    
    async def _export_waypoints(self, args: Dict[str, Any]) -> str:
        """Export waypoints and groups to JSON."""
        try:
            include_groups = args.get('include_groups', True)
            
            result = await self.client.get(
                "/waypoints/export",
                params={"include_groups": str(include_groups).lower()},
                timeout=15.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                export_data = result.get('export', {})
                waypoint_count = len(export_data.get('waypoints', []))
                group_count = len(export_data.get('groups', []) or [])
                
                # Format JSON for display
                export_json = json.dumps(export_data, indent=2)
                
                groups_text = f" and {group_count} groups" if include_groups else ""
                
                return (f"📤 **Waypoint Export Complete**\n\n"
                         f"• **Waypoints:** {waypoint_count}\n"
                         f"• **Groups:** {group_count if include_groups else 'Not included'}\n"
                         f"• **Export Size:** {len(export_json):,} characters\n\n"
                         f"**Exported Data:**\n```json\n{export_json[:2000]}{'...' if len(export_json) > 2000 else ''}\n```\n\n"
                         f"💾 Save this JSON data to import into other WorldSurveyor instances."
    )
            else:
                return (f"❌ Failed to export waypoints: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error exporting waypoints: {str(e)}"
)
    
    async def _import_waypoints(self, args: Dict[str, Any]) -> str:
        """Import waypoints and groups from JSON."""
        try:
            import_data = args.get('import_data')
            if not import_data:
                return ("❌ Error: Import data is required"
    )
            
            merge_mode = args.get('merge_mode', 'replace')
            
            result = await self.client.post(
                "/waypoints/import",
                json={"import_data": import_data, "merge_mode": merge_mode},
                timeout=30.0  # Longer timeout for import operations
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                imported_waypoints = result.get('imported_waypoints', 0)
                imported_groups = result.get('imported_groups', 0)
                errors = result.get('errors', 0)
                
                error_text = f"\n• **Errors:** {errors}" if errors > 0 else ""
                
                return (f"📥 **Import Complete**\n\n"
                         f"• **Mode:** {merge_mode.title()}\n"
                         f"• **Waypoints Imported:** {imported_waypoints}\n"
                         f"• **Groups Imported:** {imported_groups}{error_text}\n"
                         f"• **Status:** {result.get('message', 'Import successful')}\n\n"
                         f"🔄 Waypoint markers have been refreshed to reflect imported data."
    )
            else:
                return (f"❌ Failed to import waypoints: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error importing waypoints: {str(e)}"
)
    
    async def _goto_waypoint(self, args: Dict[str, Any]) -> str:
        """Navigate camera to a waypoint."""
        try:
            waypoint_id = args.get('waypoint_id')
            if not waypoint_id:
                return (
"❌ Error: waypoint_id is required"
    )
            
            result = await self.client.post(
                "/waypoints/goto",
                json={"waypoint_id": waypoint_id},
                timeout=10.0
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                return (f"📍 **Camera Navigation Successful!**\n\n"
                         f"• **Waypoint ID:** {waypoint_id}\n"
                         f"• **Status:** {result.get('message', 'Camera moved to waypoint')}"
    )
            else:
                return (f"❌ Failed to navigate to waypoint: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error navigating to waypoint: {str(e)}"
)
    
    
    
    async def _metrics(self, args: Dict[str, Any]) -> str:
        """Get metrics in JSON format."""
        try:
            result = await self.client.get(
                "/metrics",
                timeout=self._get_timeout('simple')
            )
            # Response already parsed by MCPBaseClient
            
            if result.get('success'):
                import json
                metrics_data = result.get('metrics', {})
                return (f"📊 **WorldSurveyor Metrics**\n\n```json\n{json.dumps(metrics_data, indent=2)}\n```"
    )
            else:
                return (f"❌ Failed to get metrics: {result.get('error', 'Unknown error')}"
    )
                
        except Exception as e:
            return (f"❌ Error getting metrics: {str(e)}"
)
    
    async def _metrics_prometheus(self, args: Dict[str, Any]) -> str:
        """Get metrics in Prometheus format."""
        try:
            await self._initialize_client()
            result = await self.client.get("/metrics.prom", timeout=self._get_timeout('simple'))
            metrics_text = result.get('_raw_text', str(result))
            return (f"📊 **WorldSurveyor Prometheus Metrics**\n\n```\n{metrics_text}\n```"
    )
                
        except Exception as e:
            return (f"❌ Error getting Prometheus metrics: {str(e)}"
)


# Server instance will be initialized in main()
worldsurveyor_server = None

# FastMCP tool definitions using decorators

@mcp.tool()
async def worldsurveyor_create_waypoint(
    position: List[float],
    waypoint_type: str = "point_of_interest",
    name: str = None,
    target: List[float] = None,
    metadata: Dict[str, Any] = None
) -> str:
    """Create a new spatial waypoint at specified position with type and metadata.

    Args:
        position: 3D position [x, y, z] for the waypoint (exactly 3 items required)
        waypoint_type: Type of waypoint (camera_position, directional_lighting, object_anchor, point_of_interest, selection_mark, lighting_position, audio_source, spawn_point)
        name: Optional custom name for the waypoint
        target: Optional target coordinates [x, y, z] for camera positioning
        metadata: Optional additional metadata for the waypoint
    """
    if worldsurveyor_server is None:
        raise RuntimeError("WorldSurveyor server not initialized")
    await worldsurveyor_server._initialize_client()
    if target is None:
        target = [0.0, 0.0, 0.0]
    args = {
        "position": position,
        "waypoint_type": waypoint_type,
        "name": name,
        "target": target,
        "metadata": metadata
    }
    result = await worldsurveyor_server._create_waypoint(args)
    return result

@mcp.tool()
async def worldsurveyor_list_waypoints(waypoint_type: str = None) -> str:
    """List all waypoints with optional filtering by type.

    Args:
        waypoint_type: Optional filter by waypoint type (camera_position, directional_lighting, object_anchor, point_of_interest, selection_mark, lighting_position, audio_source, spawn_point)
    """
    if worldsurveyor_server is None:
        raise RuntimeError("WorldSurveyor server not initialized")
    await worldsurveyor_server._initialize_client()
    args = {}
    if waypoint_type:
        args["waypoint_type"] = waypoint_type
    result = await worldsurveyor_server._list_waypoints(args)
    return result

@mcp.tool()
async def worldsurveyor_health_check() -> str:
    """Check WorldSurveyor extension health and API status."""
    if worldsurveyor_server is None:
        raise RuntimeError("WorldSurveyor server not initialized")
    await worldsurveyor_server._initialize_client()
    result = await worldsurveyor_server._health_check({})
    return result

@mcp.tool()
async def worldsurveyor_get_metrics(format: str = "json") -> str:
    """Get WorldSurveyor metrics in JSON or Prometheus format.

    Args:
        format: 'json' or 'prom'
    """
    if worldsurveyor_server is None:
        raise RuntimeError("WorldSurveyor server not initialized")
    await worldsurveyor_server._initialize_client()
    if format == "prom":
        return await worldsurveyor_server._metrics_prometheus({})
    return await worldsurveyor_server._metrics({})

@mcp.tool()
async def worldsurveyor_metrics_prometheus() -> str:
    """Get WorldSurveyor metrics in Prometheus format for monitoring systems."""
    if worldsurveyor_server is None:
        raise RuntimeError("WorldSurveyor server not initialized")
    await worldsurveyor_server._initialize_client()
    return await worldsurveyor_server._metrics_prometheus({})


async def main():
    """Main entry point for the FastMCP server."""
    # Unified logging (stderr by default; env-driven options)
    setup_logging('worldsurveyor')
    logger.info("🚀 Starting WorldSurveyor MCP Server (FastMCP)")

    # Get base URL with standardized env var, fallback to legacy name, then default
    base_url = (
        os.getenv("AGENT_WORLDSURVEYOR_BASE_URL")
        or os.getenv("WORLDSURVEYOR_API_URL")
        or "http://localhost:8891"
    )

    # Initialize the global server instance with the correct base URL
    global worldsurveyor_server
    worldsurveyor_server = WorldSurveyorMCP(base_url)

    # Get port from environment variable
    port = int(os.getenv("MCP_SERVER_PORT", 8703))

    # Create the FastMCP ASGI application
    app = mcp.streamable_http_app

    logger.info(f"WorldSurveyor MCP Server starting on http://0.0.0.0:{port}")
    logger.info("Using modern FastMCP with Streamable HTTP transport")

    # Run with uvicorn
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
