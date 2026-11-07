import { describe, expect, it } from 'vitest';
import { DEFAULT_AUDIO_CONVERT, DEFAULT_VIDEO_CONVERT } from '../../shared/presets';
import { audioEncodeArgs, buildAudioConvert, resolveAudioCodec } from '../commands/audioConvert';
import { formatCommand, sizeFilter } from '../commands/common';
import { buildVideoConvert, resolutionFilter, resolveAudioCodecFor, resolveVideoCodec } from '../commands/videoConvert';
import { estimateAudioBytes, estimateEncodeSeconds } from '../estimates';
import { parseMediaInfo } from '../parsers';
import { argAfter, audioInfo, ctxOf, videoInfo } from './mediaFixtures';

describe('audio converter', () => {
  it('converts to MP3 keeping cover and metadata', () => {
    const r = buildAudioConvert(ctxOf(audioInfo()), { ...DEFAULT_AUDIO_CONVERT, bitrateKbps: 256 });
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-c:a')).toBe('libmp3lame');
    expect(argAfter(args, '-b:a')).toBe('256k');
    expect(args).toContain('0:v:0?');
    expect(argAfter(args, '-map_metadata')).toBe('0');
    expect(r.outputs[0]?.name).toBe('song.mp3');
    expect(r.estimatedBytes).toBeCloseTo((256_000 * 200) / 8);
  });

  it('clamps unsupported sample rates and channels with warnings', () => {
    const mp3 = resolveAudioCodec('mp3', 'mp3');
    const r = audioEncodeArgs(mp3, { bitrateKbps: 500, sampleRate: 96000, channels: 'original' }, { codec: 'flac', sampleRate: 96000, channels: 6, bitRate: null });
    expect(argAfter(r.args, '-ar')).toBe('48000');
    expect(argAfter(r.args, '-ac')).toBe('2');
    expect(argAfter(r.args, '-b:a')).toBe('320k');
    expect(r.warnings).toHaveLength(3);
  });

  it('forces 48 kHz for Opus and omits bitrate for lossless', () => {
    const opus = buildAudioConvert(ctxOf(audioInfo()), { ...DEFAULT_AUDIO_CONVERT, format: 'opus', codec: 'opus' });
    expect(argAfter(opus.steps[0]?.args ?? [], '-ar')).toBe('48000');
    const flac = buildAudioConvert(ctxOf(audioInfo()), { ...DEFAULT_AUDIO_CONVERT, format: 'flac', codec: 'flac' });
    expect(flac.steps[0]?.args).not.toContain('-b:a');
    const wav = buildAudioConvert(ctxOf(audioInfo()), { ...DEFAULT_AUDIO_CONVERT, format: 'wav', codec: 'pcm24', sampleRate: 96000 });
    expect(argAfter(wav.steps[0]?.args ?? [], '-c:a')).toBe('pcm_s24le');
    expect(wav.steps[0]?.args).not.toContain('0:v:0?');
  });

  it('writes WMA with the ASF muxer and lifts Ogg tags', () => {
    const r = buildAudioConvert(ctxOf(audioInfo({ formatName: 'ogg', path: 'a.ogg' })), { ...DEFAULT_AUDIO_CONVERT, format: 'wma', codec: 'wma' });
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-f')).toBe('asf');
    expect(argAfter(args, '-map_metadata')).toBe('0:s:a:0');
  });

  it('rejects files without audio', () => {
    expect(() => buildAudioConvert(ctxOf(videoInfo({ audio: null })), DEFAULT_AUDIO_CONVERT)).toThrow(/áudio/);
  });
});

describe('video converter', () => {
  it('builds an H.264 MP4 command', () => {
    const r = buildVideoConvert(ctxOf(videoInfo()), DEFAULT_VIDEO_CONVERT);
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-c:v')).toBe('libx264');
    expect(argAfter(args, '-crf')).toBe('21');
    expect(argAfter(args, '-movflags')).toBe('+faststart');
    expect(args).not.toContain('-vf');
    expect(r.estimatedBytes).toBeGreaterThan(0);
    expect(r.estimatedSeconds).toBeGreaterThan(0);
  });

  it('validates codecs per container', () => {
    expect(resolveVideoCodec('webm', 'h264').codec).toBe('vp9');
    expect(resolveVideoCodec('mpeg', 'h265').codec).toBe('mpeg2');
    expect(resolveVideoCodec('mkv', 'av1').warning).toBeUndefined();
    expect(resolveAudioCodecFor('webm', 'aac').codec).toBe('opus');
    expect(resolveAudioCodecFor('mov', 'copy').codec).toBe('copy');
    const r = buildVideoConvert(ctxOf(videoInfo()), { ...DEFAULT_VIDEO_CONVERT, format: 'webm', videoCodec: 'h264', audioCodec: 'aac' });
    expect(r.warnings).toHaveLength(2);
    expect(argAfter(r.steps[0]?.args ?? [], '-c:v')).toBe('libvpx-vp9');
  });

  it('scales by the short side and supports custom sizes', () => {
    const v = videoInfo().video as NonNullable<ReturnType<typeof videoInfo>['video']>;
    expect(resolutionFilter({ resolution: '720', customWidth: 0, customHeight: 0 }, v)).toEqual({ filter: 'scale=-2:720', width: 1280, height: 720 });
    expect(resolutionFilter({ resolution: '1080', customWidth: 0, customHeight: 0 }, v).filter).toBeNull();
    const portrait = { ...v, width: 1080, height: 1920 };
    expect(resolutionFilter({ resolution: '720', customWidth: 0, customHeight: 0 }, portrait).filter).toBe('scale=720:-2');
    expect(resolutionFilter({ resolution: 'custom', customWidth: 1080, customHeight: 1920 }, v).filter).toContain('pad=1080:1920');
    expect(sizeFilter(1281, 0)).toBe('scale=1282:-2');
  });

  it('applies fps, H.265 tag and audio options', () => {
    const r = buildVideoConvert(ctxOf(videoInfo()), { ...DEFAULT_VIDEO_CONVERT, videoCodec: 'h265', fps: 60, audioChannels: 1, audioBitrateKbps: 96 });
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-tag:v')).toBe('hvc1');
    expect(argAfter(args, '-r')).toBe('60');
    expect(argAfter(args, '-ac')).toBe('1');
    expect(argAfter(args, '-b:a')).toBe('96k');
    expect(formatCommand(args)).toMatch(/^ffmpeg -hide_banner .* -f mp4 W:\/work\/output\.mp4$/);
  });

  it('handles videos without audio and audio removal', () => {
    expect(buildVideoConvert(ctxOf(videoInfo({ audio: null })), DEFAULT_VIDEO_CONVERT).steps[0]?.args).toContain('-an');
    expect(buildVideoConvert(ctxOf(videoInfo()), { ...DEFAULT_VIDEO_CONVERT, audioCodec: 'none' }).steps[0]?.args).toContain('-an');
    expect(() => buildVideoConvert(ctxOf(audioInfo()), DEFAULT_VIDEO_CONVERT)).toThrow(/vídeo/);
  });
});

describe('estimates', () => {
  it('estimates audio sizes', () => {
    expect(estimateAudioBytes(10, { lossless: false, encoder: 'libmp3lame' }, 128, 44100, 2)).toBe(160_000);
    expect(estimateAudioBytes(1, { lossless: true, encoder: 'pcm_s16le' }, 0, 44100, 2)).toBe(176_400);
    expect(estimateAudioBytes(1, { lossless: true, encoder: 'flac' }, 0, 44100, 2)).toBeCloseTo(105_840);
  });

  it('makes AV1 slower than H.264 and 4K slower than 1080p', () => {
    const h264 = estimateEncodeSeconds('h264', 1920, 1080, 30, 60, 8);
    expect(estimateEncodeSeconds('av1', 1920, 1080, 30, 60, 8)).toBeGreaterThan(h264);
    expect(estimateEncodeSeconds('h264', 3840, 2160, 30, 60, 8)).toBeGreaterThan(h264);
  });
});

describe('parseMediaInfo', () => {
  it('separates real video from cover art', () => {
    const json = JSON.stringify({
      streams: [
        { codec_type: 'video', codec_name: 'mjpeg', disposition: { attached_pic: 1 } },
        { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720, avg_frame_rate: '30000/1001' },
        { codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2, tags: { title: 'T' } }
      ],
      format: { format_name: 'mov,mp4', duration: '12.5', size: '1000', bit_rate: '640', tags: { ARTIST: 'A' } }
    });
    const m = parseMediaInfo(json, 'x.mp4');
    expect(m.video).toEqual({ codec: 'h264', width: 1280, height: 720, fps: 29.97, bitRate: null });
    expect(m.hasCover).toBe(true);
    expect(m.sizeBytes).toBe(1000);
    expect(m.tags).toEqual({ artist: 'A', title: 'T' });
  });

  it('treats audio files with cover as audio-only', () => {
    const json = JSON.stringify({ streams: [{ codec_type: 'audio', codec_name: 'mp3' }, { codec_type: 'video', codec_name: 'png' }], format: { duration: '3' } });
    const m = parseMediaInfo(json, 'a.mp3');
    expect(m.video).toBeNull();
    expect(m.hasCover).toBe(true);
  });
});
