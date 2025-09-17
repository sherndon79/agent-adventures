#!/bin/bash
set -e

# Default to worldbuilder if no server specified
MCP_SERVER_NAME=${MCP_SERVER_NAME:-worldbuilder}
MCP_SERVER_PORT=${MCP_SERVER_PORT:-8700}

echo "Starting MCP Server: $MCP_SERVER_NAME on port $MCP_SERVER_PORT"
echo "Auth enabled: $AGENT_EXT_AUTH_ENABLED"
echo "Working directory: $(pwd)"

# Determine the Python script to run
case "$MCP_SERVER_NAME" in
    "worldbuilder")
        SCRIPT_PATH="/app/worldbuilder/src/mcp_agent_worldbuilder.py"
        ;;
    "worldviewer")
        SCRIPT_PATH="/app/worldviewer/src/mcp_agent_worldviewer.py"
        ;;
    "worldsurveyor")
        SCRIPT_PATH="/app/worldsurveyor/src/mcp_agent_worldsurveyor.py"
        ;;
    "worldstreamer")
        SCRIPT_PATH="/app/worldstreamer/src/mcp_agent_worldstreamer.py"
        ;;
    "worldrecorder")
        SCRIPT_PATH="/app/worldrecorder/src/mcp_agent_worldrecorder.py"
        ;;
    *)
        echo "Error: Unknown MCP server: $MCP_SERVER_NAME"
        exit 1
        ;;
esac

# Check if script exists
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "Error: Script not found: $SCRIPT_PATH"
    ls -la /app/
    exit 1
fi

echo "Executing MCP server directly: $SCRIPT_PATH"
echo "Server will use built-in SSE transport"

# Set port as environment variable for the MCP server to use
export MCP_SERVER_PORT=$MCP_SERVER_PORT

# Execute the MCP server directly - they already have SSE transport built-in
exec python "$SCRIPT_PATH"