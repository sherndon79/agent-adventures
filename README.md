# Agent Adventures

**Interactive Adventure Platform** - A choose-your-own-adventure streaming platform powered by AI agents and Isaac Sim.

## Overview

Agent Adventures is the interactive storytelling platform component of the agent-world ecosystem. It orchestrates live, interactive streaming experiences where audiences participate in real-time story decisions that directly control 3D scenes in Isaac Sim.

## Architecture

This platform serves as the **Interactive Adventure Platform (External Application)** in the WorldStreamer architecture, providing:

### Core Components

- **Multi-agent Director Panel**: Orchestrates story decisions and scene changes using AI agents
- **Poll Question Engine**: Generates audience choices based on current story state
- **Chat Interaction System**: Processes audience input and voting in real-time
- **Scene Layout Controller**: Commands Isaac Sim scene changes via MCP interface
- **OME Integration**: Consumes SRT streams from Isaac Sim WorldStreamer
- **Multi-platform Routing**: Configures OME for YouTube/Twitch distribution

### Integration Points

- **Isaac Sim**: Scene control and 3D content generation via [agent-world](https://github.com/sherndon79/agent-world) MCP interface
- **WorldStreamer**: Ultra-low latency SRT stream consumption from Isaac Sim
- **OME (Open Media Engine)**: Stream routing and multi-platform RTMP broadcasting
- **Streaming Platforms**: Live distribution to YouTube, Twitch, and other platforms

## Technical Features

- **Real-time Interaction**: <2 second poll response times
- **Scene Transitions**: <5 second scene change completion
- **Chat Commands**: <1 second command execution
- **Multi-platform Streaming**: Simultaneous broadcasting to multiple platforms

## Development Status

🚧 **Early Development** - This project is part of the WorldStreamer architecture vision currently being implemented.

### Current Phase
- **Phase 3**: External Platform Foundation
  - Developing multi-agent director framework
  - Implementing OME management and stream routing control
  - Creating MCP integration for Isaac Sim scene control

### Upcoming Phases
- **Phase 4**: Interactive Features (audience polling, chat interaction, story branching)
- **Phase 5**: Broadcasting Integration (multi-platform streaming, analytics)

## Related Projects

- [agent-world](https://github.com/sherndon79/agent-world) - Isaac Sim integration and WorldStreamer infrastructure
- WorldStreamer Extension - SRT streaming from Isaac Sim (part of agent-world)
- OME Configuration - SRT-to-RTMP conversion for multi-platform broadcasting

## Performance Targets

- Stream uptime > 99%
- End-to-end latency < 3 seconds
- Frame drop rate < 0.1%
- Audience retention rate optimization

## Getting Started

*Documentation and setup instructions will be added as development progresses.*

## License

TBD