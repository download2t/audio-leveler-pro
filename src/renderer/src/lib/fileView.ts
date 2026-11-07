import type { FileItem, FileStatus, GainResult } from '../../../shared/types';

export type StatusFilter = 'all' | 'pending' | 'analyzed' | 'done' | 'error' | 'skipped';
export type SortKey = 'name' | 'duration' | 'current' | 'final' | 'gain' | 'status';
export interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

const FILTER_STATUSES: Record<Exclude<StatusFilter, 'all'>, readonly FileStatus[]> = {
  pending: ['pending', 'cancelled', 'analyzing', 'processing'],
  analyzed: ['analyzed'],
  done: ['done'],
  error: ['error'],
  skipped: ['skipped']
};

const STATUS_ORDER: Record<FileStatus, number> = {
  error: 0, processing: 1, analyzing: 2, pending: 3, cancelled: 4, analyzed: 5, skipped: 6, done: 7
};

/** Gain shown for a row: the applied one once exported, the preview otherwise. */
export function gainFor(item: FileItem, previews: ReadonlyMap<string, GainResult>): GainResult | undefined {
  return item.status === 'done' && item.result ? item.result : (previews.get(item.id) ?? item.result);
}

export function filterItems(items: readonly FileItem[], query: string, status: StatusFilter): FileItem[] {
  const q = query.trim().toLowerCase();
  const allowed = status === 'all' ? null : new Set(FILTER_STATUSES[status]);
  return items.filter(
    (i) =>
      (!allowed || allowed.has(i.status)) &&
      (!q ||
        i.name.toLowerCase().includes(q) ||
        i.probe?.tags.artist?.toLowerCase().includes(q) ||
        i.probe?.tags.album?.toLowerCase().includes(q))
  );
}

function sortValue(item: FileItem, key: SortKey, previews: ReadonlyMap<string, GainResult>): number | string | null {
  const gain = gainFor(item, previews);
  switch (key) {
    case 'name':
      return item.name;
    case 'duration':
      return item.probe?.durationSec ?? null;
    case 'current':
      return gain?.currentLevel ?? item.analysis?.integratedLufs ?? null;
    case 'final':
      return gain?.finalLevel ?? null;
    case 'gain':
      return gain && !gain.skip ? gain.gainDb : null;
    case 'status':
      return STATUS_ORDER[item.status];
  }
}

/** Stable sort; missing values always go last. */
export function sortItems(
  items: readonly FileItem[],
  sort: SortState,
  previews: ReadonlyMap<string, GainResult>
): FileItem[] {
  const factor = sort.dir === 'asc' ? 1 : -1;
  return items
    .map((item, index) => ({ item, index, value: sortValue(item, sort.key, previews) }))
    .sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const cmp =
        typeof a.value === 'string' && typeof b.value === 'string'
          ? a.value.localeCompare(b.value, undefined, { numeric: true, sensitivity: 'base' })
          : (a.value as number) - (b.value as number);
      return cmp !== 0 ? cmp * factor : a.index - b.index;
    })
    .map((x) => x.item);
}
