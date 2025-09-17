# Agent Adventures - Competition Architecture

## Overview
Hybrid audience-judge competition system that conserves tokens while maximizing engagement through strategic use of audience polling for high-level decisions and AI judge panels for technical execution.

## Core Principle: Token Conservation Strategy

**AUDIENCE DECIDES** → High-level creative direction (free)
**WINNER EXECUTES** → Only winning agent spends major tokens
**JUDGE OPTIMIZES** → Technical quality without audience cognitive load

---

## Competition Types & Token Strategy

### 1. GENRE SELECTION
**Process:**
- 🤖 **Agents**: Generate 5 genre options (minimal tokens - 1 sentence each)
- 👥 **Audience**: Vote via chat poll (zero tokens)
- 🏆 **Winner**: Winning agent gets story control for entire session

**Token Cost:** `LOW` - Only 5 short proposals

### 2. STORY PROGRESSION
**Process:**
- 🤖 **Agents**: Create story direction summaries (minimal tokens - 1-2 sentences)
- 👥 **Audience**: Vote on preferred direction (zero tokens)
- 🏆 **Winner**: Winning agent crafts full 3-5 min narrative + scene direction (major tokens)
- ⚖️ **Judge Panel**: Reviews technical execution only

**Token Cost:** `WINNER-ONLY` - Major tokens spent only by chosen agent

### 3. ASSET PLACEMENT
**Process:**
- 🤖 **Agents**: Generate object/placement concepts (minimal tokens)
- ⚖️ **Judge Panel**: Evaluate spatial reasoning, collision avoidance, aesthetics
- 🏆 **Winner**: Execute MCP calls to Isaac Sim
- 👥 **Audience**: See results, no voting needed

**Token Cost:** `JUDGE-EFFICIENT` - Technical evaluation, no audience cognitive load

### 4. CAMERA MOVEMENT
**Process:**
- 🤖 **Agents**: Propose camera concepts (minimal tokens - "dramatic close-up", "sweeping overhead")
- ⚖️ **Judge Panel**: Evaluate cinematic quality, technical feasibility
- 🏆 **Winner**: Execute camera positioning via MCP
- 👥 **Audience**: Experience result, no voting burden

**Token Cost:** `JUDGE-EFFICIENT` - Technical cinematic decisions

---

## Workflow: Complete Story Segment

### Phase 1: Story Direction (AUDIENCE)
```
1. Current 3-5 min TTS segment ends at decision point
2. Agents compete → 3 story direction summaries (15-25 words each)
   - Claude: "Investigate the mysterious cave sounds - could be treasure or danger"
   - Gemini: "Confront the village elder about the ancient map's true meaning"
   - GPT: "Follow the strange lights toward the forbidden forest edge"
3. Audience votes → A, B, or C via chat poll (3-5 min voting period)
4. Winner announced with agent credit
```

### Phase 2: Story Crafting (WINNER ONLY)
```
1. Winning agent crafts full narrative (500-1000 words)
2. Creates scene direction for Isaac Sim
3. Generates TTS script with dramatic pacing
4. Submits asset placement requests
5. Submits camera movement sequence
```

### Phase 3: Technical Execution (JUDGE PANEL)
```
1. Judge panel evaluates:
   - Asset placement spatial reasoning
   - Camera movement cinematography
   - Scene coherence with story
2. Optimizes technical parameters
3. Approves MCP execution plan
4. Winner executes Isaac Sim changes
```

### Phase 4: Delivery & Next Cycle
```
1. TTS narrates winning story segment
2. Isaac Sim displays scene changes
3. New decision point reached → return to Phase 1
```

---

## Token Economy Breakdown

### HIGH TOKEN USAGE (Winner Only):
- **Full Story Crafting** → 500-1000 word narratives
- **Scene Direction** → Detailed Isaac Sim instructions
- **TTS Script Generation** → Dramatic pacing and dialogue

### MINIMAL TOKEN USAGE (All Agents):
- **Story Summaries** → 15-25 words maximum
- **Concept Proposals** → Single sentence descriptions
- **Technical Specifications** → Structured parameter lists

### ZERO TOKEN USAGE:
- **Audience Voting** → Chat poll responses
- **Results Display** → Automated tallying
- **Winner Announcement** → Template-based

---

## Agent Specialization & Branding

### Claude 🧠 "The Strategist"
- **Strength**: Spatial reasoning, logical progression
- **Story Style**: Mystery, puzzles, systematic exploration
- **Technical**: Precise asset placement, strategic camera work

### Gemini 💎 "The Visionary"
- **Strength**: Bold visual composition, dramatic moments
- **Story Style**: Action, visual spectacle, emotional peaks
- **Technical**: Dynamic camera movements, striking visual design

### GPT ⚖️ "The Crowd-Pleaser"
- **Strength**: Balanced engagement, audience connection
- **Story Style**: Character development, relatable choices
- **Technical**: Smooth transitions, accessible cinematography

---

## Audience Engagement Points

### AUDIENCE VOTES ON:
- Genre selection (session start)
- Story direction summaries (every 3-5 min)
- Major narrative branches
- Character relationship choices

### AUDIENCE EXPERIENCES:
- Asset placement results
- Camera movement execution
- TTS story narration
- Isaac Sim scene evolution
- Agent win/loss tracking
- Personality recognition over time

---

## Quality Controls

### Judge Panel Criteria:
- **Technical Feasibility** → Can Isaac Sim execute this?
- **Spatial Coherence** → Do objects make sense in 3D space?
- **Cinematic Quality** → Are camera movements engaging?
- **Story Consistency** → Does scene match narrative?

### Audience Protection:
- **Content Filtering** → Judge panel blocks inappropriate content
- **Quality Baseline** → Minimum standard for all options
- **Tie Breaking** → Judge panel resolves close votes
- **Emergency Mode** → Judge takes over if audience engagement drops

---

## Implementation Priority

### Phase 1: Core Competition
1. Story direction summaries + audience voting
2. Winner-only full story crafting
3. Basic Isaac Sim integration

### Phase 2: Technical Excellence
1. Judge panel for asset placement
2. Camera movement optimization
3. Advanced MCP integration

### Phase 3: Streaming Integration
1. YouTube/Twitch chat polling
2. TTS story narration
3. Real-time audience metrics

### Phase 4: Advanced Features
1. Agent personality tracking
2. Audience favorite recognition
3. Long-term story arc management

---

## Success Metrics

### Token Efficiency:
- **Target**: 80% token reduction vs full-AI decision making
- **Method**: Audience handles high-level choices, AI handles execution

### Engagement Quality:
- **Target**: Meaningful audience participation without cognitive overload
- **Method**: Simple A/B/C choices with clear consequences

### Entertainment Value:
- **Target**: Agent personality recognition and fan development
- **Method**: Consistent agent branding with visible win/loss tracking