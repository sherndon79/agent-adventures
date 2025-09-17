# Agent Adventures: Modular Architecture Design

## Overview

A plugin-based, event-driven architecture that ensures extensibility, maintainability, and clear separation of concerns.

## Core Architecture Principles

### 1. Plugin-Based Agent System
- Each agent is a self-contained plugin
- Hot-swappable agents without system restart
- Version management and dependency resolution
- Easy to add new agent types or replace existing ones

### 2. Event-Driven Communication
- Central event bus for loose coupling
- Agents subscribe to relevant events
- Asynchronous processing for performance
- Built-in retry and error handling

### 3. Shared State Management
- Immutable story state with versioning
- Change tracking and rollback capabilities
- Real-time state synchronization
- Conflict resolution for concurrent updates

## Directory Structure

```
agent-adventures/
├── src/
│   ├── core/                 # Core framework
│   │   ├── agent-manager.js  # Plugin loading and lifecycle
│   │   ├── event-bus.js      # Event system
│   │   ├── story-state.js    # State management
│   │   └── interfaces/       # TypeScript interfaces
│   ├── agents/               # Agent plugins
│   │   ├── story-director/
│   │   ├── cinematographer/
│   │   ├── set-designer/
│   │   ├── audience-whisperer/
│   │   └── ...
│   ├── services/             # External integrations
│   │   ├── mcp-clients/      # WorldBuilder, WorldViewer, etc.
│   │   ├── streaming/        # OME and platform APIs
│   │   └── database/         # Story persistence
│   ├── utils/                # Shared utilities
│   └── config/               # Configuration management
├── plugins/                  # External agent plugins
├── tests/
└── docs/
```

## Core Framework Components

### 1. Agent Manager
```javascript
class AgentManager {
  async loadAgent(pluginPath, config)
  async unloadAgent(agentId)
  async reloadAgent(agentId)
  listAgents()
  getAgentStatus(agentId)
}
```

### 2. Event Bus
```javascript
class EventBus {
  subscribe(eventType, handler, priority)
  unsubscribe(eventType, handler)
  emit(eventType, payload)
  emitAsync(eventType, payload)
}
```

### 3. Story State Manager
```javascript
class StoryState {
  getState()
  updateState(path, value)
  subscribeToChanges(path, callback)
  createTransaction()
  rollback(transactionId)
}
```

## Agent Plugin Interface

### Base Agent Class
```javascript
class BaseAgent {
  constructor(id, config, dependencies) {}

  async initialize() {}
  async start() {}
  async stop() {}
  async destroy() {}

  // Event handling
  getSubscriptions() { return []; }
  async handleEvent(eventType, payload) {}

  // State management
  async onStateChange(path, newValue, oldValue) {}

  // Health and monitoring
  getStatus() {}
  getMetrics() {}
}
```

### Agent Plugin Manifest
```json
{
  "name": "story-director",
  "version": "1.0.0",
  "description": "Manages overall narrative arc and pacing",
  "main": "index.js",
  "dependencies": {
    "core": "^1.0.0"
  },
  "config": {
    "schema": "config.schema.json",
    "default": "config.default.json"
  },
  "events": {
    "subscribes": ["audience.choice", "story.beat"],
    "emits": ["story.advance", "scene.change"]
  }
}
```

## Event System Design

### Event Categories
- **story.*** - Narrative events (beats, choices, branches)
- **scene.*** - Visual/spatial events (asset placement, camera moves)
- **audience.*** - Interaction events (polls, chat, votes)
- **system.*** - Technical events (errors, performance, health)
- **agent.*** - Agent lifecycle events (start, stop, error)

### Example Event Flow
```javascript
// Audience makes choice
eventBus.emit('audience.choice', {
  pollId: 'forest_encounter',
  choice: 'trust_stranger',
  votes: 67,
  timestamp: Date.now()
});

// Story Director responds
class StoryDirector extends BaseAgent {
  getSubscriptions() {
    return ['audience.choice'];
  }

  async handleEvent(eventType, payload) {
    if (eventType === 'audience.choice') {
      await this.processAudienceChoice(payload);

      // Emit story advancement
      this.eventBus.emit('story.advance', {
        scene: 'stranger_reveals_identity',
        consequences: ['trust_established', 'info_revealed']
      });
    }
  }
}
```

## Configuration Management

### Hierarchical Configuration
```javascript
// config/default.json - Base configuration
// config/production.json - Environment overrides
// config/local.json - Local development overrides

{
  "agents": {
    "story-director": {
      "enabled": true,
      "priority": "high",
      "config": {
        "maxBranchDepth": 5,
        "tensionCurve": "three-act"
      }
    }
  },
  "eventBus": {
    "maxRetries": 3,
    "timeout": 5000
  },
  "storyState": {
    "persistenceInterval": 30000,
    "maxVersions": 100
  }
}
```

## Service Abstraction Layer

### MCP Client Wrapper
```javascript
class MCPClientManager {
  constructor() {
    this.clients = {
      worldBuilder: new WorldBuilderClient(),
      worldViewer: new WorldViewerClient(),
      worldSurveyor: new WorldSurveyorClient(),
      worldStreamer: new WorldStreamerClient()
    };
  }

  async executeCommand(service, command, params) {
    const client = this.clients[service];
    return await client.execute(command, params);
  }
}
```

## Development Workflow

### 1. Hot Reloading
- Agents can be reloaded without restarting the system
- Configuration changes apply immediately
- State is preserved during agent updates

### 2. Testing Strategy
- Unit tests for individual agents
- Integration tests for event flows
- End-to-end tests with mock Isaac Sim
- Performance tests for real-time requirements

### 3. Debugging & Monitoring
- Central logging with agent context
- Real-time event stream monitoring
- Agent performance metrics
- Story state change history

## Benefits of This Architecture

### Extensibility
- New agents added as simple plugins
- Event system allows complex interactions
- Configuration-driven behavior
- API-first design for external integrations

### Maintainability
- Clear separation of concerns
- Well-defined interfaces and contracts
- Comprehensive testing strategy
- Hot reloading for rapid development

### Scalability
- Asynchronous event processing
- Stateless agent design where possible
- Horizontal scaling of agent instances
- Performance monitoring and optimization

### Reliability
- Graceful error handling and recovery
- Agent isolation prevents cascade failures
- State persistence and rollback capabilities
- Health monitoring and automatic restarts

## Next Steps

1. **Core Framework**: Build event bus, agent manager, and state management
2. **Base Agent**: Create abstract base class and plugin loading system
3. **First Agent**: Implement Story Director as proof of concept
4. **MCP Integration**: Create service abstraction layer
5. **Testing Infrastructure**: Set up unit and integration testing
6. **Configuration System**: Implement hierarchical config management

This modular approach ensures we can build, test, and deploy agents independently while maintaining a cohesive system for creating dynamic interactive adventures.