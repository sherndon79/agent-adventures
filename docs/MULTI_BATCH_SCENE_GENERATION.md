# Multi-Batch Scene Generation - Implementation

**Date:** 2025-10-08
**Purpose:** Enable agents to create rich, complex scenes with multiple thematic batches instead of single assets

## Problem Statement

The previous implementation requested **single asset placements**, which meant:
- Agents could only propose one object at a time
- No holistic scene composition
- Inefficient use of the 6000 token budget
- Scenes lacked depth, layers, and complexity
- No clear spatial hierarchy (foreground, midground, background)

## Solution

Changed the schema from requesting **1 asset** to requesting **3-5 batches** of assets, where each batch serves a distinct compositional purpose.

---

## Schema Changes

### Before (Single Asset)
```json
{
  "data": {
    "element_type": "cube",
    "name": "hero_statue",
    "position": [2.0, -1.5, 0.4],
    "scale": [1.2, 1.2, 1.2],
    "color": [0.7, 0.6, 0.5]
  },
  "reasoning": "Places hero statue..."
}
```

### After (Multi-Batch)
```json
{
  "data": {
    "batches": [
      {
        "batch_name": "foreground_hero_elements",
        "description": "Primary focal points that draw immediate attention",
        "elements": [
          {
            "element_type": "cube",
            "name": "hero_pedestal",
            "position": [0, 0, 0.5],
            "scale": [2.0, 2.0, 1.0],
            "color": [0.7, 0.6, 0.5]
          },
          {
            "element_type": "sphere",
            "name": "mystical_orb",
            "position": [0, 0, 2.0],
            "scale": [0.8, 0.8, 0.8],
            "color": [0.2, 0.6, 0.9]
          }
        ]
      },
      {
        "batch_name": "architectural_framing",
        "description": "Structural elements that frame the scene",
        "elements": [
          {
            "element_type": "cylinder",
            "name": "left_pillar",
            "position": [-3.0, 0, 2.5],
            "scale": [0.5, 0.5, 5.0],
            "color": [0.5, 0.5, 0.6]
          },
          {
            "element_type": "cylinder",
            "name": "right_pillar",
            "position": [3.0, 0, 2.5],
            "scale": [0.5, 0.5, 5.0],
            "color": [0.5, 0.5, 0.6]
          }
        ]
      },
      {
        "batch_name": "atmospheric_background",
        "description": "Environmental details creating depth",
        "elements": [
          {
            "element_type": "cube",
            "name": "distant_platform",
            "position": [0, -8.0, 0.2],
            "scale": [6.0, 4.0, 0.4],
            "color": [0.3, 0.3, 0.4]
          }
        ]
      }
    ]
  },
  "reasoning": "Three-layer composition: foreground hero elements create focus..."
}
```

---

## File Changes

### 1. Schema Definition (`multi-llm-agent.js:569-655`)

**New Structure:**
```javascript
{
  type: 'object',
  required: ['data', 'reasoning'],
  properties: {
    data: {
      required: ['batches'],
      properties: {
        batches: {
          type: 'array',
          minItems: 3,    // Minimum 3 batches required
          maxItems: 12,   // Up to 12 batches allowed
          items: {
            required: ['batch_name', 'elements'],
            properties: {
              batch_name: { type: 'string' },
              description: { type: 'string' },
              elements: {
                type: 'array',
                minItems: 1,
                maxItems: 8,  // Each batch can have up to 8 elements
                items: {
                  required: ['element_type', 'name', 'position'],
                  properties: {
                    element_type, name, position, scale, color, parent_path
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

**Key Constraints:**
- **Minimum 3 batches** required per proposal
- **Maximum 12 batches** allowed
- Each batch contains **1-8 elements**
- Each element has standard properties (type, name, position, scale, color)

### 2. User Prompt Enhancement (`multi-llm-agent.js:405-419`)

Added explicit guidance on batch organization:

```
CREATE A COMPLETE SCENE WITH MULTIPLE BATCHES:

You must organize your scene into 3-5 thematic batches (minimum 3). Each batch should serve a distinct purpose:
- Foreground/Hero Elements: Primary focal points (2-4 elements)
- Midground/Structural: Framing, architecture, context (2-6 elements)
- Background/Atmospheric: Depth, atmosphere, environment (2-4 elements)
- Optional: Detail layers, lighting elements, narrative props

IMPORTANT: Provide rich, thoughtful reasoning explaining:
- Overall compositional strategy across all batches
- How each batch layer contributes to depth and visual hierarchy
- Color palette and lighting design across the full scene
- Narrative story told through spatial arrangement
- Emotional journey from foreground to background
```

### 3. Example Update (`multi-llm-agent.js:736-805`)

Provides concrete 3-batch example showing:
- **Foreground**: hero_pedestal + mystical_orb
- **Midground**: left_pillar + right_pillar
- **Background**: distant_platform + ambient_light_source

### 4. SceneConstruction Phase (`SceneConstruction.js:8-83`)

**Updated to handle batches:**

```javascript
const batches = winningProposal.data?.batches || winningProposal.batches || [];

for (const batch of batches) {
  await mcpClients.worldBuilder.createBatch(
    batch.batch_name,
    batch.elements,
    batch.parent_path || '/World'
  );

  eventBus.emit('loop:batch_created', {
    batchName: batch.batch_name,
    elementCount: batch.elements.length,
    description: batch.description
  });
}
```

**Features:**
- Backward compatible (checks for legacy `.assets` format)
- Sequential batch creation with error handling
- Event emission for each batch created
- Final summary event with total batch/element counts

---

## Expected Scene Complexity

| Metric | Before | After |
|--------|--------|-------|
| **Assets per proposal** | 1 | 6-24 (3-5 batches × 1-8 elements) |
| **Spatial layers** | 1 | 3-5 (foreground, mid, background, etc.) |
| **Batch calls to WorldBuilder** | 1 | 3-12 |
| **Compositional thinking** | Single object | Full scene design |

---

## Prompt Strategy

The prompts now encourage agents to think like **film production designers**:

1. **System Prompt** - Establishes scene generation as PRIMARY FEATURE
2. **User Prompt** - Requires multi-batch organization with specific layer purposes
3. **Token Budget** - Allocates 6000 tokens to support detailed multi-batch reasoning
4. **Schema** - Enforces minimum 3 batches via `minItems: 3`
5. **Example** - Shows concrete 3-layer composition

---

## Benefits

### For Agents:
- Clear compositional framework (foreground/mid/background)
- Encouragement to create depth and visual hierarchy
- Ability to demonstrate sophisticated scene design thinking
- Freedom to create 6-24 objects instead of just 1

### For Scenes:
- Much richer visual complexity
- Proper spatial layering and depth
- Cohesive color palettes across elements
- Narrative storytelling through spatial arrangement
- Better use of 6000 token budget

### For Development:
- Multiple batch calls to WorldBuilder MCP as requested
- Backward compatible with single-batch fallback
- Event-driven architecture for batch creation tracking
- Clear separation of concerns (batches = thematic groups)

---

## Testing

To verify multi-batch proposals:

```bash
# Run scene generation with real LLMs
MOCK_LLM_MODE=false npm start

# Check logs for:
# - "[SceneConstruction] Creating N batches..."
# - "[SceneConstruction] Creating batch 'foreground_hero_elements' with 3 elements"
# - Multiple worldBuilder.createBatch() calls
```

Expected log output:
```
[SceneConstruction] Creating 3 batches...
[SceneConstruction] Creating batch "foreground_hero_elements" with 2 elements
[SceneConstruction] Creating batch "architectural_framing" with 2 elements
[SceneConstruction] Creating batch "atmospheric_background" with 2 elements
```

---

## Future Enhancements

1. **Batch Timing:** Stagger batch creation with dramatic pauses
2. **Batch Dependencies:** Allow batches to reference earlier batches for positioning
3. **Batch Metadata:** Track performance metrics per batch
4. **Visual Preview:** Dashboard visualization of batch layers
5. **Batch Voting:** Audience can vote on which batch to add next

---

## Related Documentation

- [SCENE_GENERATION_EMPHASIS.md](./SCENE_GENERATION_EMPHASIS.md) - Prompt enhancement details
- [STRUCTURED_OUTPUT_FINDINGS.md](./STRUCTURED_OUTPUT_FINDINGS.md) - JSON parsing fixes

## Files Modified

1. `/home/sherndon/agent-adventures/src/core/multi-llm-agent.js`
   - Schema: lines 569-655
   - Prompt: lines 405-419
   - Example: lines 736-805

2. `/home/sherndon/agent-adventures/src/story-loop/SceneConstruction.js`
   - Batch processing: lines 8-83
