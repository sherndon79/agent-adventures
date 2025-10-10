# Agent Adventures

**AI-Driven Interactive Streaming Platform** - Autonomous storytelling through multi-agent scene generation, camera choreography, and audio narration, all streamed live from Isaac Sim.

## Overview

Agent Adventures is an autonomous AI streaming platform that creates interactive 3D scenes in real-time. Multiple AI agents compete to generate scenes, choreograph camera movements, and craft atmospheric audio - all orchestrated through a continuous story loop with audience participation.

## Current MVP Architecture

### Story Loop Workflow

1. **Genre Selection** - Audience votes on scene genre via YouTube live chat
2. **Agent Competition** - Multiple LLMs compete with proposals for:
   - Scene design (3D layout and objects)
   - Camera choreography (multi-shot sequences)
   - Audio narration (voice, music, ambient)
3. **Presentation** - Winning proposal executes in Isaac Sim with synchronized audio
4. **Cleanup** - Scene resets and loop continues

### Core Components

- **Multi-Agent System**: Competitive proposal generation across Claude, GPT, and Gemini
- **Story Loop Manager**: Orchestrates phase transitions (genre → competition → presentation → cleanup)
- **MCP Integration**: Controls Isaac Sim via [agent-world](https://github.com/sherndon79/agent-world) extensions
- **Audio Generator**: Multi-channel AI audio (narration, music, ambient) via agent-world infrastructure
- **YouTube Chat Integration**: Real-time audience voting and interaction
- **OBS Streaming**: Manual stream composition and broadcasting

### Integration Points

- **Isaac Sim**: 3D scene generation via WorldBuilder MCP, camera control via WorldViewer MCP
- **Audio Generator** (agent-world): 4-channel AI audio system with Kokoro TTS and Stable Audio
- **YouTube API**: Live chat polling and audience interaction
- **OBS**: Manual stream composition combining Isaac Sim video + AI audio channels

## Technical Features

### Multi-Agent Competition
- **3-Stage Proposal System**: Scene → Camera → Audio
- **LLM Diversity**: Claude (Sonnet), GPT-4, Gemini Pro
- **Structured Output**: JSON schema validation with fallback handling
- **Token Optimization**: Configurable budgets per proposal type

### Story Loop Automation
- **Phase-Based Architecture**: Genre selection, competition, presentation, cleanup
- **Audio Mode Switching**: Story mode, commentary mode, or mixed
- **Synchronized Playback**: Multi-channel audio with auto-ducking
- **Camera Choreography**: Multi-shot sequences with smooth transitions

### Audience Interaction
- **YouTube Live Chat**: Real-time voting and genre selection
- **Vote Aggregation**: Tally and winner selection
- **Chat Commands**: Interactive control via live chat

## Development Status

✅ **MVP Complete** - Core story loop operational with multi-agent scene generation, camera control, and AI audio

### Implemented Features
- ✅ Multi-LLM agent competition (Claude, GPT, Gemini)
- ✅ YouTube live chat voting integration
- ✅ Isaac Sim MCP integration (WorldBuilder, WorldViewer)
- ✅ 4-channel AI audio system integration
- ✅ Audio mode toggle (story/commentary/mixed)
- ✅ Automated story loop with phase management

### In Progress
- 🔧 Debugging camera choreography and narration parsing
- 🔧 Schema validation improvements for LLM responses
- 🔧 OBS automation for stream composition

## Related Projects

- [agent-world](https://github.com/sherndon79/agent-world) - Isaac Sim extensions ecosystem
  - **WorldBuilder**: 3D scene creation and manipulation
  - **WorldViewer**: Camera control and cinematography
  - **Audio Generator**: 4-channel AI audio system (narration, music, ambient, commentary)
  - **MCP Servers**: Model Context Protocol integration for AI agents

## System Requirements

- **Isaac Sim 5.0.0** with agent-world extensions
- **Node.js 18+** for orchestration platform
- **Python 3.10+** for audio generator microservices
- **OBS Studio** for stream composition
- **YouTube API credentials** for chat integration

## Quick Start

```bash
# 1. Start Isaac Sim with agent-world extensions
cd ~/agent-world && bash scripts/launch_agent_world.sh

# 2. Start audio generator (from agent-world)
cd ~/agent-world/docker/audio-generator && docker-compose up -d

# 3. Start Agent Adventures orchestrator
cd ~/agent-adventures
npm install
npm start

# 4. Access dashboard
open http://localhost:3001
```

## Configuration

Key environment variables in `.env`:
- `YOUTUBE_API_KEY` - YouTube Data API v3 key
- `YOUTUBE_LIVE_BROADCAST_ID` - Current stream/video ID
- `ANTHROPIC_API_KEY` - Claude API key
- `OPENAI_API_KEY` - GPT-4 API key
- `GOOGLE_API_KEY` - Gemini API key

See `.env.example` for full configuration options.

## License

MIT