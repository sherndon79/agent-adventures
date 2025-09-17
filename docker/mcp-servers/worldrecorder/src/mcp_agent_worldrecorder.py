#!/usr/bin/env python3
"""
MCP Server for Agent WorldRecorder Extension

Provides Model Context Protocol interface to the Agent WorldRecorder extension
for video recording and frame capture in Isaac Sim.

Uses FastMCP with Streamable HTTP transport (modern MCP protocol).
"""

import asyncio
import sys
import os
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime
import uvicorn

import aiohttp

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
    from agent_world_config import create_worldrecorder_config
    config = create_worldrecorder_config()
except ImportError:
    # Fallback if unified config not available
    config = None

# FastMCP imports
from mcp.server.fastmcp import FastMCP
import mcp.types as types

# Configure logging
logger = logging.getLogger(__name__)

# Create FastMCP server instance
mcp = FastMCP("worldrecorder")


class WorldRecorderResponseFormatter:
    """Unified response formatting for world recorder operations"""
    
    SUCCESS_TEMPLATES = {
        'start_video': "🎥 Video recording started: {output_path}",
        'cancel_video': "⏹️ Video recording cancelled",
        'capture_frame': "📸 Frame capture started",
        'get_status': "📊 WorldRecorder Status",
        'health_check': "✅ Extension Health: {status}"
    }
    
    ERROR_TEMPLATE = "❌ {operation} failed: {error}"
    
    # User-friendly troubleshooting hints for common errors
    TROUBLESHOOTING_HINTS = {
        "Could not connect": "💡 Troubleshooting:\n• Ensure Isaac Sim is running\n• Check that WorldRecorder extension is enabled\n• Verify extension HTTP API is active on port 8892",
        "timed out": "💡 Troubleshooting:\n• Isaac Sim may be busy processing\n• Try reducing video resolution or frame rate\n• Check Isaac Sim console for errors",
        "Session not found": "💡 Troubleshooting:\n• Check if recording was started properly\n• Use /video/status to check current session\n• Recording may have already stopped or timed out",
        "Path not found": "💡 Troubleshooting:\n• Verify the output directory exists\n• Check file path permissions\n• Ensure sufficient disk space available",
        "HTTP 500": "💡 Troubleshooting:\n• Isaac Sim internal error occurred\n• Check Isaac Sim console logs\n• Try reloading the WorldRecorder extension\n• Restart Isaac Sim if issues persist"
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
        if operation == 'start_video':
            if 'session_id' in response:
                message += f"\n• Session ID: {response['session_id']}"
            if 'fps' in response:
                message += f"\n• FPS: {response['fps']}"
            if 'duration_sec' in response:
                message += f"\n• Duration: {response['duration_sec']}s"
            if 'file_type' in response:
                message += f"\n• Format: {response['file_type']}"
        elif operation == 'stop_video':
            if 'duration' in response:
                message += f"\n• Duration: {response['duration']:.2f}s"
            if 'frames_captured' in response:
                message += f"\n• Frames captured: {response['frames_captured']}"
        elif operation == 'capture_frame':
            capture_mode = response.get('capture_mode', 'single')
            if capture_mode == 'sequence':
                message += f"\n• Session ID: {response.get('session_id', 'Unknown')}"
                if 'session_directory' in response:
                    message += f"\n• Session Directory: {response['session_directory']}"
                if 'duration_sec' in response:
                    message += f"\n• Duration: {response['duration_sec']}s"
                if 'interval_sec' in response:
                    message += f"\n• Interval: {response['interval_sec']}s"
                if 'estimated_frame_count' in response:
                    message += f"\n• Expected Frames: {response['estimated_frame_count']}"
                if 'frame_pattern' in response:
                    message += f"\n• Frame Pattern: {response['frame_pattern']}"
            else:
                if 'outputs' in response and response['outputs']:
                    message += f"\n• Output: {response['outputs'][0]}"
            if 'file_type' in response:
                message += f"\n• Format: {response['file_type']}"
        elif operation == 'get_status':
            # Support both legacy {status: {...}} and new flat schema
            status = response.get('status') or response
            message = "📊 WorldRecorder Status:\n"

            # Determine recording/active state from available fields
            if 'recording' in status:
                recording = bool(status.get('recording'))
                message += f"• Recording: {'🔴 Active' if recording else '⚪ Stopped'}\n"
            elif 'done' in status:
                done = bool(status.get('done'))
                sid = status.get('session_id')
                recording = bool(sid) and not done
                message += f"• Recording: {'🔴 Active' if recording else '⚪ Stopped'}\n"
                message += f"• Done: {done}\n"
            
            # Common fields across versions
            if status.get('session_id'):
                message += f"• Session ID: {status['session_id']}\n"
            if status.get('last_session_id'):
                message += f"• Last Session ID: {status['last_session_id']}\n"
            if status.get('output_path'):
                message += f"• Output: {status['output_path']}\n"
            
            # Outputs list (new API)
            outputs = status.get('outputs')
            if isinstance(outputs, list) and outputs:
                if len(outputs) == 1:
                    message += f"• Output: {outputs[0]}\n"
                else:
                    message += f"• Outputs ({len(outputs)}):\n"
                    for p in outputs[:5]:
                        message += f"  - {p}\n"
                    if len(outputs) > 5:
                        message += f"  - ... and {len(outputs) - 5} more\n"
            
            # Timing/telemetry if provided
            if status.get('duration') is not None:
                try:
                    message += f"• Duration: {float(status['duration']):.2f}s\n"
                except Exception:
                    pass
            if status.get('fps') is not None:
                message += f"• FPS: {status['fps']}\n"
            if status.get('timestamp') is not None:
                try:
                    from datetime import datetime
                    ts = float(status['timestamp'])
                    message += f"• Timestamp: {datetime.fromtimestamp(ts).isoformat()}\n"
                except Exception:
                    message += f"• Timestamp: {status['timestamp']}\n"
        
        return message
    
    @classmethod
    def format_error(cls, operation: str, error: str) -> str:
        """Format error response with troubleshooting hints"""
        message = cls.ERROR_TEMPLATE.format(operation=operation, error=error)
        
        # Add troubleshooting hints if available
        for hint_key, hint_text in cls.TROUBLESHOOTING_HINTS.items():
            if hint_key.lower() in error.lower():
                message += f"\n\n{hint_text}"
                break
        
        return message


class WorldRecorderMCP:
    """MCP Server for Isaac Sim WorldRecorder Extension"""
    
    def __init__(self, base_url: Optional[str] = None):
        """Initialize the MCP server with connection settings"""
        env_base = os.getenv("AGENT_WORLDRECORDER_BASE_URL") or os.getenv("WORLDRECORDER_API_URL")
        self.base_url = env_base or base_url or "http://localhost:8892"
        self.formatter = WorldRecorderResponseFormatter()
        
        # Initialize unified auth client
        self.client = MCPBaseClient("WORLDRECORDER", self.base_url)
        
        # Timeouts configuration
        self.timeouts = {
            'standard': 30.0,  # Standard operations
            'video_start': 60.0,  # Video start can take longer
            'video_stop': 90.0,  # Video finalization can be slow
            'frame_capture': 45.0,  # Frame capture with processing
        }
        
        # Retry configuration
        self.retry_attempts = 3
    
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
    
    
    def _get_timeout(self, operation: str) -> float:
        """Get timeout for specific operation"""
        return self.timeouts.get(operation, self.timeouts['standard'])
    
    # (Auth headers handled by MCPBaseClient)
    
    async def _make_request(
        self, 
        method: str, 
        endpoint: str, 
        data: Optional[Dict] = None,
        timeout_key: str = 'standard'
    ) -> Dict:
        """Make HTTP request using unified auth client"""
        try:
            await self._initialize_client()
            
            if method.upper() == 'GET':
                return await self.client.get(endpoint)
            elif method.upper() == 'POST':
                return await self.client.post(endpoint, json=data)
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
                
        except aiohttp.ClientError as e:
            raise aiohttp.ClientError(f"Could not connect to WorldRecorder extension at {self.base_url}. "
                                    f"Ensure Isaac Sim is running and WorldRecorder extension is enabled.")
        except Exception as e:
            raise Exception(f"Request failed: {str(e)}")

    async def _health_check(self, arguments: Dict[str, Any]) -> str:
        """Check WorldRecorder extension health and connectivity"""
        try:
            response = await self._make_request("GET", "/health")
            if response.get('success'):
                return (f"✅ WorldRecorder Health\n" +
                       f"• Service: {response.get('service', 'Unknown')}\n" +
                       f"• Version: {response.get('version', 'Unknown')}\n" +
                       f"• URL: {response.get('url', 'Unknown')}\n" +
                       f"• Timestamp: {response.get('timestamp', 'Unknown')}\n" +
                       f"• Recording Active: {response.get('recording_active', False)}")
            else:
                return f"❌ Health check failed: {response.get('error', 'Unknown error')}"
        except Exception as e:
            return f"❌ Health check error: {str(e)}"

# Initialize server instance
worldrecorder_server = WorldRecorderMCP()

# FastMCP tool definitions using decorators
@mcp.tool()
async def worldrecorder_health_check() -> str:
    """Check WorldRecorder extension health and connectivity"""
    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._health_check({})
    return result

@mcp.tool()
async def worldrecorder_metrics_prometheus() -> str:
    """Get WorldRecorder metrics in Prometheus format for monitoring systems"""
    await worldrecorder_server._initialize_client()
    try:
        # Use a direct request to avoid any attribute resolution issues
        response = await worldrecorder_server._make_request("GET", "/metrics.prom")
        prom_text = response.get('_raw_text', str(response)) if isinstance(response, dict) else str(response)
        return f"📊 **WorldRecorder Prometheus Metrics**\n\n```\n{prom_text}\n```"
    except Exception as e:
        return f"❌ Error getting Prometheus metrics: {str(e)}"

@mcp.tool()
async def worldrecorder_cleanup_frames(
    session_id: str = "",
    output_path: str = ""
) -> str:
    """Manually clean up temporary frame directories for a session or output path

    Args:
        session_id: Session ID to clean up (will use session's output path)
        output_path: Direct output path to clean up frame directories for
    """
    args = {}
    if session_id:
        args["session_id"] = session_id
    if output_path:
        args["output_path"] = output_path

    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._cleanup_frames(args)
    return result

@mcp.tool()
async def worldrecorder_start_video(
    output_path: str,
    duration_sec: float,
    fps: float = 30,
    width: Optional[int] = None,
    height: Optional[int] = None,
    file_type: str = ".mp4",
    session_id: str = "",
    show_progress: bool = False,
    cleanup_frames: bool = True
) -> str:
    """Start continuous video recording in Isaac Sim viewport

    Args:
        output_path: File path for video output (e.g., '/tmp/my_video.mp4')
        duration_sec: Recording duration in seconds (0.1-86400)
        fps: Frames per second for recording (1-120)
        width: Video width in pixels (optional, uses viewport width if not specified)
        height: Video height in pixels (optional, uses viewport height if not specified)
        file_type: Video file format (.mp4, .avi, .mov)
        session_id: Optional unique session identifier for tracking
        show_progress: Show progress UI during recording
        cleanup_frames: Automatically clean up temporary frame directories after recording
    """
    args = {
        "output_path": output_path,
        "duration_sec": duration_sec,
        "fps": fps,
        "file_type": file_type,
        "show_progress": show_progress,
        "cleanup_frames": cleanup_frames
    }
    if width is not None:
        args["width"] = width
    if height is not None:
        args["height"] = height
    if session_id:
        args["session_id"] = session_id

    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._start_video(args)
    return result

@mcp.tool()
async def worldrecorder_start_recording(
    output_path: str,
    duration_sec: float,
    fps: float = 30,
    width: Optional[int] = None,
    height: Optional[int] = None,
    file_type: str = ".mp4",
    session_id: str = "",
    show_progress: bool = False,
    cleanup_frames: bool = True
) -> str:
    """Start recording via recording/* API (alias of video/start)

    Args:
        output_path: Output file path
        duration_sec: Recording duration in seconds (0.1-86400)
        fps: Frames per second (1-120)
        width: Video width in pixels (optional)
        height: Video height in pixels (optional)
        file_type: Video file format (.mp4, .avi, .mov)
        session_id: Optional session identifier
        show_progress: Show progress UI during recording
        cleanup_frames: Automatically clean up temporary frame directories after recording
    """
    args = {
        "output_path": output_path,
        "duration_sec": duration_sec,
        "fps": fps,
        "file_type": file_type,
        "show_progress": show_progress,
        "cleanup_frames": cleanup_frames
    }
    if width is not None:
        args["width"] = width
    if height is not None:
        args["height"] = height
    if session_id:
        args["session_id"] = session_id

    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._start_recording(args)
    return result

@mcp.tool()
async def worldrecorder_cancel_recording(session_id: str = "") -> str:
    """Cancel recording via recording/* API - stops capture without encoding

    Args:
        session_id: Optional session id
    """
    args = {}
    if session_id:
        args["session_id"] = session_id

    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._cancel_recording(args)
    return result

@mcp.tool()
async def worldrecorder_recording_status() -> str:
    """Get recording status via recording/* API"""
    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._recording_status({})
    return result

@mcp.tool()
async def worldrecorder_cancel_video() -> str:
    """Cancel current video recording - stops capture without encoding"""
    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._cancel_video({})
    return result

@mcp.tool()
async def worldrecorder_capture_frame(
    output_path: str,
    duration_sec: Optional[float] = None,
    interval_sec: Optional[float] = None,
    frame_count: Optional[int] = None,
    width: Optional[int] = None,
    height: Optional[int] = None,
    file_type: str = ".png"
) -> str:
    """Capture a single frame or frame sequence from Isaac Sim viewport

    Args:
        output_path: File path for image output (single frame) or base directory for frame sequences
        duration_sec: Total capture duration for sequences (optional - if provided with interval_sec or frame_count, captures frame sequence)
        interval_sec: Time between frames for sequences (optional - mutually exclusive with frame_count)
        frame_count: Total number of frames to capture over duration (optional - mutually exclusive with interval_sec)
        width: Image width in pixels (optional, uses viewport width if not specified)
        height: Image height in pixels (optional, uses viewport height if not specified)
        file_type: Image file format (.png, .jpg, .jpeg, .bmp, .tiff)
    """
    args = {
        "output_path": output_path,
        "file_type": file_type
    }
    if duration_sec is not None:
        args["duration_sec"] = duration_sec
    if interval_sec is not None:
        args["interval_sec"] = interval_sec
    if frame_count is not None:
        args["frame_count"] = frame_count
    if width is not None:
        args["width"] = width
    if height is not None:
        args["height"] = height

    await worldrecorder_server._initialize_client()
    result = await worldrecorder_server._capture_frame(args)
    return result

@mcp.tool()
async def worldrecorder_get_status() -> str:
    """Get current video recording status and session information"""
    await worldrecorder_server._initialize_client()
    result = await _get_status_tool({})
    return result

@mcp.tool()
async def worldrecorder_get_metrics() -> str:
    """Get WorldRecorder extension performance metrics and statistics"""
    await worldrecorder_server._initialize_client()
    try:
        response = await worldrecorder_server._make_request("GET", "/metrics")
        # Pretty print if dict
        if isinstance(response, dict):
            lines = ["📊 WorldRecorder Metrics:"]
            for key, value in response.items():
                if isinstance(value, dict):
                    lines.append(f"\n• {key}:")
                    for sub_key, sub_value in value.items():
                        lines.append(f"  - {sub_key}: {sub_value}")
                else:
                    lines.append(f"• {key}: {value}")
            return "\n".join(lines)
        return str(response)
    except Exception as e:
        return worldrecorder_server.formatter.format_error("get_metrics", str(e))

# Module-level helper for robustness regardless of class attribute availability
async def _get_status_tool(arguments: Dict[str, Any]) -> str:
    try:
        response = await worldrecorder_server._make_request("GET", "/video/status")
        if response.get('success'):
            return worldrecorder_server.formatter.format_success("get_status", response)
        else:
            return f"❌ {response.get('error', 'Unknown error')}"
    except aiohttp.ClientError as e:
        return worldrecorder_server.formatter.format_error("get_status", str(e))
    except Exception as e:
        return worldrecorder_server.formatter.format_error("get_status", f"Unexpected error: {str(e)}")


    async def _start_video(self, arguments: Dict[str, Any]) -> str:
        """Start video recording in Isaac Sim viewport"""
        try:
            # Validate required parameters
            if not arguments.get("output_path"):
                return "❌ Missing required parameter: output_path"

            response = await self._make_request("POST", "/video/start", arguments, "video_start")
            return self.formatter.format_success("start_video", response, **arguments)

        except aiohttp.ClientError as e:
            return self.formatter.format_error("start_video", str(e))
        except Exception as e:
            return self.formatter.format_error("start_video", f"Unexpected error: {str(e)}")
    
    async def _cancel_video(self, arguments: Dict[str, Any]) -> str:
        """Cancel current video recording - stops capture without encoding"""
        try:
            response = await self._make_request("POST", "/video/cancel", arguments, "video_cancel")
            return self.formatter.format_success("cancel_video", response)

        except aiohttp.ClientError as e:
            return self.formatter.format_error("cancel_video", str(e))
        except Exception as e:
            return self.formatter.format_error("cancel_video", f"Unexpected error: {str(e)}")
    
    async def _capture_frame(self, arguments: Dict[str, Any]) -> str:
        """Capture a single frame from Isaac Sim viewport"""
        try:
            # Validate required parameters
            if not arguments.get("output_path"):
                return "❌ Missing required parameter: output_path"

            response = await self._make_request("POST", "/viewport/capture_frame", arguments, "frame_capture")
            return self.formatter.format_success("capture_frame", response, **arguments)

        except aiohttp.ClientError as e:
            return self.formatter.format_error("capture_frame", str(e))
        except Exception as e:
            return self.formatter.format_error("capture_frame", f"Unexpected error: {str(e)}")
    
    async def _get_status(self, arguments: Dict[str, Any]) -> str:
        """Get current video recording status and session information"""
        try:
            response = await self._make_request("GET", "/video/status")
            if response.get('success'):
                return self.formatter.format_success("get_status", response)
            else:
                return f"❌ {response.get('error', 'Unknown error')}"

        except aiohttp.ClientError as e:
            return self.formatter.format_error("get_status", str(e))
        except Exception as e:
            return self.formatter.format_error("get_status", f"Unexpected error: {str(e)}")
    
    async def _get_metrics(self, arguments: Dict[str, Any]) -> str:
        """Get WorldRecorder extension performance metrics and statistics"""
        try:
            response = await self._make_request("GET", "/metrics")

            # Format metrics nicely
            if isinstance(response, dict):
                metrics_text = "📊 WorldRecorder Metrics:\n"
                for key, value in response.items():
                    if isinstance(value, dict):
                        metrics_text += f"\n• {key}:\n"
                        for sub_key, sub_value in value.items():
                            metrics_text += f"  - {sub_key}: {sub_value}\n"
                    else:
                        metrics_text += f"• {key}: {value}\n"
            else:
                metrics_text = str(response)

            return metrics_text

        except aiohttp.ClientError as e:
            return self.formatter.format_error("get_metrics", str(e))
        except Exception as e:
            return self.formatter.format_error("get_metrics", f"Unexpected error: {str(e)}")

    async def _metrics_prometheus(self, arguments: Dict[str, Any]) -> str:
        """Get WorldRecorder metrics in Prometheus format"""
        try:
            response = await self._make_request("GET", "/metrics.prom")
            # Uniform: use _raw_text returned by shared client for text/plain
            prom_text = response.get('_raw_text', str(response)) if isinstance(response, dict) else str(response)
            return f"📊 **WorldRecorder Prometheus Metrics**\n\n```\n{prom_text}\n```"
        except aiohttp.ClientError as e:
            return self.formatter.format_error("get_metrics", str(e))
        except Exception as e:
            return self.formatter.format_error("get_metrics", f"Unexpected error: {str(e)}")

    async def _start_recording(self, arguments: Dict[str, Any]) -> str:
        """Start recording via recording/* API"""
        try:
            response = await self._make_request("POST", "/recording/start", arguments, "video_start")
            return self.formatter.format_success("start_video", response, **arguments)
        except aiohttp.ClientError as e:
            return self.formatter.format_error("start_video", str(e))
        except Exception as e:
            return self.formatter.format_error("start_video", f"Unexpected error: {str(e)}")

    async def _cancel_recording(self, arguments: Dict[str, Any]) -> str:
        """Cancel recording via recording/* API - stops capture without encoding"""
        try:
            response = await self._make_request("POST", "/recording/cancel", arguments, "video_cancel")
            return self.formatter.format_success("cancel_video", response)
        except aiohttp.ClientError as e:
            return self.formatter.format_error("cancel_video", str(e))
        except Exception as e:
            return self.formatter.format_error("cancel_video", f"Unexpected error: {str(e)}")

    async def _recording_status(self, arguments: Dict[str, Any]) -> str:
        """Get recording status via recording/* API"""
        try:
            response = await self._make_request("GET", "/recording/status")
            if response.get('success'):
                return self.formatter.format_success("get_status", response)
            else:
                return f"❌ {response.get('error', 'Unknown error')}"
        except aiohttp.ClientError as e:
            return self.formatter.format_error("get_status", str(e))
        except Exception as e:
            return self.formatter.format_error("get_status", f"Unexpected error: {str(e)}")

    async def _cleanup_frames(self, arguments: Dict[str, Any]) -> str:
        """Manually clean up temporary frame directories"""
        try:
            response = await self._make_request("POST", "/cleanup/frames", arguments, "cleanup")
            if response.get('success'):
                count = response.get('count', 0)
                if count > 0:
                    cleaned_dirs = response.get('cleaned_directories', [])
                    message = f"🧹 Cleaned up {count} frame director{'y' if count == 1 else 'ies'}"
                    if len(cleaned_dirs) <= 3:
                        message += f":\n• " + "\n• ".join(cleaned_dirs)
                    else:
                        message += f":\n• " + "\n• ".join(cleaned_dirs[:3]) + f"\n• ... and {len(cleaned_dirs)-3} more"
                else:
                    message = "🧹 No frame directories found to clean up"
                return message
            else:
                error_msg = response.get('error', 'Unknown error')
                return f"❌ Cleanup failed: {error_msg}"
        except aiohttp.ClientError as e:
            return self.formatter.format_error("cleanup", str(e))
        except Exception as e:
            return self.formatter.format_error("cleanup", f"Unexpected error: {str(e)}")
    


async def main():
    """Main entry point for the FastMCP server."""
    # Unified logging (stderr by default; env-driven options)
    setup_logging('worldrecorder')
    logger.info("🚀 Starting Isaac Sim WorldRecorder MCP Server (FastMCP)")

    # Get port from environment variable
    port = int(os.getenv("MCP_SERVER_PORT", 8704))

    # Create the FastMCP ASGI application
    app = mcp.streamable_http_app

    logger.info(f"WorldRecorder MCP Server starting on http://0.0.0.0:{port}")
    logger.info("Using modern FastMCP with Streamable HTTP transport")

    # Run with uvicorn
    config = uvicorn.Config(app, host="0.0.0.0", port=port, log_level="info")
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    asyncio.run(main())
