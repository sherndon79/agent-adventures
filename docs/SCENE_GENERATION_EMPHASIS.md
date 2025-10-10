# Scene Generation Emphasis - Implementation Summary

**Date:** 2025-10-08
**Purpose:** Ensure LLM agents understand that scene generation is the PRIMARY feature of Agent Adventures

## Problem Statement

Scene generation is the most critical workflow in Agent Adventures, but the LLM prompts treated it equally to other tasks (camera, story). This led to:
- Insufficient detail in scene proposals
- Minimal reasoning provided by agents
- Token budget allocation treating all tasks equally
- Agents not understanding the importance hierarchy

## Solution Overview

Enhanced the LLM prompt chain to emphasize scene generation as the **PRIMARY FEATURE** at multiple levels:

1. **System Prompt Enhancement** - Sets the overall tone and priorities
2. **User Prompt Reinforcement** - Reminds the agent for each specific request
3. **Token Budget Prioritization** - Allocates maximum tokens to scene tasks

## Changes Made

### 1. System Prompt (`_loadSystemPrompt` in multi-llm-agent.js:1200-1221)

**Before:**
```javascript
scene: "You are a Scene Agent for Agent Adventures. Focus on spatial reasoning and asset placement with Z-up coordinates. Always query spatial context first."
```

**After:**
```javascript
scene: `You are a Scene Agent for Agent Adventures, responsible for the MOST CRITICAL aspect of the entire workflow: creating compelling, detailed 3D scenes.

IMPORTANCE: Scene generation is the PRIMARY FEATURE of this system. Dedicate maximum effort and creativity to crafting rich, immersive environments. This is where you should invest the most thought, detail, and computational resources.

Your scene proposals should be:
- Highly detailed with thoughtful spatial composition
- Visually striking and narratively meaningful
- Demonstrating sophisticated spatial reasoning with Z-up coordinates
- Creating multiple interconnected elements that tell a story
- Showing deep consideration of lighting, scale, color harmony, and spatial relationships

Always query spatial context first and create scenes that viewers will remember. This is the cornerstone of Agent Adventures - make it exceptional.`
```

**Impact:**
- Sets clear priority hierarchy from the start
- Defines quality expectations explicitly
- Encourages creative, detailed thinking
- Emphasizes visual and narrative impact

### 2. User Prompt Enhancement (`_formatLLMPrompt` in multi-llm-agent.js:378-418)

**Added for `asset_placement` proposals:**
```javascript
if (proposalType === 'asset_placement') {
  prompt += `🎯 CRITICAL: This is scene generation - the MOST IMPORTANT part of Agent Adventures. Invest maximum effort here.\n\n`;
  prompt += `Your scene proposal will directly determine the visual quality and audience engagement. Go beyond basic placement - think like a film production designer creating an unforgettable set.\n\n`;
}
```

**Enhanced format guidance:**
```javascript
case 'asset_placement':
  prompt += `\n\nResponse should include: position [x,y,z], element_type, name, scale [x,y,z], color [r,g,b], and detailed reasoning.`;
  prompt += `\n\nIMPORTANT: Provide rich, thoughtful reasoning explaining:`;
  prompt += `\n- Why this specific placement creates visual impact`;
  prompt += `\n- How it contributes to the narrative and spatial composition`;
  prompt += `\n- What emotional or atmospheric effect it achieves`;
  prompt += `\n- How it relates to other scene elements and the overall environment`;
  break;
```

**Impact:**
- Reinforces importance at every task invocation
- Uses visual marker (🎯) to draw attention
- Provides concrete guidance on reasoning depth
- Encourages holistic scene design thinking

### 3. Token Budget Prioritization (`_callLLM` in multi-llm-agent.js:325-328)

**Before:**
```javascript
const maxTokens = config.tokens.maxPerProposal;
```

**After:**
```javascript
// Scene generation (asset_placement) gets significantly more tokens - this is the PRIMARY feature
const maxTokens = llmContext.proposalType === 'asset_placement'
  ? config.llm[this.llmModel]?.maxTokens || 6000  // Use model-specific max tokens for scenes
  : config.tokens.maxPerProposal;  // Other proposal types use standard budget
```

**Impact:**
- Scene agents get **6000 tokens** vs standard 2000 tokens (3x increase)
- Allows for detailed reasoning and complex scene descriptions
- Aligns computational resources with stated priorities
- Model-specific allocation (Claude: 6000, GPT: 6000, Gemini: 6000)

## Token Allocation Summary

| Proposal Type | Token Budget | Justification |
|--------------|--------------|---------------|
| `asset_placement` | **6000 tokens** | PRIMARY feature - deserves maximum resources |
| `camera_move` | 2000 tokens | Supporting feature |
| `story_advance` | 2000 tokens | Supporting feature |

## Expected Outcomes

1. **Richer Scene Descriptions:** Agents will provide more detailed, thoughtful proposals with extensive reasoning
2. **Better Visual Quality:** Emphasis on composition, color, scale will lead to more polished scenes
3. **Narrative Integration:** Agents will consider story implications more deeply
4. **Competitive Proposals:** With clear priorities, agents will compete on scene quality metrics

## Validation Testing

To test these changes:

```bash
# Run scene agent proposal generation
node scripts/test-scene-agent-proposals.js

# Check for:
# 1. Longer reasoning sections (>200 words)
# 2. References to visual impact, composition, atmosphere
# 3. Token usage approaching 6000 tokens for scenes
# 4. Detailed spatial relationship explanations
```

## Future Enhancements

Consider implementing:
1. **Batch Scene Generation:** Allow agents to propose multiple interconnected assets (4+ batches)
2. **Scene Complexity Metrics:** Track proposal richness quantitatively
3. **Visual Quality Scoring:** Judge panel criteria specifically for scene aesthetics
4. **Compositional Guidelines:** Add golden ratio, rule of thirds guidance to prompts
5. **Lighting Emphasis:** Expand prompts to include lighting strategy and mood

## Related Files

- `/home/sherndon/agent-adventures/src/core/multi-llm-agent.js` - Core prompt implementation
- `/home/sherndon/agent-adventures/src/agents/scene-agent/index.js` - Scene agent specifics
- `/home/sherndon/agent-adventures/src/config/environment.js` - Token budget configuration

## Notes

- This change is **backward compatible** - other proposal types unaffected
- Token budgets are per-proposal, not per-batch
- Scene agents still compete; emphasis helps all agents improve quality
- Structured output fixes (Claude markdown, GPT strict mode, Gemini) ensure reliable JSON parsing
