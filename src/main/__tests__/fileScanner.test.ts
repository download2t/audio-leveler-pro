import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanPaths } from '../lib/fileScanner';

let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alp-scan-'));
  await mkdir(join(dir, 'Album', 'CD2'), { recursive: true });
  await writeFile(join(dir, 'Album', '02.mp3'), 'x');
  await writeFile(join(dir, 'Album', '10.FLAC'), 'xx');
  await writeFile(join(dir, 'Album', 'cover.jpg'), 'x');
  await writeFile(join(dir, 'Album', '._01.mp3'), 'x');
  await writeFile(join(dir, 'Album', 'CD2', '01.ogg'), 'x');
  await writeFile(join(dir, 'single.wav'), 'x');
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('scanPaths', () => {
  it('expands folders recursively and filters by extension', async () => {
    const result = await scanPaths([join(dir, 'Album')]);
    expect(result.files.map((f) => f.name)).toEqual(['02.mp3', '10.FLAC', '01.ogg']);
    expect(result.ignored).toBe(2);
    expect(result.files[1]?.ext).toBe('flac');
    expect(result.files[1]?.size).toBe(2);
    // rootDir is the parent of the dropped folder so "Album" is kept in the output tree.
    expect(result.files.every((f) => f.rootDir === dir)).toBe(true);
  });

  it('accepts individual files and removes duplicates', async () => {
    const file = join(dir, 'single.wav');
    const result = await scanPaths([file, file, join(dir, 'Album', '02.mp3')]);
    expect(result.files).toHaveLength(2);
    expect(result.files.find((f) => f.name === 'single.wav')?.rootDir).toBe(dir);
  });

  it('reports missing paths as errors', async () => {
    const result = await scanPaths([join(dir, 'missing')]);
    expect(result.files).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
  });
});
