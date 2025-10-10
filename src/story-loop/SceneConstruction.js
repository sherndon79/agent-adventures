import { BasePhase } from './BasePhase.js';

export class SceneConstruction extends BasePhase {
  constructor(dependencies) {
    super('scene-construction', dependencies);
  }

  async enter(context) {
    const { eventBus, mcpClients } = this.dependencies;
    const { winningProposal } = context;

    // Handle case where no winning proposal exists (e.g., all agents failed)
    if (!winningProposal) {
      console.warn('[SceneConstruction] No winning proposal available, skipping construction');
      eventBus.emit('loop:construction_skipped', { reason: 'No winning proposal' });
      return { nextPhase: 'presentation', context: {} };
    }

    // 1. Announce construction
    eventBus.emit('loop:construction_started', { agentId: winningProposal.agentId });

    // 2. Clear the scene
    console.log('[SceneConstruction] Clearing scene...');
    await mcpClients.worldBuilder.clearScene('/World', true);

    // 3. Create assets from multiple batches
    // New schema: winningProposal.data.batches = [{ batch_name, elements, description }, ...]
    const batches = winningProposal.data?.batches || winningProposal.batches || [];

    if (batches.length === 0) {
      console.warn('[SceneConstruction] No batches found in winning proposal');
      // Fallback: check if old single-asset format
      if (winningProposal.assets) {
        console.log('[SceneConstruction] Using legacy single-batch format');
        await mcpClients.worldBuilder.createBatch(
          `scene_${Date.now()}`,
          winningProposal.assets,
          '/World'
        );
      }
    } else {
      console.log(`[SceneConstruction] Creating ${batches.length} batches...`);

      // Create each batch sequentially
      for (const batch of batches) {
        const batchName = batch.batch_name || `batch_${Date.now()}`;
        const elements = batch.elements || [];
        const parentPath = batch.parent_path || '/World';

        console.log(`[SceneConstruction] Creating batch "${batchName}" with ${elements.length} elements`);

        try {
          await mcpClients.worldBuilder.createBatch(
            batchName,
            elements,
            parentPath
          );

          eventBus.emit('loop:batch_created', {
            batchName,
            elementCount: elements.length,
            description: batch.description
          });
        } catch (error) {
          console.error(`[SceneConstruction] Failed to create batch "${batchName}":`, error);
          // Continue with remaining batches
        }
      }
    }

    // 4. Execute camera shots (if provided)
    const cameraShots = winningProposal.cameraShots || winningProposal.data?.cameraShots || [];
    for (const shot of cameraShots) {
      try {
        await mcpClients.worldViewer.frameObject({ targetPath: '/World' });
      } catch (error) {
        console.warn('[SceneConstruction] Camera shot failed:', error.message);
      }
    }

    // 5. Announce completion
    eventBus.emit('loop:construction_completed', {
      batchCount: batches.length,
      totalElements: batches.reduce((sum, b) => sum + (b.elements?.length || 0), 0)
    });

    // 6. Transition to the next phase
    return { nextPhase: 'presentation', context: {} };
  }
}
