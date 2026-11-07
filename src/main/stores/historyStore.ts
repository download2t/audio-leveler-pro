import type { HistoryEntry } from '../../shared/media';
import type { ScopedLogger } from '../logger';
import { JsonStore } from './jsonStore';

const MAX_ENTRIES = 500;

const parseHistory = (raw: unknown): HistoryEntry[] =>
  Array.isArray(raw)
    ? (raw.filter((e) => e && typeof e === 'object' && typeof (e as HistoryEntry).id === 'string') as HistoryEntry[]).slice(0, MAX_ENTRIES)
    : [];

/** Execution history, newest first. */
export class HistoryStore {
  private readonly store: JsonStore<HistoryEntry[]>;
  private onChange: ((entries: HistoryEntry[]) => void) | null = null;

  constructor(file: string, log: ScopedLogger) {
    this.store = new JsonStore(file, parseHistory, log);
  }

  subscribe(listener: (entries: HistoryEntry[]) => void): void {
    this.onChange = listener;
  }

  list(): HistoryEntry[] {
    return this.store.get();
  }

  add(entry: HistoryEntry): void {
    this.store.set([entry, ...this.store.get()].slice(0, MAX_ENTRIES));
    this.onChange?.(this.store.get());
  }

  clear(): void {
    this.store.set([]);
    this.onChange?.([]);
  }
}
