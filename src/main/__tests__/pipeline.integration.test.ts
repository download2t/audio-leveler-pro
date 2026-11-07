// End-to-end test of the FFmpeg pipeline with the bundled binaries.
// Skipped automatically when the binaries are not available.
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/defaults';
import type { AppSettings, BatchEvent, BatchFileInput } from '../../shared/types';
import { runProcess } from '../ffmpeg/runner';
import { analyzeFile, probeFile } from '../services/audioTools';
import { BatchProcessor } from '../services/batchProcessor';

const ffmpeg = ffmpegStatic ?? '';
const ffprobe = ffprobeStatic.path;
const available = existsSync(ffmpeg) && existsSync(ffprobe);
const bin = { ffmpeg, ffprobe };
const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

let dir: string;

async function makeTone(name: string, gainDb: number, codecArgs: string[], seconds = 6): Promise<string> {
  const file = join(dir, 'src', name);
  await runProcess(ffmpeg, [
    '-hide_banner', '-y', '-f', 'lavfi', '-i', `sine=frequency=440:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=660:duration=${seconds}`,
    '-filter_complex', `[0][1]amerge=inputs=2,volume=${gainDb}dB`,
    '-metadata', 'artist=Tester', '-metadata', 'album=Integration', '-metadata', 'title=Tone',
    ...codecArgs, file
  ]);
  return file;
}

const input = (path: string, name: string): BatchFileInput => ({ id: name, path, rootDir: join(dir, 'src'), name });

const settingsWith = (o: Partial<AppSettings['normalization']>, e: Partial<AppSettings['export']> = {}): AppSettings => ({
  ...DEFAULT_SETTINGS,
  concurrency: 2,
  normalization: { ...DEFAULT_SETTINGS.normalization, ...o },
  export: { ...DEFAULT_SETTINGS.export, outputDir: join(dir, 'out'), ...e }
});

describe.skipIf(!available)('FFmpeg pipeline', () => {
  let quietMp3: string;
  let loudFlac: string;
  let wav: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'alp-int-'));
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, 'src'), { recursive: true });
    quietMp3 = await makeTone('quiet.mp3', -6, ['-c:a', 'libmp3lame', '-b:a', '192k']);
    loudFlac = await makeTone('loud.flac', 14, ['-c:a', 'flac', '-sample_fmt', 's16']);
    wav = await makeTone('tone.wav', 0, ['-c:a', 'pcm_s16le']);
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('probes and analyzes a file', async () => {
    const probe = await probeFile(ffprobe, quietMp3);
    expect(probe.codec).toBe('mp3');
    expect(probe.tags.artist).toBe('Tester');
    expect(probe.durationSec).toBeGreaterThan(5.5);
    const a = await analyzeFile(ffmpeg, quietMp3, probe.durationSec);
    expect(a.integratedLufs).not.toBeNull();
    expect(a.integratedLufs as number).toBeLessThan(-14);
    expect(a.samplePeakDb).not.toBeNull();
    expect(a.rmsDb).not.toBeNull();
  });

  it('normalizes a batch to -14 LUFS keeping format, bitrate and tags', async () => {
    const events: BatchEvent[] = [];
    const processor = new BatchProcessor({ emit: (e) => events.push(e), log: silentLog, flushIntervalMs: 20 });
    const report = await processor.run(
      {
        mode: 'normalize',
        files: [input(quietMp3, 'quiet.mp3'), input(loudFlac, 'loud.flac')],
        settings: settingsWith({ mode: 'lufs', lufsTarget: -14, peakProtection: 'limiter' })
      },
      bin
    );

    expect(report.failed).toEqual([]);
    expect(report.processed).toBe(2);
    expect(report.cancelled).toBe(false);
    expect(events.some((e) => e.type === 'progress')).toBe(true);

    const outMp3 = join(dir, 'out', 'quiet.mp3');
    const outFlac = join(dir, 'out', 'loud.flac');
    expect(existsSync(outMp3)).toBe(true);
    expect(existsSync(outFlac)).toBe(true);

    for (const out of [outMp3, outFlac]) {
      const probe = await probeFile(ffprobe, out);
      const a = await analyzeFile(ffmpeg, out, probe.durationSec);
      expect(Math.abs((a.integratedLufs as number) + 14)).toBeLessThan(1);
      expect(probe.tags.artist).toBe('Tester');
      expect(probe.tags.album).toBe('Integration');
    }
    const mp3Probe = await probeFile(ffprobe, outMp3);
    expect(Math.round((mp3Probe.bitRate ?? 0) / 1000)).toBe(192);
    expect((await probeFile(ffprobe, outFlac)).codec).toBe('flac');
  });

  it('normalizes by peak and can convert format', async () => {
    const processor = new BatchProcessor({ emit: () => {}, log: silentLog });
    const report = await processor.run(
      {
        mode: 'normalize',
        files: [input(wav, 'tone.wav')],
        settings: settingsWith({ mode: 'peak', peakTarget: -1 }, { outputFormat: 'flac', fileSuffix: '_peak' })
      },
      bin
    );
    expect(report.processed).toBe(1);
    const out = join(dir, 'out', 'tone_peak.flac');
    const probe = await probeFile(ffprobe, out);
    const a = await analyzeFile(ffmpeg, out, probe.durationSec);
    expect(Math.abs((a.samplePeakDb as number) + 1)).toBeLessThan(0.2);
  });

  it('keeps cover art and supports M4A, AAC and OGG', async () => {
    const png = join(dir, 'src', 'cover.png');
    await runProcess(ffmpeg, ['-hide_banner', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=64x64', '-frames:v', '1', png]);
    const withCover = join(dir, 'src', 'cover.mp3');
    await runProcess(ffmpeg, [
      '-hide_banner', '-y', '-i', quietMp3, '-i', png, '-map', '0:a', '-map', '1:v', '-c:a', 'copy',
      '-c:v', 'png', '-disposition:v', 'attached_pic', '-id3v2_version', '3', withCover
    ]);
    const m4a = await makeTone('tone.m4a', -6, ['-c:a', 'aac', '-b:a', '128k']);
    const aac = await makeTone('tone.aac', -6, ['-c:a', 'aac', '-b:a', '128k']);
    const ogg = await makeTone('tone.ogg', -6, ['-c:a', 'libvorbis', '-b:a', '160k']);

    const processor = new BatchProcessor({ emit: () => {}, log: silentLog });
    const report = await processor.run(
      {
        mode: 'normalize',
        files: [input(withCover, 'cover.mp3'), input(m4a, 'tone.m4a'), input(aac, 'tone.aac'), input(ogg, 'tone.ogg')],
        settings: settingsWith({ lufsTarget: -16 }, { outputDir: join(dir, 'out4') })
      },
      bin
    );
    expect(report.failed).toEqual([]);
    expect(report.processed).toBe(4);
    expect((await probeFile(ffprobe, join(dir, 'out4', 'cover.mp3'))).hasCover).toBe(true);
    const m4aProbe = await probeFile(ffprobe, join(dir, 'out4', 'tone.m4a'));
    expect(m4aProbe.codec).toBe('aac');
    expect(m4aProbe.tags.artist).toBe('Tester');
    expect((await probeFile(ffprobe, join(dir, 'out4', 'tone.ogg'))).tags.album).toBe('Integration');
    expect((await probeFile(ffprobe, join(dir, 'out4', 'tone.aac'))).codec).toBe('aac');
  });

  it('only analyzes in analyze mode', async () => {
    const processor = new BatchProcessor({ emit: () => {}, log: silentLog });
    const report = await processor.run(
      { mode: 'analyze', files: [input(wav, 'tone.wav')], settings: settingsWith({}) },
      bin
    );
    expect(report.analyzed).toBe(1);
    expect(report.processed).toBe(0);
    expect(report.outputDir).toBeNull();
  });

  it('reports unreadable files as errors without stopping the batch', async () => {
    const { writeFile } = await import('node:fs/promises');
    const broken = join(dir, 'src', 'broken.mp3');
    await writeFile(broken, 'not audio');
    const processor = new BatchProcessor({ emit: () => {}, log: silentLog });
    const report = await processor.run(
      {
        mode: 'normalize',
        files: [input(broken, 'broken.mp3'), input(wav, 'tone.wav')],
        settings: settingsWith({}, { outputDir: join(dir, 'out2') })
      },
      bin
    );
    expect(report.failed.map((f) => f.name)).toEqual(['broken.mp3']);
    expect(report.processed).toBe(1);
  });

  it('cancels a running batch and leaves no partial files', async () => {
    const long = await makeTone('long.wav', -20, ['-c:a', 'pcm_s16le'], 240);
    const processor = new BatchProcessor({ emit: () => {}, log: silentLog });
    const promise = processor.run(
      {
        mode: 'normalize',
        files: [input(long, 'long.wav')],
        settings: settingsWith({}, { outputDir: join(dir, 'out3') })
      },
      bin
    );
    setTimeout(() => processor.cancel(), 150);
    const report = await promise;
    expect(report.cancelled).toBe(true);
    expect(report.processed).toBe(0);
    expect(existsSync(join(dir, 'out3', 'long.wav'))).toBe(false);
  });

  it('rejects normalize without an output folder', async () => {
    const processor = new BatchProcessor({ emit: () => {}, log: silentLog });
    await expect(
      processor.run({ mode: 'normalize', files: [], settings: settingsWith({}, { outputDir: '' }) }, bin)
    ).rejects.toThrow(/pasta de saída/);
  });
});
