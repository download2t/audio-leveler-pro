import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { sanitizeSettings } from '../core/settings';
import type { AppSettings } from '../shared/types';
import type { ScopedLogger } from './logger';

/** Persists settings as JSON (atomic write) in the user data folder. */
export class SettingsStore {
  private current: AppSettings;

  constructor(
    private readonly file: string,
    private readonly defaultConcurrency: number,
    private readonly log: ScopedLogger
  ) {
    this.current = this.load();
  }

  get(): AppSettings {
    return this.current;
  }

  save(raw: unknown): AppSettings {
    this.current = sanitizeSettings(raw, this.defaultConcurrency);
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.current, null, 2), 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      this.log.error('Não foi possível salvar as configurações', err);
    }
    return this.current;
  }

  private load(): AppSettings {
    try {
      return sanitizeSettings(JSON.parse(readFileSync(this.file, 'utf8')), this.defaultConcurrency);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        this.log.warn('Configurações inválidas, usando padrões', err);
      }
      return sanitizeSettings({}, this.defaultConcurrency);
    }
  }
}
