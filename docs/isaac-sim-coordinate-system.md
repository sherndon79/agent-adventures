# Isaac Sim Coordinate System Reference

## Critical Information for Agent Development

### Coordinate System
- **X**: Left/Right (negative X = left, positive X = right)
- **Y**: Forward/Backward (negative Y = backward, positive Y = forward)
- **Z**: Up/Down (negative Z = down, **positive Z = up**)

⚠️ **IMPORTANT**: Isaac Sim uses **Z-up** coordinate system, unlike many other 3D applications that use Y-up.

## Implications for Agents

### Set Designer Agent
- Ground level is typically at Z=0
- Buildings/objects extend in +Z direction (upward)
- Gravity acts in -Z direction (downward)
- When placing objects, consider Z position for height off ground

### Cinematographer Agent (WorldViewer)
- Camera elevation controlled by Z position
- Higher Z values = elevated/aerial shots
- Ground-level shots typically have Z slightly above 0
- Look-at targets should account for object Z heights

### Location Scout Agent (WorldSurveyor)
- Waypoints should include proper Z coordinates
- Ground waypoints typically at Z=0 or slightly above
- Elevated waypoints for dramatic camera positions
- Consider Z for character eye-level positions

## Common Position Examples

### Ground Level Positions
```javascript
// Character standing on ground
position: [10, 5, 0]  // X=10, Y=5, Z=0 (ground level)

// Object placed on ground
position: [0, 0, 0]   // At origin, on ground

// Slightly elevated (avoiding ground clipping)
position: [5, -3, 0.1]  // Just above ground level
```

### Elevated Positions
```javascript
// Second floor of building
position: [10, 5, 3.0]  // 3 units above ground

// Aerial camera shot
position: [0, -10, 15]  // 15 units high, looking down

// Floating magical object
position: [2, 8, 2.5]   // 2.5 units above ground
```

### Camera Positions
```javascript
// Eye-level shot (human height ~1.7m)
cameraPosition: [5, -8, 1.7]  // Z=1.7 for human eye level

// Low angle shot (looking up)
cameraPosition: [0, -5, 0.5]  // Low to ground, looking up

// High angle shot (bird's eye view)
cameraPosition: [0, -10, 20]  // High above, looking down
```

## MCP Integration Notes

### WorldBuilder Commands
```javascript
// Placing a cube on the ground
await worldBuilder.addElement('cube', 'ground_cube', [10, 5, 0.5]);
// Z=0.5 puts cube center 0.5 units above ground (cube is 1x1x1)

// Building a tower
await worldBuilder.addElement('cylinder', 'tower_base', [0, 0, 2.5]);
// Z=2.5 makes a 5-unit tall tower (extends from Z=0 to Z=5)
```

### WorldViewer Camera Control
```javascript
// Set camera to look at building from eye level
await worldViewer.setCameraPosition([10, -15, 1.8], [0, 0, 2.5]);
// Camera at Z=1.8 (eye level), looking at building center at Z=2.5
```

### WorldSurveyor Waypoints
```javascript
// Create waypoint for dramatic reveal shot
await worldSurveyor.createWaypoint([20, -30, 8], 'dramatic_reveal');
// Z=8 for elevated dramatic angle
```

## Agent Implementation Guidelines

### For Set Designer Agent
1. Always consider Z=0 as ground level
2. Place objects with appropriate Z offsets for their size
3. Buildings should have foundations at Z=0, extend upward
4. Natural terrain can have varying Z values for hills/valleys

### For Cinematographer Agent
1. Use Z position to control camera elevation and drama
2. Low Z values (0-2) for intimate, ground-level shots
3. Medium Z values (3-8) for establishing shots
4. High Z values (10+) for aerial/dramatic overview shots

### For All Agents
1. When calculating distances, remember to include Z component
2. Collision detection must account for Z-axis positioning
3. Lighting positions need appropriate Z heights
4. Character interactions require matching Z levels

## Common Mistakes to Avoid

❌ **Wrong**: `position: [10, 5, 0]` for a floating object
✅ **Correct**: `position: [10, 5, 3.0]` (3 units above ground)

❌ **Wrong**: Camera at `[10, -15, 0]` to look at tall building
✅ **Correct**: Camera at `[10, -15, 8]` for proper building framing

❌ **Wrong**: Waypoint at `[5, 5, 0]` for aerial transition
✅ **Correct**: Waypoint at `[5, 5, 12]` for true aerial view

## Quick Reference

- **Ground Level**: Z = 0
- **Human Eye Level**: Z ≈ 1.7
- **Second Story**: Z ≈ 3-4
- **Aerial View**: Z ≥ 10
- **Object Placement**: Z = (object_height / 2) for center-based objects

Remember: When in doubt, visualize the scene with Z pointing upward like a skyscraper!