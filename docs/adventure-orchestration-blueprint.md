# Adventure of Adventures — Operational Orchestration Blueprint

## Purpose

This document refines the architecture from `docs/adventure-of-adventures-architecture.md`
into an implementation plan focused on orchestration, budgeting, validation, and
audience integration. The goal is to keep the original creative vision intact
while providing clear guardrails for execution and tooling.

---

## 1. Guiding Principles

1. **Single Source of Truth** – A canonical story state drives every agent,
   service, and viewer-facing surface.
2. **Pluggable Stages** – Narrative generation is model-agnostic; each stage is
   a contract, not a hardcoded sequence.
3. **Budget-Aware Freedom** – Agents explore creatively, but every call is
   bounded by explicit token/time budgets.
4. **Event-Driven Everything** – Workflows advance via events, not polling,
   reducing latency and simplifying retries.
5. **Operator Confidence** – A validation console verifies each subsystem with
   deterministic payloads. Mock mode is optional, not required.
6. **OBS as Broadcast Control** – Our dashboard orchestrates orchestration;
   OBS remains the definitive streaming console.

---

## 2. Macro Architecture Alignment

The original document positioned Isaac Sim as the stage with a suite of MCP
extensions (WorldBuilder, WorldViewer, WorldSurveyor, WorldStreamer,
WorldRecorder) and a roster of creative agents. This plan keeps that core, but
adds the missing glue layer:

```
┌────────────────────────────────────────────────────────────────┐
│                         Orchestration Core                     │
│  • Story DAG Engine  • Event Bus (NATS/Redis Streams)          │
│  • Token Allocator  • Audience Poll Manager                    │
│  • Validation Harness • OBS Bridge                             │
└────────────────────────────────────────────────────────────────┘
          │                     │                      │
          ▼                     ▼                      ▼
┌─────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│ Creative Agents │  │ Isaac Sim MCP Suite │  │ Audio Microservices  │
│  Story Director │  │  Builder/Viewer/... │  │  Narration/Kokoro... │
│  Cinematographer│  │                      │  │                      │
└─────────────────┘  └──────────────────────┘  └──────────────────────┘
          │                     │                      │
          └──────────────► Shared Story State ◄────────┘
                              (Redis + JSON Schema)
```

---

## 3. Orchestrator Blueprint

### 3.1 Story Flow as a DAG

- Define each adventure as YAML or JSON describing stages, dependencies, and
  participating agents.
- Example nodes:
  - `script: ideation` → `asset_concepts` → `placement` → `camera` → `dialogue`
  - Side branches for `music`, `ambient`, `audience_poll`.

Each node includes:

```yaml
id: placement
description: Place approved assets into the scene
inputs:
  - script_summary
  - asset_concepts
agents:
  - set_designer_agent
MCP:
  - worldbuilder
budget:
  token_cap: 6000
  time_cap_ms: 4000
retry:
  max_attempts: 2
  backoff_ms: 500
```

### 3.2 Event Bus Contract

- Use Redis Streams/NATS as the bus.
- Standard events: `stage:start`, `stage:progress`, `stage:complete`,
  `stage:error`, `poll:create`, `poll:resolve`, `token:spend`, `obs:status`.
- Agents publish structured proposals (`{stage_id, agent_id, payload,
  confidence, cost_estimate}`) and the orchestrator adjudicates.

### 3.3 Token Allocator

- Pre-allocate budgets per stage, per agent.
- Agents must lease tokens before hitting an LLM endpoint; unused tokens are
  returned.
- Token spend is tracked per event and rolled into analytics.

### 3.4 State Snapshots

- Maintain a versioned story state in Redis (hash or JSON doc) with diff
  metadata. Each stage writes a patch with `pre_state_hash` → `post_state_hash`.
- Allows deterministic replay and rollback.

---

## 4. Audience Poll Integration

1. **Poll Node in DAG** – Polls block dependent stages until resolved or the
   timeout hits.
2. **Poll Service** – FastAPI/Node microservice that:
   - Emits poll events on the bus.
   - Streams tallies to the dashboard and OBS overlay via WebSocket.
   - Returns the winning option (with percentages) to the orchestrator.
3. **Budget Awareness** – Poll results can carry metadata like `requires_extra`;
   the orchestrator can prompt: “Audience wants a rewrite; approve spend of X
   tokens?”

---

## 5. Validation Console

### 5.1 Goals

- Replace unreliable “mock mode” with deterministic smoke tests.
- Give operators one-click checks for audio, MCP endpoints, and streaming.

### 5.2 Structure

| Card | Tests | Notes |
|------|-------|-------|
| Audio Services | Narration, commentary, ambient, music (single + blend) | Show latency, metadata, audio preview |
| MCP Extensions | Builder, Viewer, Surveyor, Streamer, Recorder | Replay canned payloads, show raw responses |
| Streaming Control | OME ping, YouTube handshake, start/stop macros | Works via OBS bridge |
| Agent Roundtrip | Send a canned beat through orchestrator sans mocks | Confirms coordination |
| Health | Tail logs, display GPU/token stats | Integrates with Prometheus/logging |

### 5.3 Implementation Notes

- Frontend (React/Vue) reads a JSON config describing each test (`name`,
  `endpoint`, `payload`, `expected`).
- Backend orchestrates calls, records timings, streams results over WebSocket.

---

## 6. OBS Integration Strategy

- Use `obs-websocket` (v5) with authentication.
- Provide basic commands:
  - `Connect / Disconnect`
  - `GetSceneList`, `GetProfileList`
  - `SetCurrentScene` (e.g., switch to Kokoro test layout)
  - `TriggerHotkeyByName` for start/stop streaming or recording macros
  - `GetSourceActive` to confirm SRT layers are feeding
- Expose a minimal REST bridge (part of the validation console backend) so the
  UI can trigger these actions.
- For external streaming vendors (YouTube/Twitch), rely on OBS profiles; our
  tooling only verifies OBS reports “streaming active” and displays stats.

---

## 7. Agent Role Reinterpretation

Keep the roles from the original doc, but align them with the orchestrator:

| Role | Primary Responsibility | Orchestration Hooks |
|------|------------------------|---------------------|
| Story Director | Macro narrative arc | Receives `stage:start`, publishes story beats |
| Plot Weaver | Branch management | Subscribes to poll outcomes, updates DAG |
| Set Designer | Asset placement | Executes placement stage using WorldBuilder |
| Cinematographer | Camera flow | Runs camera stage, outputs shot plans |
| Location Scout | Waypoints | Maintains waypoint subsets, writes to state |
| Audience Whisperer | Poll creation | Generates poll prompts, listens to chat sentiment |
| Genre Master | Tone and style | Validates outputs; can veto stage completion |
| Technical Director | QoS and streaming | Monitors token/time budgets, triggers OBS macros |

All agents operate via the event bus and the shared story state. No direct
coupling between agents; the orchestrator handles conflicts and merges.

---

## 8. Budget Management Detail

1. **Stage Budgets** – Defined in the DAG config. The orchestrator refuses to
   start a stage if the global remaining budget is too low.
2. **Agent Quotas** – Each agent has daily/episode limits. The orchestrator can
   prompt for manual approval when exhausted.
3. **Late Queue** – Proposals arriving after the deadline are stored as
   optional extras; they can be surfaced to the operator, but do not auto-run.
4. **Telemetry** – Persist token burn per stage/agent. Present trends in the
   validation console.

---

## 9. Implementation Phases (Recast)

1. **Phase A – Orchestrator Skeleton**
   - Build DAG runner, event bus, token allocator.
   - Integrate existing agents in mock/test mode.
2. **Phase B – Validation Console & OBS Bridge**
   - UI + backend tests for audio/MCP/streaming.
   - OBS WebSocket integration.
3. **Phase C – Audience Poll Service**
   - Poll creation/resolution pipeline.
   - Dashboard overlay + orchestrator gating.
4. **Phase D – Budget Discipline**
   - Add token leasing, telemetry dashboard.
   - Define approval workflows for overages.
5. **Phase E – Production Hardening**
   - Monitoring, alerts, replay tools, analytics.
   - Expand validation suite with regression scenarios.

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Orchestrator complexity | Keep DAG config declarative; add simulation mode |
| Token overruns | Enforce allocator at API boundary; provide manual overrides |
| OBS drift | Version-control OBS profiles; add health checks in validation console |
| Poll spam/chaos | Cap poll frequency; require minimum vote delta before acting |
| Isaac Sim latency | Stage budgets include time caps; Technical Director agent can downgrade scene complexity |

---

## 11. Summary

- The original architecture remains valid: Isaac Sim as the stage, MCP
  extensions as tooling, specialized agents as creative staff.
- This blueprint adds the operational backbone: orchestration DAG, event bus,
  token economy, deterministic validation, and a clean OBS integration.
- With these pieces, we can iterate quickly without melting budgets or losing
  confidence in the system.
