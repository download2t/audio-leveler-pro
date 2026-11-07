import { randomUUID } from 'node:crypto';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { extensionOf } from '../../core/pathUtils';
import { SUPPORTED_EXTENSIONS } from '../../shared/defaults';
import type { FileEntry, ScanResult } from '../../shared/types';

const SUPPORTED = new Set<string>(SUPPORTED_EXTENSIONS);

export const isSupportedAudio = (file: string): boolean => SUPPORTED.has(extensionOf(file));

/**
 * Expands dropped files/folders into supported audio files (recursively).
 * For a dropped folder, rootDir is its parent so the folder name itself is
 * kept when preserving the folder structure in the output.
 */
export async function scanPaths(inputs: readonly string[], extensions?: readonly string[]): Promise<ScanResult> {
  const allowed = extensions ? new Set(extensions.map((e) => e.toLowerCase())) : SUPPORTED;
  const accepts = (file: string): boolean => allowed.has(extensionOf(file));
  const files: FileEntry[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let ignored = 0;

  const addFile = (file: string, rootDir: string, size: number): void => {
    const key = process.platform === 'linux' ? file : file.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    files.push({ id: randomUUID(), path: file, rootDir, name: basename(file), ext: extensionOf(file), size });
  };

  for (const raw of inputs) {
    const input = resolve(raw);
    try {
      const info = await stat(input);
      if (info.isFile()) {
        if (accepts(input)) addFile(input, dirname(input), info.size);
        else ignored++;
        continue;
      }
      if (!info.isDirectory()) continue;

      const rootDir = dirname(input);
      const stack = [input];
      while (stack.length > 0) {
        const dir = stack.pop() as string;
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch (err) {
          errors.push(`${dir}: ${(err as Error).message}`);
          continue;
        }
        for (const entry of entries) {
          const full = join(dir, entry.name);
          // Symlinks are skipped on purpose to avoid cycles.
          if (entry.isDirectory()) stack.push(full);
          else if (entry.isFile()) {
            if (!accepts(full) || entry.name.startsWith('._')) {
              ignored++;
              continue;
            }
            try {
              addFile(full, rootDir, (await stat(full)).size);
            } catch (err) {
              errors.push(`${full}: ${(err as Error).message}`);
            }
          }
        }
      }
    } catch (err) {
      errors.push(`${input}: ${(err as Error).message}`);
    }
  }

  files.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  return { files, ignored, errors };
}
