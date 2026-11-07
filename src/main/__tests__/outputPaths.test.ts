import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { OutputPathPlanner } from '../lib/outputPaths';

const base = { outputDir: '/out', overwriteOriginals: false, preserveFolderStructure: true, fileSuffix: '' };

describe('OutputPathPlanner', () => {
  it('preserves the folder structure relative to the root', () => {
    const planner = new OutputPathPlanner(base, path.posix, false);
    expect(planner.plan('/music/Rock/Album/01.flac', '/music', 'flac')).toBe('/out/Rock/Album/01.flac');
  });

  it('flattens when structure preservation is off and applies the suffix', () => {
    const planner = new OutputPathPlanner({ ...base, preserveFolderStructure: false, fileSuffix: '_norm' }, path.posix, false);
    expect(planner.plan('/music/Rock/01.mp3', '/music', 'mp3')).toBe('/out/01_norm.mp3');
  });

  it('deduplicates collisions inside the batch', () => {
    const planner = new OutputPathPlanner({ ...base, preserveFolderStructure: false }, path.posix, false);
    expect(planner.plan('/a/song.mp3', '/a', 'mp3')).toBe('/out/song.mp3');
    expect(planner.plan('/b/song.mp3', '/b', 'mp3')).toBe('/out/song (1).mp3');
    expect(planner.plan('/c/song.mp3', '/c', 'mp3')).toBe('/out/song (2).mp3');
  });

  it('is case-insensitive on Windows/macOS', () => {
    const planner = new OutputPathPlanner({ ...base, outputDir: 'C:\\out', preserveFolderStructure: false }, path.win32, true);
    expect(planner.plan('C:\\a\\Song.mp3', 'C:\\a', 'mp3')).toBe('C:\\out\\Song.mp3');
    expect(planner.plan('C:\\b\\song.mp3', 'C:\\b', 'mp3')).toBe('C:\\out\\song (1).mp3');
  });

  it('never targets the original file when output folder equals the source folder', () => {
    const planner = new OutputPathPlanner({ ...base, outputDir: '/music' }, path.posix, false);
    expect(planner.plan('/music/a.mp3', '/music', 'mp3')).toBe('/music/a (1).mp3');
  });

  it('returns the input path only when overwriting is enabled', () => {
    const planner = new OutputPathPlanner({ ...base, overwriteOriginals: true }, path.posix, false);
    expect(planner.plan('/music/a.mp3', '/music', 'mp3')).toBe('/music/a.mp3');
  });

  it('ignores roots that are not ancestors', () => {
    const planner = new OutputPathPlanner(base, path.posix, false);
    expect(planner.plan('/x/y/a.mp3', '/other', 'mp3')).toBe('/out/a.mp3');
  });
});
