import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/defaults';
import type { FileItem, GainResult } from '../../shared/types';
import { formatBytes, formatDuration, formatElapsed, formatGain, formatLevel } from '../format';
import { baseName, extensionOf, parentDir } from '../pathUtils';
import { sanitizeSettings } from '../settings';
import { computeBatchStats, itemsToCsv } from '../stats';
import { makeAnalysis, makeProbe } from './fixtures';

const gain = (gainDb: number): GainResult => ({
  skip: false, gainDb, currentLevel: -20, finalLevel: -14, unit: 'LUFS',
  useLimiter: false, predictedPeakDb: -3, notes: []
});

const item = (o: Partial<FileItem>): FileItem => ({
  id: 'x', path: '/m/x.mp3', rootDir: '/m', name: 'x.mp3', ext: 'mp3', size: 1000,
  status: 'pending', progress: 0, ...o
});

describe('computeBatchStats', () => {
  it('aggregates counts, loudness and gains', () => {
    const items = [
      item({ id: '1', status: 'done', probe: makeProbe({ durationSec: 60 }), analysis: makeAnalysis({ integratedLufs: -20 }), result: gain(6) }),
      item({ id: '2', status: 'analyzed', probe: makeProbe({ durationSec: 30 }), analysis: makeAnalysis({ integratedLufs: -10 }) }),
      item({ id: '3', status: 'error', error: 'falhou' })
    ];
    const s = computeBatchStats(items, new Map([['2', gain(-4)]]));
    expect(s.total).toBe(3);
    expect(s.analyzed).toBe(2);
    expect(s.done).toBe(1);
    expect(s.errors).toBe(1);
    expect(s.totalDurationSec).toBe(90);
    expect(s.totalSizeBytes).toBe(3000);
    expect(s.averageLufs).toBe(-15);
    expect(s.minLufs).toBe(-20);
    expect(s.maxLufs).toBe(-10);
    expect(s.averageGainDb).toBe(1);
  });

  it('returns nulls for an empty batch', () => {
    const s = computeBatchStats([]);
    expect(s.averageLufs).toBeNull();
    expect(s.averageGainDb).toBeNull();
  });
});

describe('itemsToCsv', () => {
  it('escapes separators and quotes', () => {
    const csv = itemsToCsv([item({ name: 'a;"b".mp3', status: 'done', result: gain(1.5) })]);
    const [header, row] = csv.split('\r\n');
    expect(header?.startsWith('arquivo;caminho;status')).toBe(true);
    expect(row).toContain('"a;""b"".mp3"');
    expect(row).toContain('1.50');
  });
});

describe('format helpers', () => {
  it('formats levels and gains', () => {
    expect(formatLevel(-14.04, 'LUFS')).toBe('-14.0 LUFS');
    expect(formatLevel(null, 'LUFS')).toBe('—');
    expect(formatGain(3.456)).toBe('+3.46 dB');
    expect(formatGain(-1)).toBe('−1.00 dB');
    expect(formatGain(0)).toBe('±0.00 dB');
  });

  it('formats durations, sizes and elapsed time', () => {
    expect(formatDuration(65)).toBe('1:05');
    expect(formatDuration(3725)).toBe('1:02:05');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatElapsed(250)).toBe('250 ms');
    expect(formatElapsed(12_340)).toBe('12.3 s');
    expect(formatElapsed(125_000)).toBe('2:05');
  });
});

describe('path helpers', () => {
  it('works with POSIX and Windows paths', () => {
    expect(baseName('C:\\Music\\a.FLAC')).toBe('a.FLAC');
    expect(extensionOf('C:\\Music\\a.FLAC')).toBe('flac');
    expect(extensionOf('/m/.hidden')).toBe('');
    expect(parentDir('/m/a/b.mp3')).toBe('/m/a');
    expect(parentDir('C:\\M\\b.mp3')).toBe('C:\\M');
  });
});

describe('sanitizeSettings', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps numbers and rejects unknown enums', () => {
    const s = sanitizeSettings({
      normalization: { mode: 'banana', lufsTarget: -100, maxGain: 'abc', truePeakCeiling: 3 },
      export: { customBitrateKbps: 9999, fileSuffix: '_norm/?' },
      concurrency: 999
    });
    expect(s.normalization.mode).toBe('lufs');
    expect(s.normalization.lufsTarget).toBe(-40);
    expect(s.normalization.maxGain).toBe(DEFAULT_SETTINGS.normalization.maxGain);
    expect(s.normalization.truePeakCeiling).toBe(0);
    expect(s.export.customBitrateKbps).toBe(512);
    expect(s.export.fileSuffix).toBe('_norm');
    expect(s.concurrency).toBe(16);
  });

  it('keeps valid values', () => {
    const s = sanitizeSettings({ normalization: { mode: 'rms', rmsTarget: -18 }, theme: 'dark' });
    expect(s.normalization.mode).toBe('rms');
    expect(s.normalization.rmsTarget).toBe(-18);
    expect(s.theme).toBe('dark');
  });
});
