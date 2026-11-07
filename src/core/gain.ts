import type {
  AlbumGrouping,
  AudioTags,
  GainNote,
  GainResult,
  LevelUnit,
  LoudnessAnalysis,
  NormalizationSettings
} from '../shared/types';
import { parentDir } from './pathUtils';

/** Tracks quieter than this are treated as silence and skipped. */
export const SILENCE_THRESHOLD_LUFS = -70;
export const SILENCE_THRESHOLD_DBFS = -90;

export interface GainInput {
  id: string;
  path: string;
  durationSec: number;
  analysis: LoudnessAnalysis;
  tags?: AudioTags;
}

export interface GainContext {
  /** Loudness of the album the track belongs to (ReplayGain album mode). */
  albumLoudness?: number | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Album loudness approximated as the duration-weighted energy mean of the
 * track loudness values (equivalent to measuring the concatenated album,
 * except for gating differences).
 */
export function computeAlbumLoudness(
  tracks: ReadonlyArray<{ lufs: number | null; durationSec: number }>
): number | null {
  let energy = 0;
  let duration = 0;
  for (const t of tracks) {
    if (t.lufs === null || !Number.isFinite(t.lufs) || t.lufs <= SILENCE_THRESHOLD_LUFS) continue;
    if (!(t.durationSec > 0)) continue;
    energy += t.durationSec * 10 ** (t.lufs / 10);
    duration += t.durationSec;
  }
  if (duration === 0) return null;
  return 10 * Math.log10(energy / duration);
}

export function albumKey(input: Pick<GainInput, 'path' | 'tags'>, grouping: AlbumGrouping): string {
  const folder = parentDir(input.path).toLowerCase();
  const album = input.tags?.album?.trim().toLowerCase();
  if (grouping === 'folder' || !album) return `dir:${folder}`;
  // Without an album artist, compilations would split per artist; fall back to folder.
  const albumArtist = input.tags?.albumArtist?.trim().toLowerCase();
  return `tag:${album}::${albumArtist ?? folder}`;
}

interface Measurement {
  current: number | null;
  target: number;
  unit: LevelUnit;
  tagGain: number | null;
}

function measure(input: GainInput, s: NormalizationSettings, ctx: GainContext): Measurement {
  const a = input.analysis;
  switch (s.mode) {
    case 'lufs':
      return { current: a.integratedLufs, target: s.lufsTarget, unit: 'LUFS', tagGain: null };
    case 'replaygain': {
      const album = s.replayGainType === 'album';
      const tag = album ? input.tags?.replayGainAlbumGain : input.tags?.replayGainTrackGain;
      return {
        current: album ? (ctx.albumLoudness ?? a.integratedLufs) : a.integratedLufs,
        target: s.replayGainReference,
        unit: 'LUFS',
        tagGain: s.useExistingReplayGainTags && tag !== undefined ? tag : null
      };
    }
    case 'peak':
      return { current: a.samplePeakDb, target: s.peakTarget, unit: 'dBFS', tagGain: null };
    case 'rms':
      return { current: a.rmsDb, target: s.rmsTarget, unit: 'dBFS', tagGain: null };
  }
}

/** Level of the track itself in the active mode's unit (used for display). */
function trackLevel(a: LoudnessAnalysis, s: NormalizationSettings): number | null {
  if (s.mode === 'peak') return a.samplePeakDb;
  if (s.mode === 'rms') return a.rmsDb;
  return a.integratedLufs;
}

export function computeGain(
  input: GainInput,
  s: NormalizationSettings,
  ctx: GainContext = {}
): GainResult {
  const a = input.analysis;
  const m = measure(input, s, ctx);
  const notes: GainNote[] = [];
  const level = trackLevel(a, s);
  const silenceThreshold = m.unit === 'LUFS' ? SILENCE_THRESHOLD_LUFS : SILENCE_THRESHOLD_DBFS;

  let gain: number;
  if (m.tagGain !== null) {
    gain = m.tagGain;
    notes.push('from-tag');
  } else if (
    m.current === null ||
    m.current <= silenceThreshold ||
    // In album mode `current` is the album level; the track itself may still be silent.
    level === null ||
    level <= silenceThreshold
  ) {
    return {
      skip: true,
      skipReason: 'silence',
      gainDb: 0,
      currentLevel: level,
      finalLevel: level,
      unit: m.unit,
      useLimiter: false,
      predictedPeakDb: a.truePeakDb ?? a.samplePeakDb,
      notes
    };
  } else {
    gain = m.target - m.current;
  }

  if (gain > s.maxGain) {
    gain = s.maxGain;
    notes.push('max-gain');
  }

  let useLimiter = false;
  // In peak mode the peak *is* the target, so no extra protection is needed.
  const peakRef = s.mode === 'peak' ? a.samplePeakDb : (a.truePeakDb ?? a.samplePeakDb);
  if (s.mode !== 'peak' && peakRef !== null && peakRef + gain > s.truePeakCeiling) {
    if (s.peakProtection === 'reduce') {
      gain = s.truePeakCeiling - peakRef;
      notes.push('peak-reduced');
    } else if (s.peakProtection === 'limiter') {
      useLimiter = true;
      notes.push('limiter');
    } else {
      notes.push('clipping-risk');
    }
  }

  gain = round2(gain);
  let predictedPeak = peakRef === null ? null : peakRef + gain;
  if (useLimiter && predictedPeak !== null) predictedPeak = Math.min(predictedPeak, s.truePeakCeiling);

  return {
    skip: false,
    gainDb: gain,
    currentLevel: level === null ? null : round2(level),
    finalLevel: level === null ? null : round2(level + gain),
    unit: m.unit,
    useLimiter,
    predictedPeakDb: predictedPeak === null ? null : round2(predictedPeak),
    notes
  };
}

/** Computes the gain of every analyzed track, resolving album groups when needed. */
export function computeBatchGains(
  inputs: readonly GainInput[],
  s: NormalizationSettings
): Map<string, GainResult> {
  const results = new Map<string, GainResult>();
  const albumLoudness = new Map<string, number | null>();

  if (s.mode === 'replaygain' && s.replayGainType === 'album') {
    const groups = new Map<string, GainInput[]>();
    for (const input of inputs) {
      const key = albumKey(input, s.albumGrouping);
      const list = groups.get(key);
      if (list) list.push(input);
      else groups.set(key, [input]);
    }
    for (const [key, tracks] of groups) {
      albumLoudness.set(
        key,
        computeAlbumLoudness(
          tracks.map((t) => ({ lufs: t.analysis.integratedLufs, durationSec: t.durationSec }))
        )
      );
    }
  }

  for (const input of inputs) {
    const ctx: GainContext =
      albumLoudness.size > 0 ? { albumLoudness: albumLoudness.get(albumKey(input, s.albumGrouping)) } : {};
    results.set(input.id, computeGain(input, s, ctx));
  }
  return results;
}
