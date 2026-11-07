import { describe, expect, it } from 'vitest';
import {
  ProgressParser,
  extractTags,
  parseAnalysisOutput,
  parseAstatsOutput,
  parseDbValue,
  parseFfprobeOutput,
  parseLoudnormOutput,
  parseProgressLine
} from '../parsers';
import { ANALYSIS_STDERR } from './fixtures';

describe('parseDbValue', () => {
  it('parses numbers and dB strings', () => {
    expect(parseDbValue('-14.20')).toBe(-14.2);
    expect(parseDbValue('-6.20 dB')).toBe(-6.2);
    expect(parseDbValue('+3')).toBe(3);
    expect(parseDbValue(2.5)).toBe(2.5);
  });

  it('returns null for infinities and garbage', () => {
    expect(parseDbValue('-inf')).toBeNull();
    expect(parseDbValue('nan')).toBeNull();
    expect(parseDbValue('')).toBeNull();
    expect(parseDbValue(undefined)).toBeNull();
    expect(parseDbValue(Number.NEGATIVE_INFINITY)).toBeNull();
  });
});

describe('analysis output', () => {
  it('parses loudnorm JSON', () => {
    expect(parseLoudnormOutput(ANALYSIS_STDERR)).toEqual({
      integratedLufs: -34.05,
      truePeakDb: -33.33,
      lra: 0,
      threshold: -44.05
    });
  });

  it('reads the Overall section of astats, not per-channel values', () => {
    const r = parseAstatsOutput(ANALYSIS_STDERR);
    expect(r.samplePeakDb).toBeCloseTo(-33.327735);
    expect(r.rmsDb).toBeCloseTo(-36.348605);
  });

  it('handles -inf for silent input', () => {
    const silent = ANALYSIS_STDERR.replace('"-34.05"', '"-inf"').replace('Peak level dB: -33.327735', 'Peak level dB: -inf');
    const r = parseAnalysisOutput(silent);
    expect(r.integratedLufs).toBeNull();
    expect(r.samplePeakDb).toBeNull();
  });

  it('throws a clear error when the output is missing', () => {
    expect(() => parseLoudnormOutput('Invalid data found when processing input')).toThrow(/loudnorm/);
    expect(() => parseAstatsOutput('nothing here')).toThrow(/astats/);
  });
});

describe('parseFfprobeOutput', () => {
  const json = JSON.stringify({
    streams: [
      {
        codec_type: 'audio', codec_name: 'flac', sample_rate: '96000', channels: 2,
        sample_fmt: 's32', bits_per_raw_sample: '24', tags: { REPLAYGAIN_TRACK_GAIN: '-7.10 dB' }
      },
      { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } }
    ],
    format: {
      format_name: 'flac', duration: '245.5', bit_rate: '2400000',
      tags: { ARTIST: 'Artista', ALBUM: 'Álbum', album_artist: 'Vários', TRACK: '3', DATE: '1999', GENRE: 'Rock', TITLE: 'Faixa' }
    }
  });

  it('extracts stream properties', () => {
    const p = parseFfprobeOutput(json);
    expect(p.codec).toBe('flac');
    expect(p.durationSec).toBe(245.5);
    expect(p.sampleRate).toBe(96000);
    expect(p.bitsPerSample).toBe(24);
    expect(p.bitRate).toBe(2_400_000);
    expect(p.hasCover).toBe(true);
  });

  it('merges case-insensitive tags from format and stream', () => {
    expect(parseFfprobeOutput(json).tags).toEqual({
      title: 'Faixa', artist: 'Artista', album: 'Álbum', albumArtist: 'Vários',
      track: '3', date: '1999', genre: 'Rock', replayGainTrackGain: -7.1
    });
  });

  it('rejects files without audio', () => {
    expect(() => parseFfprobeOutput(JSON.stringify({ streams: [{ codec_type: 'video' }], format: {} }))).toThrow(/áudio/);
    expect(() => parseFfprobeOutput('not json')).toThrow(/ffprobe/);
  });

  it('prefers the first non-empty tag value', () => {
    expect(extractTags({ artist: '  ' }, { ARTIST: 'B' }).artist).toBe('B');
    expect(extractTags({ year: '2001' }).date).toBe('2001');
  });
});

describe('progress parsing', () => {
  it('parses progress keys', () => {
    expect(parseProgressLine('out_time_us=2500000')).toBe(2.5);
    expect(parseProgressLine('out_time_ms=1000000')).toBe(1);
    expect(parseProgressLine('out_time=00:01:02.500000')).toBe(62.5);
    expect(parseProgressLine('out_time=-577014:32:22.775807')).toBeNull();
    expect(parseProgressLine('out_time_us=N/A')).toBeNull();
    expect(parseProgressLine('progress=continue')).toBeNull();
  });

  it('handles chunks split mid-line', () => {
    const p = new ProgressParser();
    expect(p.push('bitrate=N/A\nout_time_us=10')).toBeNull();
    expect(p.push('00000\nspeed=2x\n')).toBe(1);
  });
});
