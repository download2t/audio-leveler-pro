import type { FileEntry, FileItem, FilePatch } from '../../../shared/types';

export interface FilesState {
  items: FileItem[];
}

export type FilesAction =
  | { type: 'add'; entries: readonly FileEntry[] }
  | { type: 'remove'; ids: ReadonlySet<string> }
  | { type: 'clear' }
  | { type: 'patch'; patches: readonly FilePatch[] };

export const initialFilesState: FilesState = { items: [] };

export const pathKey = (p: string): string => p.replace(/\\/g, '/').toLowerCase();

export function filesReducer(state: FilesState, action: FilesAction): FilesState {
  switch (action.type) {
    case 'add': {
      const known = new Set(state.items.map((i) => pathKey(i.path)));
      const added: FileItem[] = [];
      for (const entry of action.entries) {
        const key = pathKey(entry.path);
        if (known.has(key)) continue;
        known.add(key);
        added.push({ ...entry, status: 'pending', progress: 0 });
      }
      return added.length ? { items: [...state.items, ...added] } : state;
    }
    case 'remove': {
      if (action.ids.size === 0) return state;
      return { items: state.items.filter((i) => !action.ids.has(i.id)) };
    }
    case 'clear':
      return state.items.length ? initialFilesState : state;
    case 'patch': {
      if (action.patches.length === 0) return state;
      const index = new Map(state.items.map((item, i) => [item.id, i]));
      const items = state.items.slice();
      let changed = false;
      for (const patch of action.patches) {
        const i = index.get(patch.id);
        const current = i === undefined ? undefined : items[i];
        if (i === undefined || !current) continue;
        items[i] = { ...current, ...patch };
        changed = true;
      }
      return changed ? { items } : state;
    }
  }
}
