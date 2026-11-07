import { describe, expect, it } from 'vitest';
import type { FileEntry, FileItem, GainResult } from '../../../shared/types';
import { filterItems, gainFor, sortItems } from '../lib/fileView';
import { errorText } from '../lib/labels';
import { filesReducer, initialFilesState } from '../state/filesReducer';

const entry = (id: string, path = `/m/${id}.mp3`): FileEntry => ({
  id, path, rootDir: '/m', name: path.split('/').pop() as string, ext: 'mp3', size: 1
});

const gain = (gainDb: number, finalLevel = -14): GainResult => ({
  skip: false, gainDb, currentLevel: finalLevel - gainDb, finalLevel, unit: 'LUFS',
  useLimiter: false, predictedPeakDb: null, notes: []
});

describe('filesReducer', () => {
  it('adds entries as pending and ignores duplicate paths', () => {
    let s = filesReducer(initialFilesState, { type: 'add', entries: [entry('a'), entry('b')] });
    s = filesReducer(s, { type: 'add', entries: [entry('c', '/M/A.MP3')] });
    expect(s.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(s.items[0]?.status).toBe('pending');
  });

  it('patches items by id and can clear fields', () => {
    let s = filesReducer(initialFilesState, { type: 'add', entries: [entry('a'), entry('b')] });
    s = filesReducer(s, { type: 'patch', patches: [{ id: 'b', status: 'error', error: 'x' }, { id: 'zz', status: 'done' }] });
    expect(s.items[1]?.status).toBe('error');
    s = filesReducer(s, { type: 'patch', patches: [{ id: 'b', status: 'analyzing', error: undefined }] });
    expect(s.items[1]?.error).toBeUndefined();
    expect(s.items[0]?.status).toBe('pending');
  });

  it('keeps identity when nothing changes', () => {
    const s = filesReducer(initialFilesState, { type: 'add', entries: [entry('a')] });
    expect(filesReducer(s, { type: 'patch', patches: [{ id: 'nope', progress: 1 }] })).toBe(s);
    expect(filesReducer(s, { type: 'remove', ids: new Set() })).toBe(s);
  });

  it('removes and clears', () => {
    let s = filesReducer(initialFilesState, { type: 'add', entries: [entry('a'), entry('b'), entry('c')] });
    s = filesReducer(s, { type: 'remove', ids: new Set(['a', 'c']) });
    expect(s.items.map((i) => i.id)).toEqual(['b']);
    expect(filesReducer(s, { type: 'clear' }).items).toEqual([]);
  });
});

describe('file view helpers', () => {
  const items: FileItem[] = [
    { ...entry('a', '/m/Zeta.mp3'), status: 'done', progress: 1, result: gain(3) },
    { ...entry('b', '/m/alpha.mp3'), status: 'analyzed', progress: 1 },
    { ...entry('c', '/m/Beta.mp3'), status: 'error', progress: 0 },
    { ...entry('d', '/m/song 10.mp3'), status: 'pending', progress: 0 },
    { ...entry('e', '/m/song 9.mp3'), status: 'pending', progress: 0 }
  ];
  const previews = new Map([['b', gain(-2)], ['a', gain(99)]]);

  it('prefers the applied gain for exported files', () => {
    expect(gainFor(items[0] as FileItem, previews)?.gainDb).toBe(3);
    expect(gainFor(items[1] as FileItem, previews)?.gainDb).toBe(-2);
  });

  it('filters by status and query', () => {
    expect(filterItems(items, '', 'error').map((i) => i.id)).toEqual(['c']);
    expect(filterItems(items, 'ALP', 'all').map((i) => i.id)).toEqual(['b']);
    expect(filterItems(items, '', 'pending').map((i) => i.id)).toEqual(['d', 'e']);
  });

  it('sorts naturally by name and puts missing values last', () => {
    expect(sortItems(items, { key: 'name', dir: 'asc' }, previews).map((i) => i.id)).toEqual(['b', 'c', 'e', 'd', 'a']);
    expect(sortItems(items, { key: 'gain', dir: 'desc' }, previews).map((i) => i.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('cleans IPC error messages', () => {
    expect(errorText(new Error("Error invoking remote method 'batch:start': Error: Selecione uma pasta"))).toBe('Selecione uma pasta');
  });
});
