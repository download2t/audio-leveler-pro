import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ScopedLogger } from '../logger';

/** Small JSON file persisted atomically (tmp + rename). */
export class JsonStore<T> {
  private value: T;

  constructor(
    private readonly file: string,
    private readonly parse: (raw: unknown) => T,
    private readonly log: ScopedLogger
  ) {
    this.value = this.load();
  }

  get(): T {
    return this.value;
  }

  set(value: T): T {
    this.value = value;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
      renameSync(tmp, this.file);
    } catch (err) {
      this.log.error(`Não foi possível salvar ${this.file}`, err);
    }
    return value;
  }

  private load(): T {
    try {
      return this.parse(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') this.log.warn(`Arquivo inválido, usando padrão: ${this.file}`, err);
      return this.parse(undefined);
    }
  }
}
