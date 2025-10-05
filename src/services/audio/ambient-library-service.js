import fs from 'node:fs';
import path from 'node:path';

import Logger from '../logging/logger.js';

const DEFAULT_LIBRARY_ROOT = path.resolve('docker', 'audio-generator', 'assets', 'ambient', 'library');

export class AmbientLibraryService {
  constructor({
    libraryRoot = DEFAULT_LIBRARY_ROOT,
    logger = Logger
  } = {}) {
    this.libraryRoot = libraryRoot;
    this.logger = logger;
    this.packs = new Map();
    this._loadLibraries();
  }

  _loadLibraries() {
    if (!fs.existsSync(this.libraryRoot)) {
      this.logger.warn('Ambient library root missing', { root: this.libraryRoot });
      return;
    }

    const packNames = fs.readdirSync(this.libraryRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const pack of packNames) {
      try {
        const manifestPath = path.join(this.libraryRoot, pack, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
          this.logger.warn('Ambient pack missing manifest', { pack, manifestPath });
          continue;
        }

        const raw = fs.readFileSync(manifestPath, 'utf-8');
        const manifest = JSON.parse(raw);
        const entries = Array.isArray(manifest) ? manifest : manifest.clips || [];

        const byCategory = new Map();
        const tags = new Set();
        const slug = pack;

        for (const entry of entries) {
          const category = entry.category || 'misc';
          if (!byCategory.has(category)) {
            byCategory.set(category, []);
          }
          byCategory.get(category).push(entry);
          for (const tag of entry.tags || []) {
            tags.add(tag);
          }
        }

        this.packs.set(pack, {
          name: pack,
          slug,
          manifestPath,
          clips: entries,
          categories: Array.from(byCategory.keys()),
          categoryMap: byCategory,
          tags: Array.from(tags).sort()
        });

        this.logger.info('Ambient pack loaded', {
          pack,
          clips: entries.length,
          categories: Array.from(byCategory.keys())
        });

      } catch (error) {
        this.logger.error('Failed to load ambient pack', { pack, error: error.message });
      }
    }
  }

  listPacks() {
    return Array.from(this.packs.values()).map((pack) => ({
      name: pack.name,
      slug: pack.slug,
      clipCount: pack.clips.length,
      categories: pack.categories,
      tags: pack.tags
    }));
  }

  getPack(packName) {
    return this.packs.get(packName) || null;
  }

  listCategories(packName) {
    const pack = this.getPack(packName);
    if (!pack) {
      return [];
    }
    return pack.categories;
  }

  findClips({
    pack: packName,
    category,
    tags = [],
    limit = 20,
    maxDuration = null,
    includeMetadata = false
  }) {
    const pack = this.getPack(packName);
    if (!pack) {
      return [];
    }

    let candidates = pack.clips;
    if (category) {
      const entries = pack.categoryMap.get(category);
      if (!entries) {
        return [];
      }
      candidates = entries;
    }

    if (tags.length > 0) {
      const tagSet = new Set(tags.map((t) => t.toLowerCase()));
      candidates = candidates.filter((entry) =>
        (entry.tags || []).some((tag) => tagSet.has(tag.toLowerCase()))
      );
    }

    if (typeof maxDuration === 'number' && Number.isFinite(maxDuration)) {
      candidates = candidates.filter((entry) =>
        typeof entry.duration_seconds === 'number'
        && entry.duration_seconds <= maxDuration
      );
    }

    const selected = candidates.slice(0, limit);
    if (includeMetadata) {
      return selected;
    }
    return selected.map((entry) => ({
      id: entry.id,
      category: entry.category,
      duration_seconds: entry.duration_seconds,
      tags: entry.tags || []
    }));
  }
}

export default AmbientLibraryService;
