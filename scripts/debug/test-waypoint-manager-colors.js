#!/usr/bin/env node

/**
 * WorldSurveyor Color-Coded Groups Test
 * Creates groups with different colors and waypoints for waypoint manager demonstration
 */

import { config } from '../../src/config/environment.js';
import { WorldSurveyorClient } from '../../src/services/mcp-clients/worldsurveyor-client.js';

async function createColoredGroupsDemo() {
  console.log('🎨 Creating Color-Coded Groups for Waypoint Manager Demo\n');

  let client;
  try {
    // Initialize client
    console.log('📡 Connecting to WorldSurveyor MCP...');
    client = new WorldSurveyorClient({ enableLogging: true });
    await client.initialize();
    console.log('✅ Connected successfully\n');

    // Helper function to convert hex to RGB
    function hexToRgb(hex) {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
        parseInt(result[1], 16) / 255,
        parseInt(result[2], 16) / 255,
        parseInt(result[3], 16) / 255
      ] : null;
    }

    // Clear existing data first
    console.log('🧹 Clearing existing waypoints and groups...');
    try {
      await client.clearWaypoints(true);
      console.log('✅ Cleared existing data\n');
    } catch (error) {
      console.log('⚠️ Clear failed (might be empty):', error.message, '\n');
    }

    // Department-based color coding
    const departments = [
      {
        name: "Camera Department",
        description: "All camera-related waypoints and shots",
        color: hexToRgb("#E74C3C"), // Red
        waypoints: [
          { name: "Hero Shot Position", type: "camera_position", position: [5, 8, 3] },
          { name: "Wide Establishing Shot", type: "camera_position", position: [12, 15, 6] },
          { name: "Character Close-up", type: "camera_position", position: [2, 5, 2] }
        ]
      },
      {
        name: "Lighting Department",
        description: "Lighting setup and directional waypoints",
        color: hexToRgb("#F39C12"), // Orange
        waypoints: [
          { name: "Key Light Position", type: "directional_lighting", position: [10, 5, 8] },
          { name: "Fill Light Setup", type: "directional_lighting", position: [0, 10, 6] },
          { name: "Rim Light Angle", type: "directional_lighting", position: [-5, 8, 7] }
        ]
      },
      {
        name: "Art Department",
        description: "Asset placement and set decoration points",
        color: hexToRgb("#27AE60"), // Green
        waypoints: [
          { name: "Hero Prop Placement", type: "asset_placement", position: [3, 3, 0.5] },
          { name: "Background Asset 1", type: "asset_placement", position: [-2, 8, 0] },
          { name: "Set Decoration Anchor", type: "asset_placement", position: [8, 2, 1] }
        ]
      },
      {
        name: "VFX Department",
        description: "Visual effects reference and tracking points",
        color: hexToRgb("#8E44AD"), // Purple
        waypoints: [
          { name: "VFX Reference Point 1", type: "point_of_interest", position: [6, 6, 4] },
          { name: "Tracking Marker", type: "point_of_interest", position: [1, 12, 2] },
          { name: "Composite Reference", type: "point_of_interest", position: [9, 1, 3] }
        ]
      },
      {
        name: "Audio Department",
        description: "Audio capture and ambient sound points",
        color: hexToRgb("#3498DB"), // Blue
        waypoints: [
          { name: "Primary Audio Source", type: "audio_source", position: [4, 7, 2] },
          { name: "Ambient Sound Point", type: "audio_source", position: [7, 11, 1.5] },
          { name: "Echo Reference", type: "audio_source", position: [-1, 4, 3] }
        ]
      }
    ];

    // Create hierarchical groups with status subgroups
    const statusGroups = [
      { name: "Planning Phase", color: hexToRgb("#95A5A6"), description: "Waypoints in planning stage" }, // Gray
      { name: "In Progress", color: hexToRgb("#F1C40F"), description: "Currently being worked on" }, // Yellow
      { name: "Review", color: hexToRgb("#E67E22"), description: "Ready for review" }, // Orange
      { name: "Approved", color: hexToRgb("#2ECC71"), description: "Approved and finalized" } // Green
    ];

    console.log('🏗️ Creating department groups and waypoints...\n');

    const createdGroups = {};

    // Create main department groups
    for (const dept of departments) {
      console.log(`📁 Creating group: ${dept.name} (RGB: [${dept.color.map(c => c.toFixed(2)).join(', ')}])`);

      try {
        const groupResult = await client.executeCommand('worldsurveyor_create_group', {
          name: dept.name,
          description: dept.description,
          color: dept.color
        });

        if (groupResult.success && groupResult.result?.structuredContent?.result?.group_id) {
          const groupId = groupResult.result.structuredContent.result.group_id;
          createdGroups[dept.name] = groupId;
          console.log(`✅ Created group ${dept.name} (ID: ${groupId})`);

          // Create waypoints for this department
          for (const waypoint of dept.waypoints) {
            console.log(`  📍 Creating waypoint: ${waypoint.name}`);

            try {
              const waypointResult = await client.executeCommand('worldsurveyor_create_waypoint', {
                position: waypoint.position,
                waypoint_type: waypoint.type,
                name: waypoint.name
              });

              if (waypointResult.success && waypointResult.result?.structuredContent?.result?.waypoint_id) {
                const waypointId = waypointResult.result.structuredContent.result.waypoint_id;

                // Add waypoint to group
                await client.executeCommand('worldsurveyor_add_waypoint_to_groups', {
                  waypoint_id: waypointId,
                  group_ids: [groupId]
                });

                console.log(`  ✅ Created and grouped waypoint: ${waypoint.name}`);
              }
            } catch (error) {
              console.log(`  ❌ Failed to create waypoint ${waypoint.name}:`, error.message);
            }
          }
        }
      } catch (error) {
        console.log(`❌ Failed to create group ${dept.name}:`, error.message);
      }

      console.log(''); // Empty line for readability
    }

    // Create status-based subgroups under Camera Department
    if (createdGroups["Camera Department"]) {
      console.log('🎯 Creating status subgroups under Camera Department...\n');

      for (const status of statusGroups.slice(0, 2)) { // Just create 2 for demo
        console.log(`📁 Creating subgroup: ${status.name}`);

        try {
          const subgroupResult = await client.executeCommand('worldsurveyor_create_group', {
            name: status.name,
            description: status.description,
            color: status.color,
            parent_group_id: createdGroups["Camera Department"]
          });

          if (subgroupResult.success) {
            console.log(`✅ Created subgroup: ${status.name}`);
          }
        } catch (error) {
          console.log(`❌ Failed to create subgroup ${status.name}:`, error.message);
        }
      }
    }

    // List final groups to show structure
    console.log('\n📋 Final group structure:');
    try {
      const groupsList = await client.executeCommand('worldsurveyor_list_groups');
      if (groupsList.success && groupsList.result?.structuredContent?.result?.groups) {
        const groups = groupsList.result.structuredContent.result.groups;
        console.log(JSON.stringify(groups, null, 2));
      }
    } catch (error) {
      console.log('❌ Failed to list groups:', error.message);
    }

    console.log('\n🎨 Demo created successfully!');
    console.log('📱 Open the WorldSurveyor Waypoint Manager to see color-coded groups:');
    console.log('   http://localhost:8903/waypoint-manager');
    console.log('\n🎯 You should see:');
    console.log('   🔴 Camera Department (Red)');
    console.log('   🟠 Lighting Department (Orange)');
    console.log('   🟢 Art Department (Green)');
    console.log('   🟣 VFX Department (Purple)');
    console.log('   🔵 Audio Department (Blue)');
    console.log('   └── 📁 Status subgroups under Camera Department');

  } catch (error) {
    console.log('💥 Fatal error:', error.message);
  } finally {
    if (client) {
      await client.disconnect();
      console.log('📡 Disconnected from WorldSurveyor MCP');
    }
  }
}

// Run the demo
createColoredGroupsDemo().catch(console.error);