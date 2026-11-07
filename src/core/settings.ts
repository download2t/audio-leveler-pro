import { DEFAULT_SETTINGS, MAX_CONCURRENCY } from '../shared/defaults';
import type { AppSettings } from '../shared/types';

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const bool = (value: unknown, fallback: boolean): boolean => (typeof value === 'boolean' ? value : fallback);
const str = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

/** Merges untrusted (persisted / IPC) settings with defaults and clamps every value. */
export function sanitizeSettings(raw: unknown, defaultConcurrency = DEFAULT_SETTINGS.concurrency): AppSettings {
  const d = DEFAULT_SETTINGS;
  const r = isObject(raw) ? raw : {};
  const n = isObject(r['normalization']) ? r['normalization'] : {};
  const e = isObject(r['export']) ? r['export'] : {};
  const m = isObject(r['media']) ? r['media'] : {};

  return {
    normalization: {
      mode: oneOf(n['mode'], ['lufs', 'replaygain', 'peak', 'rms'] as const, d.normalization.mode),
      lufsTarget: num(n['lufsTarget'], d.normalization.lufsTarget, -40, -5),
      replayGainType: oneOf(n['replayGainType'], ['track', 'album'] as const, d.normalization.replayGainType),
      replayGainReference: num(n['replayGainReference'], d.normalization.replayGainReference, -30, -10),
      albumGrouping: oneOf(n['albumGrouping'], ['tag', 'folder'] as const, d.normalization.albumGrouping),
      useExistingReplayGainTags: bool(n['useExistingReplayGainTags'], d.normalization.useExistingReplayGainTags),
      peakTarget: num(n['peakTarget'], d.normalization.peakTarget, -30, 0),
      rmsTarget: num(n['rmsTarget'], d.normalization.rmsTarget, -40, -3),
      truePeakCeiling: num(n['truePeakCeiling'], d.normalization.truePeakCeiling, -9, 0),
      peakProtection: oneOf(n['peakProtection'], ['none', 'reduce', 'limiter'] as const, d.normalization.peakProtection),
      maxGain: num(n['maxGain'], d.normalization.maxGain, 0, 40)
    },
    export: {
      outputDir: str(e['outputDir'], d.export.outputDir),
      overwriteOriginals: bool(e['overwriteOriginals'], d.export.overwriteOriginals),
      preserveFolderStructure: bool(e['preserveFolderStructure'], d.export.preserveFolderStructure),
      fileSuffix: str(e['fileSuffix'], d.export.fileSuffix).replace(/[<>:"/\\|?*]/g, '').slice(0, 40),
      outputFormat: oneOf(
        e['outputFormat'],
        ['original', 'mp3', 'flac', 'wav', 'm4a', 'ogg'] as const,
        d.export.outputFormat
      ),
      bitrateMode: oneOf(e['bitrateMode'], ['original', 'custom'] as const, d.export.bitrateMode),
      customBitrateKbps: Math.round(num(e['customBitrateKbps'], d.export.customBitrateKbps, 32, 512)),
      keepMetadata: bool(e['keepMetadata'], d.export.keepMetadata),
      keepCover: bool(e['keepCover'], d.export.keepCover)
    },
    media: {
      outputDir: str(m['outputDir'], d.media.outputDir),
      concurrency: Math.round(num(m['concurrency'], d.media.concurrency, 1, 8))
    },
    concurrency: Math.round(num(r['concurrency'], defaultConcurrency, 1, MAX_CONCURRENCY)),
    theme: oneOf(r['theme'], ['system', 'light', 'dark'] as const, d.theme),
    ffmpegPath: str(r['ffmpegPath'], d.ffmpegPath).trim(),
    ffprobePath: str(r['ffprobePath'], d.ffprobePath).trim()
  };
}
