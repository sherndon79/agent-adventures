#!/usr/bin/env python3
"""
Convert MCP servers from stdio to SSE transport
"""

import os
import re
import glob

def convert_mcp_server_to_sse(file_path, server_name, port):
    """Convert a single MCP server file from stdio to SSE"""
    with open(file_path, 'r') as f:
        content = f.read()

    # Replace stdio import with SSE import
    content = content.replace(
        'from mcp.server.stdio import stdio_server',
        'from mcp.server.sse import SseServerTransport'
    )

    # Replace stdio server setup with SSE setup
    stdio_pattern = r'async with stdio_server\(\) as \(read_stream, write_stream\):'
    sse_replacement = f'''async with SseServerTransport("/sse") as transport:
            # Start the SSE server on port {port}
            from aiohttp import web, web_runner
            import aiohttp_cors

            app = web.Application()
            cors = aiohttp_cors.setup(app, defaults={{
                "*": aiohttp_cors.ResourceOptions(allow_credentials=True, expose_headers="*", allow_headers="*", allow_methods="*")
            }})

            # Add SSE endpoint
            async def sse_endpoint(request):
                return await transport.handle_request(request)

            cors.add(app.router.add_get('/sse', sse_endpoint))

            # Health check
            async def health_check(request):
                return web.json_response({{'status': 'ok', 'server': '{server_name}'}})
            cors.add(app.router.add_get('/health', health_check))

            runner = web_runner.AppRunner(app)
            await runner.setup()
            site = web_runner.TCPSite(runner, '0.0.0.0', {port})
            await site.start()
            logger.info(f"{server_name} MCP Server running on http://0.0.0.0:{port}")

            read_stream, write_stream = transport.streams'''

    content = re.sub(stdio_pattern, sse_replacement, content, flags=re.MULTILINE)

    with open(file_path, 'w') as f:
        f.write(content)

    print(f"Converted {file_path} to use SSE on port {port}")

def main():
    # Server configurations
    servers = [
        ('worldbuilder', 8700),
        ('worldviewer', 8701),
        ('worldstreamer', 8702),
        ('worldsurveyor', 8703),
        ('worldrecorder', 8704)
    ]

    for server_name, port in servers:
        server_file = f"{server_name}/src/mcp_agent_{server_name}.py"
        if os.path.exists(server_file):
            convert_mcp_server_to_sse(server_file, server_name.title(), port)
        else:
            print(f"Warning: {server_file} not found")

if __name__ == "__main__":
    main()