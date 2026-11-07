import { randomUUID } from 'node:crypto';
import type { Preset } from '../../shared/media';
import { BUILTIN_PRESETS, DEFAULT_AUDIO_CONVERT, DEFAULT_VIDEO_CONVERT } from '../../shared/presets';
import type { ScopedLogger } from '../logger';
import { JsonStore } from './jsonStore';

function parsePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  const out: Preset[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const r = p as Record<string, unknown>;
    if (typeof r['id'] !== 'string' || typeof r['name'] !== 'string' || typeof r['options'] !== 'object' || !r['options']) continue;
    const options = r['options'] as Record<string, unknown>;
    if (r['module'] === 'audio-convert') {
      out.push({ id: r['id'], name: r['name'], module: 'audio-convert', builtin: false, options: { ...DEFAULT_AUDIO_CONVERT, ...options } });
    } else if (r['module'] === 'video-convert') {
      out.push({ id: r['id'], name: r['name'], module: 'video-convert', builtin: false, options: { ...DEFAULT_VIDEO_CONVERT, ...options } });
    }
  }
  return out;
}

/** Built-in presets (read-only) + user presets persisted in presets.json. */
export class PresetStore {
  private readonly store: JsonStore<Preset[]>;

  constructor(file: string, log: ScopedLogger) {
    this.store = new JsonStore(file, parsePresets, log);
  }

  list(): Preset[] {
    return [...BUILTIN_PRESETS, ...this.store.get()];
  }

  save(preset: Preset): Preset[] {
    const name = preset.name.trim().slice(0, 60);
    if (!name) throw new Error('Dê um nome ao preset.');
    const user = this.store.get();
    const existing = user.find((p) => p.id === preset.id);
    const id = existing ? existing.id : randomUUID();
    const saved = { ...preset, id, name, builtin: false } as Preset;
    this.store.set(existing ? user.map((p) => (p.id === id ? saved : p)) : [...user, saved]);
    return this.list();
  }

  delete(id: string): Preset[] {
    this.store.set(this.store.get().filter((p) => p.id !== id));
    return this.list();
  }
}
