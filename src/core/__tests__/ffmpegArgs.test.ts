import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/defaults';
import type { ExportSettings } from '../../shared/types';
import {
  buildAnalysisArgs,
  buildExportArgs,
  buildGainFilter,
  resolveBitrateKbps,
  resolveEncoder,
  targetContainer
} from '../ffmpegArgs';
import { makeProbe } from './fixtures';

const exportSettings = (o: Partial<ExportSettings> = {}): ExportSettings => ({ ...DEFAULT_SETTINGS.export, ...o });

const argValue = (args: string[], flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

describe('targetContainer', () => {
  it('keeps the input format by default', () => {
    expect(targetContainer('MP3', 'original')).toBe('mp3');
    expect(targetContainer('aac', 'original')).toBe('aac');
    expect(targetContainer('wav', 'flac')).toBe('flac');
  });

  it('rejects unsupported extensions', () => {
    expect(() => targetContainer('wma', 'original')).toThrow(/não suportado/);
  });
});

describe('resolveEncoder', () => {
  it('keeps bit depth for lossless formats', () => {
    expect(resolveEncoder('flac', makeProbe({ codec: 'flac', bitsPerSample: 24 })).sampleFmt).toBe('s32');
    expect(resolveEncoder('flac', makeProbe({ codec: 'flac', bitsPerSample: 16 })).sampleFmt).toBe('s16');
    expect(resolveEncoder('wav', makeProbe({ codec: 'pcm_s24le', bitsPerSample: 24 })).codec).toBe('pcm_s24le');
    expect(resolveEncoder('wav', makeProbe({ codec: 'pcm_f32le', bitsPerSample: 32 })).codec).toBe('pcm_f32le');
    expect(resolveEncoder('wav', makeProbe()).codec).toBe('pcm_s16le');
  });

  it('keeps ALAC and Opus codecs', () => {
    expect(resolveEncoder('m4a', makeProbe({ codec: 'alac' })).codec).toBe('alac');
    expect(resolveEncoder('m4a', makeProbe({ codec: 'aac' })).codec).toBe('aac');
    expect(resolveEncoder('ogg', makeProbe({ codec: 'opus' })).codec).toBe('libopus');
    expect(resolveEncoder('ogg', makeProbe({ codec: 'vorbis' })).codec).toBe('libvorbis');
  });
});

describe('resolveBitrateKbps', () => {
  const mp3 = resolveEncoder('mp3', makeProbe());

  it('keeps the original bitrate, snapped to valid MP3 values', () => {
    expect(resolveBitrateKbps(makeProbe({ bitRate: 192_000 }), mp3, exportSettings())).toBe(192);
    expect(resolveBitrateKbps(makeProbe({ bitRate: 245_300 }), mp3, exportSettings())).toBe(256);
  });

  it('uses the custom bitrate, clamped to the encoder maximum', () => {
    expect(resolveBitrateKbps(makeProbe(), mp3, exportSettings({ bitrateMode: 'custom', customBitrateKbps: 128 }))).toBe(128);
    expect(resolveBitrateKbps(makeProbe(), mp3, exportSettings({ bitrateMode: 'custom', customBitrateKbps: 500 }))).toBe(320);
  });

  it('uses the encoder default for lossless sources', () => {
    const flacSource = makeProbe({ codec: 'flac', bitRate: 900_000 });
    expect(resolveBitrateKbps(flacSource, mp3, exportSettings())).toBe(320);
  });

  it('returns null for lossless targets', () => {
    expect(resolveBitrateKbps(makeProbe(), resolveEncoder('flac', makeProbe()), exportSettings())).toBeNull();
  });
});

describe('filters and arguments', () => {
  it('builds the analysis command', () => {
    const args = buildAnalysisArgs('in.mp3');
    expect(argValue(args, '-i')).toBe('in.mp3');
    expect(argValue(args, '-af')).toContain('loudnorm');
    expect(argValue(args, '-af')).toMatch(/^astats/);
    expect(args.slice(-3)).toEqual(['-f', 'null', '-']);
  });

  it('builds the gain filter with optional limiter', () => {
    expect(buildGainFilter({ gainDb: -3.456, useLimiter: false }, -1)).toBe('volume=-3.46dB');
    expect(buildGainFilter({ gainDb: 6, useLimiter: true }, -1)).toBe(
      'volume=6.00dB,alimiter=limit=0.8913:attack=5:release=50:level=false:latency=true'
    );
  });

  it('builds an MP3 export keeping cover and metadata', () => {
    const probe = makeProbe({ hasCover: true, bitRate: 320_000 });
    const args = buildExportArgs({
      input: 'in.mp3', output: 'out.tmp', probe, spec: resolveEncoder('mp3', probe),
      gain: { gainDb: 2, useLimiter: false }, settings: exportSettings(), ceilingDb: -1
    });
    expect(args).toContain('0:v:0?');
    expect(argValue(args, '-c:v')).toBe('copy');
    expect(argValue(args, '-c:a')).toBe('libmp3lame');
    expect(argValue(args, '-b:a')).toBe('320k');
    expect(argValue(args, '-map_metadata')).toBe('0');
    expect(args).toContain('REPLAYGAIN_TRACK_GAIN=');
    expect(args.slice(-3)).toEqual(['-f', 'mp3', 'out.tmp']);
  });

  it('drops cover and metadata when disabled', () => {
    const probe = makeProbe({ hasCover: true });
    const args = buildExportArgs({
      input: 'in.mp3', output: 'o', probe, spec: resolveEncoder('mp3', probe),
      gain: { gainDb: 0, useLimiter: false }, settings: exportSettings({ keepCover: false, keepMetadata: false }), ceilingDb: -1
    });
    expect(args).not.toContain('0:v:0?');
    expect(args).toContain('-vn');
    expect(argValue(args, '-map_metadata')).toBe('-1');
  });

  it('lifts Ogg stream tags to global metadata', () => {
    const probe = makeProbe({ codec: 'vorbis', formatName: 'ogg' });
    const args = buildExportArgs({
      input: 'in.ogg', output: 'o', probe, spec: resolveEncoder('mp3', probe),
      gain: { gainDb: 0, useLimiter: false }, settings: exportSettings(), ceilingDb: -1
    });
    expect(argValue(args, '-map_metadata')).toBe('0:s:a:0');
  });

  it('never maps a cover into WAV', () => {
    const probe = makeProbe({ codec: 'pcm_s16le', hasCover: true, bitsPerSample: 16 });
    const args = buildExportArgs({
      input: 'in.wav', output: 'o', probe, spec: resolveEncoder('wav', probe),
      gain: { gainDb: 1, useLimiter: false }, settings: exportSettings(), ceilingDb: -1
    });
    expect(args).not.toContain('0:v:0?');
    expect(args).not.toContain('-b:a');
  });
});
