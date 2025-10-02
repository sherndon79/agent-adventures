import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { EventBus } from '../../src/core/event-bus.js';
import { DAGRunner } from '../../src/orchestrator/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function loadSampleConfig() {
  const configPath = path.join(__dirname, '..', '..', 'src', 'config', 'orchestrator', 'sample-adventure.json');
  const raw = await fs.readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

function createMockHandlers(eventBus) {
  const handlers = new Map();

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  handlers.set('story_seed', async ({ stage }) => {
    await delay(100);
    eventBus.emit('log', { message: `Generated story beat for ${stage.id}` });
    return { summary: 'The hero enters the glowing cave.' };
  });

  handlers.set('asset_concepts', async ({ results }) => {
    await delay(80);
    return { assets: ['glowing_crystals', 'ancient_statue'], baseOn: results.story_seed?.summary };
  });

  handlers.set('asset_placement', async () => {
    await delay(120);
    return { placed: ['glowing_crystals', 'ancient_statue'] };
  });

  handlers.set('camera_plan', async () => {
    await delay(60);
    return { shots: ['tracking_in', 'wide_establishing'] };
  });

  handlers.set('dialogue', async ({ results }) => {
    await delay(90);
    return { script: `Narrator: ${results.story_seed?.summary}` };
  });

  handlers.set('audio_mix', async () => {
    await delay(70);
    return { started: true };
  });

  return handlers;
}

async function run() {
  const config = await loadSampleConfig();
  const eventBus = new EventBus({ enableLogging: false });

  const runner = new DAGRunner(config, { eventBus });

  const handlers = createMockHandlers(eventBus);
  for (const [id, handler] of handlers.entries()) {
    runner.registerStageHandler(id, handler);
  }

  eventBus.on('orchestrator:stage:start', ({ payload }) => {
    const { stageId } = payload || {};
    console.log(`▶️  ${stageId} started`);
  });

  eventBus.on('orchestrator:stage:complete', ({ payload }) => {
    const { stageId } = payload || {};
    console.log(`✅ ${stageId} completed`);
  });

  eventBus.on('orchestrator:failed', ({ payload }) => {
    console.error('❌ DAG failed', payload);
  });

  const result = await runner.start();
  console.log('🎉 DAG finished', JSON.stringify(result, null, 2));
}

run().catch(err => {
  console.error('DAG test runner error', err);
  process.exitCode = 1;
});
