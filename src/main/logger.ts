import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { join } from 'node:path';

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface ScopedLogger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

function serialize(meta: unknown): string {
  if (meta === undefined) return '';
  if (meta instanceof Error) return ` ${meta.stack ?? meta.message}`;
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return ` ${String(meta)}`;
  }
}

/** Minimal file + console logger. Writes one file per day in the logs directory. */
class Logger {
  private stream: WriteStream | null = null;
  private filePath: string | null = null;

  init(dir: string): void {
    try {
      mkdirSync(dir, { recursive: true });
      this.filePath = join(dir, `audio-leveler-${new Date().toISOString().slice(0, 10)}.log`);
      this.stream = createWriteStream(this.filePath, { flags: 'a' });
    } catch (err) {
      console.error('[logger] não foi possível abrir o arquivo de log', err);
    }
  }

  get file(): string | null {
    return this.filePath;
  }

  scope(name: string): ScopedLogger {
    return {
      debug: (m, meta) => this.write('debug', name, m, meta),
      info: (m, meta) => this.write('info', name, m, meta),
      warn: (m, meta) => this.write('warn', name, m, meta),
      error: (m, meta) => this.write('error', name, m, meta)
    };
  }

  close(): void {
    this.stream?.end();
    this.stream = null;
  }

  private write(level: Level, scope: string, message: string, meta?: unknown): void {
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] [${scope}] ${message}${serialize(meta)}`;
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    this.stream?.write(`${line}\n`);
  }
}

export const logger = new Logger();
