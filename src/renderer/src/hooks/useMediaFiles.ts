import { useCallback, useRef, useState } from 'react';
import type { MediaInfo, MediaKind } from '../../../shared/media';
import { errorText } from '../lib/labels';

export interface MediaFile {
  id: string;
  path: string;
  name: string;
  size: number;
  info?: MediaInfo;
  error?: string;
}

const PROBE_CONCURRENCY = 4;
const key = (p: string): string => p.replace(/\\/g, '/').toLowerCase();

/** File list of a module: scan dropped paths, probe them in the background, reorder/remove. */
export function useMediaFiles(kind: MediaKind) {
  const [files, setFiles] = useState<MediaFile[]>([]);
  const known = useRef(new Set<string>());

  const add = useCallback(
    async (paths: string[]): Promise<{ added: number; ignored: number }> => {
      if (paths.length === 0) return { added: 0, ignored: 0 };
      const scan = await window.api.scanMedia(paths, kind);
      const fresh = scan.files.filter((f) => !known.current.has(key(f.path)));
      fresh.forEach((f) => known.current.add(key(f.path)));
      setFiles((list) => [...list, ...fresh.map((f) => ({ id: f.id, path: f.path, name: f.name, size: f.size }))]);

      let next = 0;
      const lane = async (): Promise<void> => {
        while (next < fresh.length) {
          const f = fresh[next++];
          if (!f) break;
          let patch: Partial<MediaFile>;
          try {
            patch = { info: await window.api.probeMedia(f.path) };
          } catch (err) {
            patch = { error: errorText(err) };
          }
          setFiles((list) => list.map((x) => (x.id === f.id ? { ...x, ...patch } : x)));
        }
      };
      void Promise.all(Array.from({ length: PROBE_CONCURRENCY }, lane));
      return { added: fresh.length, ignored: scan.ignored };
    },
    [kind]
  );

  const remove = useCallback((id: string) => {
    setFiles((list) => {
      const f = list.find((x) => x.id === id);
      if (f) known.current.delete(key(f.path));
      return list.filter((x) => x.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    known.current.clear();
    setFiles([]);
  }, []);

  const move = useCallback((id: string, delta: number) => {
    setFiles((list) => {
      const i = list.findIndex((x) => x.id === id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const copy = list.slice();
      const [item] = copy.splice(i, 1);
      if (item) copy.splice(j, 0, item);
      return copy;
    });
  }, []);

  const ready = files.filter((f) => f.info);
  const probing = files.some((f) => !f.info && !f.error);
  return { files, ready, probing, add, remove, clear, move };
}

export type MediaFilesApi = ReturnType<typeof useMediaFiles>;
