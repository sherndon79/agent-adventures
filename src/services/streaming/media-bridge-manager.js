import { promisify } from 'util';
import { execFile } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';
import logger from '../logging/logger.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEFAULT_COMPOSE_DIR = path.resolve(__dirname, '../../../agent-world/docker/stream-bridge');
const DEFAULT_COMPOSE_FILE = path.join(DEFAULT_COMPOSE_DIR, 'docker-compose.yml');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default class MediaBridgeManager {
  constructor(config = {}) {
    this.composeDir = config.composeDir || DEFAULT_COMPOSE_DIR;
    this.composeFile = config.composeFile || DEFAULT_COMPOSE_FILE;
    this.healthEndpoints = config.healthEndpoints || [
      { name: 'audio', url: config.audioHealthUrl || process.env.AUDIO_HEALTH_URL || 'http://localhost:9000/health' },
      { name: 'webrtc', url: config.webrtcHealthUrl || process.env.WEBRTC_HEALTH_URL || 'http://localhost:8081/health' }
    ];
  }

  async start(envOverrides = {}) {
    logger.info('Starting media bridge stack', {
      composeDir: this.composeDir,
      overrides: Object.keys(envOverrides)
    });

    const env = this._buildEnv(envOverrides);

    await this._runCompose(['up', '-d'], env);
    await this.waitForHealth();
  }

  async stop() {
    logger.info('Stopping media bridge stack', { composeDir: this.composeDir });
    await this._runCompose(['down'], process.env);
  }

  async restart(envOverrides = {}) {
    await this.stop();
    await this.start(envOverrides);
  }

  async waitForHealth(maxAttempts = 20, intervalMs = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const statuses = await this.getHealth();
      const allHealthy = statuses.every((endpoint) => endpoint.status === 'ok');
      if (allHealthy) {
        logger.info('Media bridge services healthy');
        return true;
      }
      if (attempt === maxAttempts) {
        throw new Error('Media bridge services did not become ready in time');
      }
      await sleep(intervalMs);
    }
    return false;
  }

  async getHealth() {
    const results = await Promise.all(
      this.healthEndpoints.map(async ({ name, url }) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);

        try {
          const response = await fetch(url, { signal: controller.signal });
          if (!response.ok) {
            return { name, url, status: 'unreachable', code: response.status };
          }

          let json = null;
          try {
            json = await response.json();
          } catch (parseError) {
            json = { status: 'ok', note: 'Non-JSON health response' };
          }

          return { name, url, status: json.status || 'ok', details: json };
        } catch (error) {
          if (error.name === 'AbortError') {
            return { name, url, status: 'timeout' };
          }
          return { name, url, status: 'error', error: error.message };
        } finally {
          clearTimeout(timeoutId);
        }
      })
    );
    return results;
  }

  async _runCompose(args, env = process.env) {
    const command = ['compose', '-f', this.composeFile, ...args];
    try {
      await execFileAsync('docker', command, { cwd: this.composeDir, env });
    } catch (error) {
      logger.error('Docker compose command failed', { command: ['docker', ...command].join(' '), error });
      throw new Error(`Docker compose command failed: ${error.message}`);
    }
  }

  _buildEnv(envOverrides = {}) {
    const env = { ...process.env };
    for (const [key, value] of Object.entries(envOverrides)) {
      if (value === undefined || value === null) {
        delete env[key];
      } else {
        env[key] = value;
      }
    }
    return env;
  }
}
