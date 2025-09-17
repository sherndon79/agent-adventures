#!/usr/bin/env python3
"""
WorldStreamer MCP Server

Model Context Protocol server for Isaac Sim RTMP streaming control.
Provides AI agents with tools to manage streaming sessions through HTTP API.

Uses FastMCP with Streamable HTTP transport (modern MCP protocol).
"""

import asyncio
import json
import logging
import os
import sys
import httpx
import uvicorn
from typing import Any

from mcp.server.fastmcp import FastMCP

# Add shared modules to path
shared_path = os.path.join(os.path.dirname(__file__), '..', '..', 'shared')
if shared_path not in sys.path:
    sys.path.insert(0, shared_path)

# Import shared logging + auth client
from logging_setup import setup_logging
from mcp_base_client import MCPBaseClient

# Configure logging
logger = logging.getLogger("worldstreamer-server")

# Configuration
# Default base URLs for auto-detection - can be overridden via environment variable WORLDSTREAMER_BASE_URL
# Ports come from agentworld-extensions/agent-world-config.json
DEFAULT_RTMP_URL = "http://localhost:8906"  # worldstreamer.rtmp.server_port
DEFAULT_SRT_URL = "http://localhost:8908"   # worldstreamer.srt.server_port
REQUEST_TIMEOUT = 30.0
HEALTH_CHECK_TIMEOUT = 5.0

# Create FastMCP server instance
mcp = FastMCP("worldstreamer")

class WorldStreamerMCPServer:
    """MCP server for WorldStreamer streaming control with auto-detection."""

    def __init__(self, base_url: str = None):
        """
        Initialize WorldStreamer MCP server with auto-detection.

        Args:
            base_url: Optional override base URL for WorldStreamer API
        """
        self.rtmp_url = DEFAULT_RTMP_URL.rstrip('/')
        self.srt_url = DEFAULT_SRT_URL.rstrip('/')
        self.base_url = None  # Will be set by auto-detection
        self.active_protocol = None  # 'rtmp' or 'srt' or 'manual'
        self.client: MCPBaseClient | None = None

        # Override URLs if base_url provided
        if base_url:
            self.base_url = base_url.rstrip('/')
            self.active_protocol = "manual"
            logger.info(f"Manual mode: Using provided base URL: {self.base_url}")

        logger.info(f"WorldStreamer MCP server initialized - RTMP: {self.rtmp_url}, SRT: {self.srt_url}")

    async def _detect_active_service(self) -> str:
        """
        Auto-detect which WorldStreamer service is running.

        Returns:
            Base URL of the active service

        Raises:
            Exception if no service is available
        """
        if self.base_url and self.active_protocol == "manual":
            return self.base_url

        # Test both services
        services = [
            (self.rtmp_url, "RTMP"),
            (self.srt_url, "SRT")
        ]

        for url, protocol in services:
            try:
                async with httpx.AsyncClient(timeout=self._get_timeout('simple')) as client:
                    response = await client.get(f"{url}/health")
                    if response.status_code == 200:
                        result = response.json()
                        if result.get('success'):
                            self.base_url = url
                            self.active_protocol = protocol.lower()
                            logger.info(f"Auto-detected active service: {protocol} at {url}")
                            return url
            except Exception as e:
                logger.debug(f"{protocol} service at {url} not available: {e}")
                continue

        # No service available
        raise Exception(f"No WorldStreamer service available at {self.rtmp_url} or {self.srt_url}")

    async def _ensure_client(self) -> None:
        """Ensure MCPBaseClient is initialized for the detected base_url."""
        if not self.base_url:
            await self._detect_active_service()
        if self.client is None or self.client.base_url != self.base_url:
            self.client = MCPBaseClient("WORLDSTREAMER", self.base_url)
            await self.client.initialize()

    def _get_timeout(self, operation_type: str = 'standard') -> float:
        """Uniform timeout helper to match other services."""
        defaults = {
            'simple': 5.0,       # health checks
            'standard': 30.0,    # streaming control/status
            'complex': 60.0,     # potentially long operations
        }
        return defaults.get(operation_type, defaults['standard'])

    async def _start_streaming(self, arguments: dict) -> str:
        """Start streaming session (auto-detects RTMP/SRT)."""
        try:
            # Auto-detect active service
            await self._detect_active_service()
            await self._ensure_client()
            result = await self.client.post("/streaming/start", json=arguments, timeout=self._get_timeout('standard'))

            if result.get('success'):
                    # Format successful response with protocol info
                    protocol_name = self.active_protocol.upper() if self.active_protocol != "manual" else "Streaming"
                    message_lines = [f"✅ **{protocol_name} Streaming Started Successfully**", ""]

                    if 'streaming_info' in result:
                        info = result['streaming_info']
                        port_label = f"**{protocol_name} Port:**" if protocol_name != "Streaming" else "**Port:**"
                        message_lines.extend([
                            f"{port_label} {info.get('rtmp_port', info.get('port', 'unknown'))}",
                            f"**FPS:** {info.get('fps', 'unknown')}",
                            f"**Resolution:** {info.get('resolution', 'unknown')}",
                            f"**Start Time:** {info.get('start_time', 'unknown')}",
                            ""
                        ])

                        if 'urls' in info:
                            urls = info['urls']
                            message_lines.append("**Streaming URLs:**")
                            if 'rtmp_stream_url' in urls:
                                message_lines.append(f"• RTMP Stream: {urls['rtmp_stream_url']}")
                            if 'local_network_rtmp_url' in urls:
                                message_lines.append(f"• Local Network: {urls['local_network_rtmp_url']}")
                            if 'public_rtmp_url' in urls:
                                message_lines.append(f"• Public: {urls['public_rtmp_url']}")
                            if 'client_urls' in urls and 'obs_studio' in urls['client_urls']:
                                message_lines.append(f"• OBS Studio: {urls['client_urls']['obs_studio']}")
                            message_lines.append("")

                            if 'recommendations' in urls:
                                message_lines.append("**Recommendations:**")
                                for rec in urls['recommendations']:
                                    message_lines.append(f"• {rec}")

                    return "\n".join(message_lines)
            else:
                return f"❌ **Streaming Start Failed**\n\nError: {result.get('error', 'Unknown error')}"

        except httpx.HTTPError as e:
            logger.error(f"HTTP error starting streaming: {e}")
            return f"❌ **HTTP Error**\n\nFailed to start streaming: {str(e)}"
        except Exception as e:
            logger.error(f"Error starting streaming: {e}")
            return f"❌ **Error**\n\nFailed to start streaming: {str(e)}"

    async def _stop_streaming(self, arguments: dict) -> str:
        """Stop streaming session (auto-detects RTMP/SRT)."""
        try:
            # Auto-detect active service
            await self._detect_active_service()
            await self._ensure_client()
            result = await self.client.post("/streaming/stop", timeout=self._get_timeout('standard'))

            if result.get('success'):
                    # Format successful response
                    message_lines = ["✅ **Streaming Stopped Successfully**", ""]

                    if 'session_info' in result:
                        info = result['session_info']
                        message_lines.extend([
                            f"**Duration:** {info.get('duration_seconds', 'unknown')} seconds",
                            f"**Stop Time:** {info.get('stop_time', 'unknown')}"
                        ])

                    return "\n".join(message_lines)
            else:
                return f"❌ **Streaming Stop Failed**\n\nError: {result.get('error', 'Unknown error')}"

        except httpx.HTTPError as e:
            logger.error(f"HTTP error stopping streaming: {e}")
            return f"❌ **HTTP Error**\n\nFailed to stop streaming: {str(e)}"
        except Exception as e:
            logger.error(f"Error stopping streaming: {e}")
            return f"❌ **Error**\n\nFailed to stop streaming: {str(e)}"

    async def _get_status(self, arguments: dict) -> str:
        """Get streaming status (auto-detects RTMP/SRT)."""
        try:
            # Auto-detect active service
            await self._detect_active_service()
            await self._ensure_client()
            result = await self.client.get("/streaming/status", timeout=self._get_timeout('standard'))

            if result.get('success'):
                    status = result.get('status', {})

                    # Format status response with protocol info
                    protocol_name = self.active_protocol.upper() if self.active_protocol != "manual" else "Streaming"
                    message_lines = [f"📊 **{protocol_name} Streaming Status**", ""]
                    message_lines.extend([
                        f"**Protocol:** {protocol_name}",
                        f"**State:** {status.get('state', 'unknown')}",
                        f"**Active:** {'Yes' if status.get('is_active') else 'No'}",
                        f"**Port:** {status.get('port', 'unknown')}"
                    ])

                    if status.get('is_active') and status.get('uptime_seconds'):
                        uptime = status['uptime_seconds']
                        hours = int(uptime // 3600)
                        minutes = int((uptime % 3600) // 60)
                        seconds = int(uptime % 60)
                        message_lines.append(f"**Uptime:** {hours:02d}:{minutes:02d}:{seconds:02d}")

                    if status.get('is_error') and status.get('error_message'):
                        message_lines.extend(["", f"**Error:** {status['error_message']}"])

                    if status.get('urls'):
                        urls = status['urls']
                        message_lines.extend(["", "**URLs:**"])
                        for key, url in urls.items():
                            if key.endswith('_url') and url:
                                name = key.replace('_url', '').replace('_', ' ').title()
                                message_lines.append(f"• {name}: {url}")

                    return "\n".join(message_lines)
            else:
                return f"❌ **Status Check Failed**\n\nError: {result.get('error', 'Unknown error')}"

        except httpx.HTTPError as e:
            logger.error(f"HTTP error getting status: {e}")
            return f"❌ **HTTP Error**\n\nFailed to get status: {str(e)}"
        except Exception as e:
            logger.error(f"Error getting status: {e}")
            return f"❌ **Error**\n\nFailed to get status: {str(e)}"

    async def _get_streaming_urls(self, arguments: dict) -> str:
        """Get streaming URLs (auto-detects RTMP/SRT)."""
        try:
            # Auto-detect active service
            await self._detect_active_service()
            await self._ensure_client()
            params = {}
            if 'server_ip' in arguments:
                params['server_ip'] = arguments['server_ip']
            result = await self.client.get("/streaming/urls", params=params, timeout=self._get_timeout('standard'))

            if result.get('success'):
                    urls = result.get('urls', {})

                    # Format URLs response
                    message_lines = ["🔗 **Streaming URLs**", ""]

                    # Protocol-specific URL mappings
                    if self.active_protocol == "rtmp":
                        url_mapping = {
                            'rtmp_stream_url': 'RTMP Stream',
                            'local_network_rtmp_url': 'Local Network RTMP',
                            'public_rtmp_url': 'Public RTMP'
                        }
                    else:  # SRT
                        url_mapping = {
                            'srt_uri': 'SRT Stream'
                        }

                    for key, label in url_mapping.items():
                        if key in urls and urls[key]:
                            message_lines.append(f"**{label}:** {urls[key]}")

                    if 'connection_info' in urls:
                        info = urls['connection_info']
                        message_lines.extend(["", "**Connection Info:**"])
                        message_lines.append(f"• Protocol: {info.get('protocol', 'unknown')}")
                        message_lines.append(f"• Port: {info.get('port', 'unknown')}")
                        if 'local_ip' in info:
                            message_lines.append(f"• Local IP: {info['local_ip']}")
                        if 'public_ip' in info:
                            message_lines.append(f"• Public IP: {info['public_ip']}")

                    if 'recommendations' in urls:
                        message_lines.extend(["", "**Recommendations:**"])
                        for rec in urls['recommendations']:
                            message_lines.append(f"• {rec}")

                    return "\n".join(message_lines)
            else:
                return f"❌ **URL Generation Failed**\n\nError: {result.get('error', 'Unknown error')}"

        except httpx.HTTPError as e:
            logger.error(f"HTTP error getting URLs: {e}")
            return f"❌ **HTTP Error**\n\nFailed to get URLs: {str(e)}"
        except Exception as e:
            logger.error(f"Error getting URLs: {e}")
            return f"❌ **Error**\n\nFailed to get URLs: {str(e)}"

    async def _validate_environment(self, arguments: dict) -> str:
        """Validate streaming environment (auto-detects RTMP/SRT)."""
        try:
            # Auto-detect active service
            await self._detect_active_service()
            await self._ensure_client()
            result = await self.client.get("/streaming/environment/validate", timeout=self._get_timeout('standard'))

            if result.get('success'):
                    validation = result.get('validation', {})

                    # Format validation response
                    status_icon = "✅" if validation.get('valid') else "⚠️"
                    message_lines = [f"{status_icon} **Environment Validation**", ""]
                    message_lines.append(f"**Valid:** {'Yes' if validation.get('valid') else 'No'}")

                    if validation.get('errors'):
                        message_lines.extend(["", "**Errors:**"])
                        for error in validation['errors']:
                            message_lines.append(f"❌ {error}")

                    if validation.get('warnings'):
                        message_lines.extend(["", "**Warnings:**"])
                        for warning in validation['warnings']:
                            message_lines.append(f"⚠️ {warning}")

                    if validation.get('recommendations'):
                        message_lines.extend(["", "**Recommendations:**"])
                        for rec in validation['recommendations']:
                            message_lines.append(f"💡 {rec}")

                    if validation.get('environment_details'):
                        details = validation['environment_details']
                        message_lines.extend(["", "**Environment Details:**"])
                        for key, value in details.items():
                            formatted_key = key.replace('_', ' ').title()
                            message_lines.append(f"• {formatted_key}: {value}")

                    return "\n".join(message_lines)
            else:
                return f"❌ **Validation Failed**\n\nError: {result.get('error', 'Unknown error')}"

        except httpx.HTTPError as e:
            logger.error(f"HTTP error validating environment: {e}")
            return f"❌ **HTTP Error**\n\nFailed to validate environment: {str(e)}"
        except Exception as e:
            logger.error(f"Error validating environment: {e}")
            return f"❌ **Error**\n\nFailed to validate environment: {str(e)}"

    async def _health_check(self, arguments: dict) -> str:
        """Check extension health (auto-detects RTMP/SRT)."""
        try:
            # Auto-detect active service
            await self._detect_active_service()
            await self._ensure_client()
            result = await self.client.get("/health", timeout=self._get_timeout('simple'))

            if result.get('success'):
                    # Unified agent world health format: success=true indicates healthy
                    status = "healthy" if result.get('success') else "unhealthy"
                    status_icon = "✅"
                    protocol_name = self.active_protocol.upper() if self.active_protocol != "manual" else "WorldStreamer"

                    message_lines = [f"{status_icon} **{protocol_name} Health Check**", ""]
                    message_lines.extend([
                        f"**Service:** {result.get('service', 'WorldStreamer')} ({protocol_name})",
                        f"**Version:** {result.get('version', 'unknown')}",
                        f"**Status:** {status.title()}",
                        f"**URL:** {self.base_url}",
                        f"**Timestamp:** {result.get('timestamp', 'unknown')}"
                    ])

                    # Note: Unified agent world health format is simple - no complex details

                    return "\n".join(message_lines)
            else:
                return f"❌ **Health Check Failed**\n\nError: {result.get('error', 'Unknown error')}"

        except httpx.HTTPError as e:
            logger.error(f"HTTP error in health check: {e}")
            return f"❌ **HTTP Error**\n\nHealth check failed: {str(e)}"
        except Exception as e:
            logger.error(f"Error in health check: {e}")
            return f"❌ **Error**\n\nHealth check failed: {str(e)}"

# Initialize server instance
worldstreamer_server = WorldStreamerMCPServer()

# FastMCP tool definitions using decorators
@mcp.tool()
async def worldstreamer_start_streaming(server_ip: str = None) -> str:
    """Start Isaac Sim streaming session (auto-detects RTMP/SRT).

    Args:
        server_ip: Optional server IP override for streaming URLs
    """
    result = await worldstreamer_server._start_streaming({"server_ip": server_ip} if server_ip else {})
    return result

@mcp.tool()
async def worldstreamer_stop_streaming() -> str:
    """Stop active Isaac Sim streaming session (auto-detects RTMP/SRT)."""
    result = await worldstreamer_server._stop_streaming({})
    return result

@mcp.tool()
async def worldstreamer_get_status() -> str:
    """Get current streaming status and information (auto-detects RTMP/SRT)."""
    result = await worldstreamer_server._get_status({})
    return result

@mcp.tool()
async def worldstreamer_get_streaming_urls(server_ip: str = None) -> str:
    """Get streaming client URLs for connection (auto-detects RTMP/SRT).

    Args:
        server_ip: Optional server IP override for streaming URLs
    """
    result = await worldstreamer_server._get_streaming_urls({"server_ip": server_ip} if server_ip else {})
    return result

@mcp.tool()
async def worldstreamer_validate_environment() -> str:
    """Validate Isaac Sim environment for streaming (auto-detects RTMP/SRT)."""
    result = await worldstreamer_server._validate_environment({})
    return result

@mcp.tool()
async def worldstreamer_health_check() -> str:
    """Check WorldStreamer extension health and connectivity (auto-detects RTMP/SRT)."""
    result = await worldstreamer_server._health_check({})
    return result

async def main():
    """Main entry point for the FastMCP server."""
    setup_logging('worldstreamer')
    logger.info("🚀 Starting WorldStreamer MCP Server (FastMCP)")

    # Check for manual base URL override
    manual_base = os.getenv("AGENT_WORLDSTREAMER_BASE_URL") or os.getenv("WORLDSTREAMER_API_URL")
    if manual_base:
        global worldstreamer_server
        worldstreamer_server = WorldStreamerMCPServer(manual_base)

    # Get port from environment variable
    port = int(os.getenv("MCP_SERVER_PORT", 8702))

    # Create the FastMCP ASGI application
    app = mcp.streamable_http_app

    logger.info(f"WorldStreamer MCP Server starting on http://0.0.0.0:{port}")
    logger.info("Using modern FastMCP with Streamable HTTP transport")

    # Run with uvicorn
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()

if __name__ == "__main__":
    asyncio.run(main())
