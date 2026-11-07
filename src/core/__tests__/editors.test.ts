import { describe, expect, it } from 'vitest';
import type { LoopOptions } from '../../shared/media';
import { atempoChain, buildAudioEdit, segmentArgs } from '../commands/audioEdit';
import { buildLoopSteps, planLoop } from '../commands/loop';
import { buildVideoEdit } from '../commands/videoEdit';
import { aggregateQueue, etaSeconds, jobProgress, speedOf } from '../queueMath';
import { formatTime, parseTime } from '../time';
import { argAfter, audioInfo, ctxOf, videoInfo } from './mediaFixtures';

const loop = (o: Partial<LoopOptions>): LoopOptions => ({ mode: 'duration', times: 2, targetSec: 600, transition: 'cut', transitionSec: 1, ...o });
const original = { format: 'original' as const };

describe('planLoop', () => {
  it('extends a 30 s clip to 10 minutes', () => {
    expect(planLoop(30, loop({}))).toEqual({ repeats: 20, unitSec: 30, totalSec: 600, trimTo: 600 });
    expect(planLoop(28, loop({})).repeats).toBe(22);
    expect(planLoop(28, loop({ transition: 'none' }))).toMatchObject({ repeats: 22, totalSec: 616, trimTo: null });
  });

  it('repeats N times and accounts for crossfade overlap', () => {
    expect(planLoop(10, loop({ mode: 'times', times: 3 }))).toMatchObject({ repeats: 3, totalSec: 30 });
    const xf = planLoop(30, loop({ transition: 'crossfade', transitionSec: 2 }));
    expect(xf.unitSec).toBeCloseTo(28.1);
    expect(xf.repeats).toBe(22);
  });

  it('validates transitions', () => {
    expect(() => planLoop(3, loop({ transition: 'crossfade', transitionSec: 2 }))).toThrow(/metade/);
    expect(() => planLoop(10, loop({ transition: 'crossfade', transitionSec: 0 }))).toThrow(/crossfade/);
    expect(() => planLoop(10, loop({ targetSec: 0 }))).toThrow(/duração/);
  });

  it('uses one stream-copy pass for plain repetition', () => {
    const r = buildLoopSteps(videoInfo(), loop({}), 'W', { videoArgs: ['-c:v', 'libx264'], audioArgs: ['-c:a', 'aac'], muxer: 'mp4', ext: 'mp4', copyOk: true });
    expect(r.steps).toHaveLength(1);
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-stream_loop')).toBe('19');
    expect(argAfter(args, '-t')).toBe('600');
    expect(argAfter(args, '-c')).toBe('copy');
  });

  it('renders a seamless unit and repeats it for crossfade', () => {
    const r = buildLoopSteps(videoInfo(), loop({ transition: 'crossfade', transitionSec: 2 }), 'W', { videoArgs: ['-c:v', 'libx264'], audioArgs: ['-c:a', 'aac'], muxer: 'mp4', ext: 'mp4', copyOk: true });
    expect(r.steps).toHaveLength(2);
    const graph = argAfter(r.steps[0]?.args ?? [], '-filter_complex') ?? '';
    expect(graph).toContain('xfade=transition=fade');
    expect(graph).toContain('acrossfade');
    expect(r.steps[1]?.args).toContain('W/unit.mp4');
  });

  it('applies per-loop fades for audio-only input', () => {
    const r = buildLoopSteps(audioInfo({ durationSec: 20 }), loop({ transition: 'fade', transitionSec: 1 }), 'W', { videoArgs: null, audioArgs: ['-c:a', 'libmp3lame'], muxer: 'mp3', ext: 'mp3', copyOk: true });
    expect(argAfter(r.steps[0]?.args ?? [], '-af')).toBe('afade=t=in:st=0:d=1,afade=t=out:st=19:d=1');
    expect(r.steps[0]?.args).toContain('-vn');
  });
});

describe('audio editor', () => {
  it('trims with input seeking', () => {
    const r = buildAudioEdit(ctxOf(audioInfo()), { tool: 'trim', startSec: 10, endSec: 70 }, original);
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-ss')).toBe('10');
    expect(argAfter(args, '-t')).toBe('60');
    expect(r.outputs[0]?.name).toBe('song_cortado.mp3');
    expect(() => buildAudioEdit(ctxOf(audioInfo()), { tool: 'trim', startSec: 50, endSec: 10 }, original)).toThrow();
  });

  it('builds filters for fades, volume, speed and silence', () => {
    const af = (op: Parameters<typeof buildAudioEdit>[1]) => argAfter(buildAudioEdit(ctxOf(audioInfo()), op, original).steps[0]?.args ?? [], '-af');
    expect(af({ tool: 'fade-out', durationSec: 5 })).toBe('afade=t=out:st=195:d=5');
    expect(af({ tool: 'volume', gainDb: -3 })).toBe('volume=-3.00dB');
    expect(af({ tool: 'speed', factor: 1.5, keepPitch: true })).toBe('atempo=1.5');
    expect(af({ tool: 'speed', factor: 2, keepPitch: false })).toBe('asetrate=88200,aresample=44100');
    expect(af({ tool: 'remove-silence', thresholdDb: -50, minSilenceSec: 1 })).toContain('silenceremove=');
    expect(atempoChain(4)).toBe('atempo=2,atempo=2');
    expect(atempoChain(0.25)).toBe('atempo=0.5,atempo=0.5');
  });

  it('converts to mono and changes format on request', () => {
    const r = buildAudioEdit(ctxOf(audioInfo()), { tool: 'channels', channels: 1 }, { format: 'flac' });
    expect(argAfter(r.steps[0]?.args ?? [], '-ac')).toBe('1');
    expect(r.outputs[0]?.name).toBe('song_mono.flac');
  });

  it('joins with concat or crossfade', () => {
    const files = [audioInfo(), audioInfo({ path: 'C:/m/b.wav', durationSec: 100 }), audioInfo({ path: 'C:/m/c.mp3', durationSec: 50 })];
    const concat = buildAudioEdit(ctxOf(...files), { tool: 'join', crossfadeSec: 0 }, original);
    expect(argAfter(concat.steps[0]?.args ?? [], '-filter_complex')).toContain('concat=n=3:v=0:a=1');
    expect(concat.steps[0]?.durationSec).toBe(350);
    const xf = buildAudioEdit(ctxOf(...files), { tool: 'join', crossfadeSec: 2 }, original);
    expect(argAfter(xf.steps[0]?.args ?? [], '-filter_complex')).toContain('[x1][a2]acrossfade=d=2[out]');
    expect(() => buildAudioEdit(ctxOf(audioInfo()), { tool: 'join', crossfadeSec: 0 }, original)).toThrow(/2 arquivos/);
  });

  it('splits with the segment muxer', () => {
    const r = buildAudioEdit(ctxOf(audioInfo()), { tool: 'split', split: { mode: 'parts', parts: 4 } }, original);
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-segment_time')).toBe('50');
    expect(argAfter(args, '-c:a')).toBe('copy');
    expect(r.outputDir).toBe('W:/work/parts');
    expect(segmentArgs({ mode: 'points', points: [90, 30, 300] }, 200)).toEqual(['-segment_times', '30,90']);
  });
});

describe('video editor', () => {
  const v = videoInfo();

  it('trims fast by stream copy or precisely by re-encoding', () => {
    const fast = buildVideoEdit(ctxOf(v), { tool: 'trim', startSec: 5, endSec: 15, precise: false }, original);
    expect(argAfter(fast.steps[0]?.args ?? [], '-c')).toBe('copy');
    const precise = buildVideoEdit(ctxOf(v), { tool: 'trim', startSec: 5, endSec: 15, precise: true }, original);
    expect(argAfter(precise.steps[0]?.args ?? [], '-c:v')).toBe('libx264');
    const converted = buildVideoEdit(ctxOf(v), { tool: 'trim', startSec: 5, endSec: 15, precise: false }, { format: 'mkv' });
    expect(converted.warnings).toHaveLength(1);
  });

  it('removes ranges with select filters', () => {
    const r = buildVideoEdit(ctxOf(v), { tool: 'remove', ranges: [{ startSec: 20, endSec: 25 }, { startSec: 2, endSec: 4 }] }, original);
    const args = r.steps[0]?.args ?? [];
    expect(argAfter(args, '-vf')).toBe("select='not(between(t,2,4)+between(t,20,25))',setpts=N/FRAME_RATE/TB");
    expect(argAfter(args, '-af')).toContain('aselect=');
    expect(r.steps[0]?.durationSec).toBe(23);
  });

  it('rotates, flips and resizes', () => {
    const vf = (op: Parameters<typeof buildVideoEdit>[1]) => argAfter(buildVideoEdit(ctxOf(v), op, original).steps[0]?.args ?? [], '-vf');
    expect(vf({ tool: 'rotate', angle: 90 })).toBe('transpose=1');
    expect(vf({ tool: 'rotate', angle: 180 })).toBe('hflip,vflip');
    expect(vf({ tool: 'flip', direction: 'vertical' })).toBe('vflip');
    expect(vf({ tool: 'resize', width: 1280, height: 720, fit: 'crop' })).toContain('crop=1280:720');
  });

  it('extracts audio and builds GIFs', () => {
    const audio = buildVideoEdit(ctxOf(v), { tool: 'extract-audio', format: 'mp3' }, original);
    expect(audio.outputs[0]?.name).toBe('clip.mp3');
    expect(audio.steps[0]?.args).toContain('-vn');
    const gif = buildVideoEdit(ctxOf(v), { tool: 'gif', startSec: 1, durationSec: 3, fps: 12, width: 480 }, original);
    expect(argAfter(gif.steps[0]?.args ?? [], '-filter_complex')).toContain('palettegen');
    expect(gif.outputs[0]?.name).toBe('clip.gif');
  });

  it('uses relative files inside the work dir for subtitles and text', () => {
    const burn = buildVideoEdit(ctxOf(v), { tool: 'subtitle', subtitlePath: 'C:/s/legenda pt.srt', mode: 'burn' }, original);
    expect(argAfter(burn.steps[0]?.args ?? [], '-vf')).toBe('subtitles=sub.srt');
    expect(burn.steps[0]?.inWorkDir).toBe(true);
    expect(burn.prepare).toEqual([{ kind: 'copy', from: 'C:/s/legenda pt.srt', name: 'sub.srt' }]);
    const soft = buildVideoEdit(ctxOf(v), { tool: 'subtitle', subtitlePath: 'a.srt', mode: 'soft' }, original);
    expect(argAfter(soft.steps[0]?.args ?? [], '-c:s')).toBe('mov_text');
    expect(() => buildVideoEdit(ctxOf(v), { tool: 'subtitle', subtitlePath: 'a.srt', mode: 'soft' }, { format: 'avi' })).toThrow(/MP4, MKV/);
    const text = buildVideoEdit(ctxOf(v), { tool: 'watermark', kind: 'text', text: "Olá: 'mundo'", imagePath: '', position: 'bottom-right', opacity: 0.8, sizePct: 5 }, original);
    expect(argAfter(text.steps[0]?.args ?? [], '-vf')).toContain('textfile=wm.txt:fontsize=54');
    expect(text.prepare[0]).toEqual({ kind: 'write', name: 'wm.txt', content: "Olá: 'mundo'" });
  });

  it('joins videos normalizing size and filling missing audio', () => {
    const r = buildVideoEdit(ctxOf(v, videoInfo({ path: 'b.mov', audio: null, durationSec: 10 })), { tool: 'join' }, original);
    const graph = argAfter(r.steps[0]?.args ?? [], '-filter_complex') ?? '';
    expect(graph).toContain('anullsrc=r=48000:cl=stereo,atrim=duration=10[a1]');
    expect(graph).toContain('concat=n=2:v=1:a=1[v][a]');
    expect(r.steps[0]?.durationSec).toBe(40);
  });

  it('splits precisely by forcing keyframes', () => {
    const r = buildVideoEdit(ctxOf(v), { tool: 'split', precise: true, split: { mode: 'segments', segmentSec: 10 } }, original);
    expect(argAfter(r.steps[0]?.args ?? [], '-force_key_frames')).toBe('expr:gte(t,n_forced*10)');
  });
});

describe('time and queue math', () => {
  it('parses and formats times', () => {
    expect(parseTime('90')).toBe(90);
    expect(parseTime('1:30')).toBe(90);
    expect(parseTime('01:02:03,5')).toBe(3723.5);
    expect(parseTime('abc')).toBeNull();
    expect(parseTime('1:2:3:4')).toBeNull();
    expect(formatTime(83.5)).toBe('1:23.5');
    expect(formatTime(3725)).toBe('1:02:05');
  });

  it('computes weighted progress, speed and ETA', () => {
    expect(jobProgress([10, 30], 0, 0.5)).toBeCloseTo(0.125);
    expect(jobProgress([10, 30], 1, 0.5)).toBeCloseTo(0.625);
    expect(speedOf(30, 10_000)).toBe(3);
    expect(speedOf(30, 100)).toBeNull();
    expect(etaSeconds(60, 2)).toBe(30);
    expect(etaSeconds(60, null)).toBeNull();
  });

  it('aggregates the queue', () => {
    const job = (status: 'queued' | 'running' | 'done' | 'cancelled', progress: number, speed: number | null = null) => ({
      id: status, module: 'audio-convert' as const, title: '', inputs: [], outputs: [], status, progress, speed, etaSec: null,
      stepIndex: 0, stepCount: 1, totalDurationSec: 100, createdAt: 0, startedAt: null, finishedAt: null, command: ''
    });
    const a = aggregateQueue([job('done', 1), job('running', 0.5, 4), job('queued', 0), job('cancelled', 0)]);
    expect(a.overall).toBeCloseTo(0.5);
    expect(a.speed).toBe(4);
    expect(a.etaSec).toBeCloseTo(37.5);
    expect(a.counts.cancelled).toBe(1);
  });
});
