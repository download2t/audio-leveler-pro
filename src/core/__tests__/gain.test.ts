import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/defaults';
import type { NormalizationSettings } from '../../shared/types';
import { albumKey, computeAlbumLoudness, computeBatchGains, computeGain, type GainInput } from '../gain';
import { makeAnalysis } from './fixtures';

const settings = (o: Partial<NormalizationSettings> = {}): NormalizationSettings => ({
  ...DEFAULT_SETTINGS.normalization,
  ...o
});

const input = (o: Partial<GainInput> = {}): GainInput => ({
  id: 'a',
  path: '/music/album/01.mp3',
  durationSec: 200,
  analysis: makeAnalysis(),
  ...o
});

describe('computeGain - LUFS', () => {
  it('computes target minus integrated loudness', () => {
    const r = computeGain(input({ analysis: makeAnalysis({ truePeakDb: -10 }) }), settings({ lufsTarget: -14 }));
    expect(r.skip).toBe(false);
    expect(r.gainDb).toBe(6);
    expect(r.currentLevel).toBe(-20);
    expect(r.finalLevel).toBe(-14);
    expect(r.unit).toBe('LUFS');
    expect(r.useLimiter).toBe(false);
  });

  it('attenuates loud tracks', () => {
    const r = computeGain(input({ analysis: makeAnalysis({ integratedLufs: -8, truePeakDb: 0.5 }) }), settings());
    expect(r.gainDb).toBe(-6);
    expect(r.predictedPeakDb).toBe(-5.5);
    expect(r.notes).toEqual([]);
  });

  it('enables the limiter when the true peak would exceed the ceiling', () => {
    const r = computeGain(
      input({ analysis: makeAnalysis({ integratedLufs: -20, truePeakDb: -2 }) }),
      settings({ lufsTarget: -14, peakProtection: 'limiter', truePeakCeiling: -1 })
    );
    expect(r.gainDb).toBe(6);
    expect(r.useLimiter).toBe(true);
    expect(r.notes).toContain('limiter');
    expect(r.predictedPeakDb).toBe(-1);
  });

  it('reduces the gain to respect the ceiling in "reduce" mode', () => {
    const r = computeGain(
      input({ analysis: makeAnalysis({ integratedLufs: -20, truePeakDb: -2 }) }),
      settings({ lufsTarget: -14, peakProtection: 'reduce', truePeakCeiling: -1 })
    );
    expect(r.gainDb).toBe(1);
    expect(r.finalLevel).toBe(-19);
    expect(r.notes).toContain('peak-reduced');
  });

  it('flags clipping risk when protection is disabled', () => {
    const r = computeGain(
      input({ analysis: makeAnalysis({ integratedLufs: -20, truePeakDb: -2 }) }),
      settings({ peakProtection: 'none' })
    );
    expect(r.notes).toContain('clipping-risk');
    expect(r.useLimiter).toBe(false);
  });

  it('caps the positive gain at maxGain', () => {
    const r = computeGain(
      input({ analysis: makeAnalysis({ integratedLufs: -50, truePeakDb: -40 }) }),
      settings({ lufsTarget: -14, maxGain: 12 })
    );
    expect(r.gainDb).toBe(12);
    expect(r.notes).toContain('max-gain');
  });

  it('skips silent or unmeasurable tracks', () => {
    expect(computeGain(input({ analysis: makeAnalysis({ integratedLufs: null }) }), settings()).skip).toBe(true);
    const r = computeGain(input({ analysis: makeAnalysis({ integratedLufs: -75 }) }), settings());
    expect(r.skip).toBe(true);
    expect(r.skipReason).toBe('silence');
    expect(r.gainDb).toBe(0);
  });

  it('falls back to sample peak when true peak is unknown', () => {
    const r = computeGain(
      input({ analysis: makeAnalysis({ integratedLufs: -20, truePeakDb: null, samplePeakDb: -3 }) }),
      settings({ lufsTarget: -14, peakProtection: 'limiter' })
    );
    expect(r.useLimiter).toBe(true);
  });
});

describe('computeGain - Peak and RMS', () => {
  it('normalizes the sample peak to the target', () => {
    const r = computeGain(input({ analysis: makeAnalysis({ samplePeakDb: -6.5 }) }), settings({ mode: 'peak', peakTarget: -1 }));
    expect(r.gainDb).toBe(5.5);
    expect(r.unit).toBe('dBFS');
    expect(r.finalLevel).toBe(-1);
    expect(r.useLimiter).toBe(false);
  });

  it('normalizes RMS and protects peaks', () => {
    const r = computeGain(
      input({ analysis: makeAnalysis({ rmsDb: -22, truePeakDb: -6 }) }),
      settings({ mode: 'rms', rmsTarget: -16, peakProtection: 'reduce', truePeakCeiling: -1 })
    );
    expect(r.gainDb).toBe(5);
    expect(r.finalLevel).toBe(-17);
  });

  it('treats digital silence as skip in peak mode', () => {
    const r = computeGain(input({ analysis: makeAnalysis({ samplePeakDb: null }) }), settings({ mode: 'peak' }));
    expect(r.skip).toBe(true);
  });
});

describe('computeGain - ReplayGain', () => {
  it('uses the -18 LUFS reference for track gain', () => {
    const r = computeGain(input(), settings({ mode: 'replaygain', replayGainReference: -18 }));
    expect(r.gainDb).toBe(2);
  });

  it('uses existing tags when requested', () => {
    const r = computeGain(
      input({ tags: { replayGainTrackGain: -4.37 } }),
      settings({ mode: 'replaygain', useExistingReplayGainTags: true })
    );
    expect(r.gainDb).toBe(-4.37);
    expect(r.notes).toContain('from-tag');
  });

  it('ignores tags when the option is disabled', () => {
    const r = computeGain(input({ tags: { replayGainTrackGain: -4.37 } }), settings({ mode: 'replaygain' }));
    expect(r.gainDb).toBe(2);
  });

  it('still skips a silent track that belongs to an audible album', () => {
    const r = computeGain(
      input({ analysis: makeAnalysis({ integratedLufs: null }) }),
      settings({ mode: 'replaygain', replayGainType: 'album' }),
      { albumLoudness: -12 }
    );
    expect(r.skip).toBe(true);
  });

  it('applies album loudness in album mode', () => {
    const r = computeGain(input(), settings({ mode: 'replaygain', replayGainType: 'album' }), { albumLoudness: -10 });
    expect(r.gainDb).toBe(-8);
    // Display keeps the track's own loudness.
    expect(r.currentLevel).toBe(-20);
    expect(r.finalLevel).toBe(-28);
  });
});

describe('album helpers', () => {
  it('computes the duration-weighted energy mean', () => {
    expect(computeAlbumLoudness([{ lufs: -14, durationSec: 100 }, { lufs: -14, durationSec: 50 }])).toBeCloseTo(-14, 6);
    // Equal durations, -10 and -20 => 10*log10((0.1 + 0.01)/2)
    expect(computeAlbumLoudness([{ lufs: -10, durationSec: 60 }, { lufs: -20, durationSec: 60 }])).toBeCloseTo(-12.596, 3);
  });

  it('ignores silent and invalid tracks', () => {
    expect(computeAlbumLoudness([{ lufs: null, durationSec: 10 }, { lufs: -80, durationSec: 10 }])).toBeNull();
    expect(computeAlbumLoudness([{ lufs: -12, durationSec: 0 }, { lufs: -16, durationSec: 10 }])).toBe(-16);
  });

  it('groups by tag with folder fallback', () => {
    expect(albumKey({ path: '/m/a/1.mp3', tags: { album: 'X', albumArtist: 'Y' } }, 'tag')).toBe('tag:x::y');
    expect(albumKey({ path: '/m/a/1.mp3', tags: { album: 'X' } }, 'tag')).toBe('tag:x::/m/a');
    expect(albumKey({ path: '/m/a/1.mp3', tags: {} }, 'tag')).toBe('dir:/m/a');
    expect(albumKey({ path: 'C:\\M\\A\\1.mp3', tags: { album: 'X' } }, 'folder')).toBe('dir:c:\\m\\a');
  });

  it('computes a single gain for all tracks of an album', () => {
    const tracks: GainInput[] = [
      input({ id: '1', path: '/m/a/1.mp3', analysis: makeAnalysis({ integratedLufs: -10, truePeakDb: -12 }), durationSec: 60 }),
      input({ id: '2', path: '/m/a/2.mp3', analysis: makeAnalysis({ integratedLufs: -20, truePeakDb: -12 }), durationSec: 60 }),
      input({ id: '3', path: '/m/b/1.mp3', analysis: makeAnalysis({ integratedLufs: -24, truePeakDb: -12 }), durationSec: 60 })
    ];
    const gains = computeBatchGains(tracks, settings({ mode: 'replaygain', replayGainType: 'album', albumGrouping: 'folder' }));
    expect(gains.get('1')?.gainDb).toBe(gains.get('2')?.gainDb);
    expect(gains.get('1')?.gainDb).toBeCloseTo(-18 + 12.596, 2);
    expect(gains.get('3')?.gainDb).toBe(6);
  });

  it('computes independent gains in track mode', () => {
    const gains = computeBatchGains(
      [input({ id: '1' }), input({ id: '2', analysis: makeAnalysis({ integratedLufs: -10, truePeakDb: -3 }) })],
      settings({ lufsTarget: -14 })
    );
    expect(gains.get('1')?.gainDb).toBe(6);
    expect(gains.get('2')?.gainDb).toBe(-4);
  });
});
