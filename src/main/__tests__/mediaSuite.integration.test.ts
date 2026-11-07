// End-to-end tests of every converter/editor operation with the bundled FFmpeg.
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AudioEditOp, OperationRequest, VideoEditOp } from '../../shared/media';
import { DEFAULT_AUDIO_CONVERT, DEFAULT_VIDEO_CONVERT } from '../../shared/presets';
import { runProcess } from '../ffmpeg/runner';
import { MediaProbe } from '../media/probe';
import { AudioConverterService } from '../services/AudioConverterService';
import { AudioEditorService } from '../services/AudioEditorService';
import { BatchProcessingService } from '../services/BatchProcessingService';
import { findSystemFont } from '../services/fonts';
import { VideoConverterService } from '../services/VideoConverterService';
import { VideoEditorService } from '../services/VideoEditorService';

const ffmpeg = ffmpegStatic ?? '';
const ffprobe = ffprobeStatic.path;
const available = existsSync(ffmpeg) && existsSync(ffprobe);
const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

let dir: string;
let video: string;
let silentVideo: string;
let song: string;
let song2: string;
let image: string;
let subtitle: string;
let probe: MediaProbe;
let queue: BatchProcessingService;
let services: { ac: AudioConverterService; vc: VideoConverterService; ae: AudioEditorService; ve: VideoEditorService };

async function run(req: OperationRequest): Promise<string[]> {
  const svc = req.module === 'audio-convert' ? services.ac : req.module === 'video-convert' ? services.vc : req.module === 'audio-edit' ? services.ae : services.ve;
  const before = new Set(queue.snapshot().jobs.map((j) => j.id));
  await (svc as unknown as { enqueue(r: OperationRequest): Promise<number> }).enqueue(req);
  await queue.idle();
  const jobs = queue.snapshot().jobs.filter((j) => !before.has(j.id));
  for (const j of jobs) expect(j.error ?? j.status).toBe('done');
  return jobs.flatMap((j) => j.outputs);
}

const durationOf = async (file: string): Promise<number> => (await new MediaProbe(() => ffprobe).probe(file)).durationSec;

describe.skipIf(!available)('media suite (FFmpeg)', () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'alp-suite-'));
    await mkdir(join(dir, 'src'));
    const gen = (args: string[]) => runProcess(ffmpeg, ['-hide_banner', '-y', ...args]);
    video = join(dir, 'src', 'clip.mp4');
    await gen(['-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=25:duration=6', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', video]);
    silentVideo = join(dir, 'src', 'mudo.mov');
    await gen(['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=3', '-c:v', 'libx264', '-preset', 'ultrafast', silentVideo]);
    song = join(dir, 'src', 'song.mp3');
    await gen(['-f', 'lavfi', '-i', 'sine=frequency=330:duration=8', '-ac', '2', '-metadata', 'artist=Tester', '-c:a', 'libmp3lame', '-b:a', '192k', song]);
    song2 = join(dir, 'src', 'song2.wav');
    await gen(['-f', 'lavfi', '-i', 'sine=frequency=550:duration=4', '-ar', '48000', song2]);
    image = join(dir, 'src', 'logo.png');
    await gen(['-f', 'lavfi', '-i', 'color=c=red:s=100x50', '-frames:v', '1', image]);
    subtitle = join(dir, 'src', "legenda d'teste.srt");
    await writeFile(subtitle, '1\n00:00:00,500 --> 00:00:03,000\nOlá, legenda!\n');

    probe = new MediaProbe(() => ffprobe);
    queue = new BatchProcessingService({ binaries: () => ({ ffmpeg, ffprobe }), concurrency: () => 3, log: silentLog, emit: () => {} });
    const font = findSystemFont();
    const deps = { probe, queue, cpuCount: 4, fontPath: () => font };
    services = { ac: new AudioConverterService(deps), vc: new VideoConverterService(deps), ae: new AudioEditorService(deps), ve: new VideoEditorService(deps) };
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('converts audio to every format', async () => {
    const out = join(dir, 'audio-conv');
    for (const [format, codec] of [['opus', 'opus'], ['wma', 'wma'], ['flac', 'flac'], ['m4a', 'alac'], ['ogg', 'vorbis'], ['wav', 'pcm24'], ['aac', 'aac']] as const) {
      const [file] = await run({ module: 'audio-convert', files: [song], outputDir: out, options: { ...DEFAULT_AUDIO_CONVERT, format, codec, sampleRate: 48000, channels: 1 } });
      const info = await probe.probe(file as string);
      expect(info.audio?.channels).toBe(1);
      expect(Math.abs(info.durationSec - 8)).toBeLessThan(0.3);
    }
    expect((await readdir(out)).length).toBe(7);
    const flac = await probe.probe(join(out, 'song.flac'));
    expect(flac.tags['artist']).toBe('Tester');
  });

  it('previews audio conversions with estimates', async () => {
    const p = await services.ac.preview({ module: 'audio-convert', files: [song, song2], outputDir: join(dir, 'x'), options: { ...DEFAULT_AUDIO_CONVERT, bitrateKbps: 128 } });
    expect(p.jobs).toBe(2);
    expect(p.command).toContain('libmp3lame');
    expect(p.command).toContain('song.mp3');
    expect(p.command).not.toContain('.alp-work');
    expect(Math.abs((p.estimatedBytes ?? 0) - (128_000 * 12) / 8)).toBeLessThan(5000);
  });

  it('converts video between containers and codecs', async () => {
    const out = join(dir, 'video-conv');
    const [webm] = await run({ module: 'video-convert', files: [video], outputDir: out, options: { ...DEFAULT_VIDEO_CONVERT, format: 'webm', videoCodec: 'vp9', audioCodec: 'opus', quality: 'low' } });
    const info = await probe.probe(webm as string);
    expect(info.video?.codec).toBe('vp9');
    expect(info.audio?.codec).toBe('opus');
    const [mkv] = await run({ module: 'video-convert', files: [video], outputDir: out, options: { ...DEFAULT_VIDEO_CONVERT, format: 'mkv', videoCodec: 'h265', resolution: 'custom', customWidth: 160, customHeight: 0, fps: 24 } });
    const m = await probe.probe(mkv as string);
    expect(m.video).toMatchObject({ codec: 'hevc', width: 160, height: 120, fps: 24 });
    for (const format of ['avi', 'mov', 'mpeg', 'flv'] as const) {
      const [file] = await run({ module: 'video-convert', files: [video], outputDir: out, options: { ...DEFAULT_VIDEO_CONVERT, format, quality: 'low' } });
      expect((await probe.probe(file as string)).video).not.toBeNull();
    }
    const vertical = await run({ module: 'video-convert', files: [video], outputDir: out, options: { ...DEFAULT_VIDEO_CONVERT, resolution: 'custom', customWidth: 180, customHeight: 320 } });
    expect((await probe.probe(vertical[0] as string)).video).toMatchObject({ width: 180, height: 320 });
  });

  it('runs every audio editor tool', async () => {
    const out = join(dir, 'audio-edit');
    const edit = (op: AudioEditOp, files = [song]) => run({ module: 'audio-edit', files, outputDir: out, op, output: { format: 'original' } });
    expect(await durationOf((await edit({ tool: 'trim', startSec: 2, endSec: 5 }))[0] as string)).toBeCloseTo(3, 0);
    expect(await durationOf((await edit({ tool: 'join', crossfadeSec: 1 }, [song, song2]))[0] as string)).toBeCloseTo(11, 0);
    expect(await durationOf((await edit({ tool: 'join', crossfadeSec: 0 }, [song, song2]))[0] as string)).toBeCloseTo(12, 0);
    expect(await edit({ tool: 'split', split: { mode: 'parts', parts: 4 } })).toHaveLength(4);
    expect(await durationOf((await edit({ tool: 'speed', factor: 2, keepPitch: true }))[0] as string)).toBeCloseTo(4, 0);
    for (const op of [
      { tool: 'fade-in', durationSec: 1 },
      { tool: 'fade-out', durationSec: 1 },
      { tool: 'volume', gainDb: -6 },
      { tool: 'remove-silence', thresholdDb: -50, minSilenceSec: 0.5 },
      { tool: 'speed', factor: 0.8, keepPitch: false }
    ] as AudioEditOp[]) {
      expect(await edit(op)).toHaveLength(1);
    }
    const [mono] = await edit({ tool: 'channels', channels: 1 });
    expect((await probe.probe(mono as string)).audio?.channels).toBe(1);
  });

  it('extends audio to a target duration with each transition', async () => {
    const out = join(dir, 'loop-audio');
    for (const transition of ['cut', 'crossfade', 'fade'] as const) {
      const [file] = await run({ module: 'audio-edit', files: [song], outputDir: out, op: { tool: 'loop', loop: { mode: 'duration', times: 2, targetSec: 30, transition, transitionSec: 1 } }, output: { format: 'original' } });
      expect(Math.abs((await durationOf(file as string)) - 30)).toBeLessThan(0.5);
    }
    const [times] = await run({ module: 'audio-edit', files: [song], outputDir: out, op: { tool: 'loop', loop: { mode: 'times', times: 3, targetSec: 0, transition: 'none', transitionSec: 0 } }, output: { format: 'original' } });
    expect(await durationOf(times as string)).toBeCloseTo(24, 0);
  });

  it('runs every video editor tool', async () => {
    const out = join(dir, 'video-edit');
    const edit = (op: VideoEditOp, files = [video], format: OperationRequest extends never ? never : 'original' | 'mkv' = 'original') =>
      run({ module: 'video-edit', files, outputDir: out, op, output: { format } });

    expect(await durationOf((await edit({ tool: 'trim', startSec: 1, endSec: 4, precise: true }))[0] as string)).toBeCloseTo(3, 0);
    expect(await edit({ tool: 'trim', startSec: 1, endSec: 4, precise: false })).toHaveLength(1);
    expect(await durationOf((await edit({ tool: 'remove', ranges: [{ startSec: 1, endSec: 3 }] }))[0] as string)).toBeCloseTo(4, 0);
    expect((await edit({ tool: 'split', precise: true, split: { mode: 'segments', segmentSec: 2 } })).length).toBe(3);
    const [rotated] = await edit({ tool: 'rotate', angle: 90 });
    expect((await probe.probe(rotated as string)).video).toMatchObject({ width: 240, height: 320 });
    expect(await edit({ tool: 'flip', direction: 'horizontal' })).toHaveLength(1);
    const [resized] = await edit({ tool: 'resize', width: 200, height: 200, fit: 'pad' });
    expect((await probe.probe(resized as string)).video).toMatchObject({ width: 200, height: 200 });
    const [audio] = await edit({ tool: 'extract-audio', format: 'mp3' });
    expect((await probe.probe(audio as string)).video).toBeNull();
    const [replaced] = await edit({ tool: 'replace-audio', audioPath: song2, loopAudio: true });
    expect(Math.abs((await durationOf(replaced as string)) - 6)).toBeLessThan(0.3);
    expect(await edit({ tool: 'subtitle', subtitlePath: subtitle, mode: 'burn' })).toHaveLength(1);
    expect(await edit({ tool: 'subtitle', subtitlePath: subtitle, mode: 'soft' })).toHaveLength(1);
    expect(await edit({ tool: 'watermark', kind: 'image', imagePath: image, text: '', position: 'bottom-right', opacity: 0.7, sizePct: 20 })).toHaveLength(1);
    if (findSystemFont()) {
      expect(await edit({ tool: 'watermark', kind: 'text', imagePath: '', text: "Matheus: 'teste' 100%", position: 'top-left', opacity: 0.8, sizePct: 6 })).toHaveLength(1);
    }
    const [gif] = await edit({ tool: 'gif', startSec: 0, durationSec: 2, fps: 10, width: 160 });
    expect(gif?.endsWith('.gif')).toBe(true);
    const [joined] = await edit({ tool: 'join' }, [video, silentVideo]);
    const j = await probe.probe(joined as string);
    expect(j.video).toMatchObject({ width: 320, height: 240 });
    expect(Math.abs(j.durationSec - 9)).toBeLessThan(0.5);
  });

  it('extends a video to a target duration with each transition', async () => {
    const out = join(dir, 'loop-video');
    for (const transition of ['cut', 'crossfade', 'fade', 'none'] as const) {
      const [file] = await run({ module: 'video-edit', files: [video], outputDir: out, op: { tool: 'loop', loop: { mode: 'duration', times: 2, targetSec: 20, transition, transitionSec: 1 } }, output: { format: 'original' } });
      const d = await durationOf(file as string);
      if (transition === 'none') expect(d).toBeCloseTo(24, 0);
      else expect(Math.abs(d - 20)).toBeLessThan(0.5);
    }
  });

  it('reports invalid requests as errors without enqueueing', async () => {
    await expect(services.ae.enqueue({ module: 'audio-edit', files: [song], outputDir: dir, op: { tool: 'join', crossfadeSec: 0 }, output: { format: 'original' } })).rejects.toThrow(/2 arquivos/);
    await expect(services.vc.enqueue({ module: 'video-convert', files: [song], outputDir: dir, options: DEFAULT_VIDEO_CONVERT })).rejects.toThrow(/vídeo/);
    await expect(services.ve.enqueue({ module: 'video-edit', files: [video], outputDir: dir, op: { tool: 'replace-audio', audioPath: join(dir, 'nope.mp3'), loopAudio: false }, output: { format: 'original' } })).rejects.toThrow(/não foi encontrado/);
  });
});
