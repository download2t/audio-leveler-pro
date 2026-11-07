import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HistoryEntry, QueueSnapshot } from '../../shared/media';
import { CancelledError, type RunOptions } from '../ffmpeg/runner';
import { BatchProcessingService, type StepRunner } from '../services/BatchProcessingService';
import type { JobPlan } from '../services/jobPlan';

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'alp-queue-'));
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

/** Fake ffmpeg: writes the output path (last arg), reports progress and honours abort. */
function fakeRunner(opts: { ms?: number; fail?: (args: string[]) => boolean; started?: string[] } = {}): StepRunner {
  return (_bin, args, run: RunOptions) =>
    new Promise((resolve, reject) => {
      opts.started?.push(args[0] as string);
      if (opts.fail?.(args)) {
        reject(new Error('falhou de propósito'));
        return;
      }
      let t = 0;
      const timer = setInterval(() => {
        t += 1;
        run.onProgressSeconds?.(t);
      }, 5);
      const done = setTimeout(async () => {
        clearInterval(timer);
        await writeFile(args[args.length - 1] as string, 'x');
        resolve({ stdout: '', stderr: '' });
      }, opts.ms ?? 30);
      run.signal?.addEventListener('abort', () => {
        clearInterval(timer);
        clearTimeout(done);
        reject(new CancelledError());
      });
    });
}

let n = 0;
function plan(name: string, outputDir = join(dir, 'out')): JobPlan {
  const workDir = join(outputDir, `.work-${n++}`);
  return {
    module: 'audio-convert', title: name, inputs: [name], outputDir, workDir, prepare: [{ kind: 'write', name: 'note.txt', content: 'hi' }],
    steps: [{ args: [name, join(workDir, 'o.mp3')], durationSec: 10, label: 'x' }],
    deliver: [{ from: join(workDir, 'o.mp3'), name: `${name}.mp3` }], command: `ffmpeg ${name}`
  };
}

function service(run: StepRunner, extra: { concurrency?: number; platform?: NodeJS.Platform; history?: HistoryEntry[]; snaps?: QueueSnapshot[] } = {}) {
  return new BatchProcessingService({
    binaries: () => ({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }),
    concurrency: () => extra.concurrency ?? 2,
    log: silentLog,
    run,
    platform: extra.platform ?? 'linux',
    flushIntervalMs: 5,
    emit: (s) => extra.snaps?.push(s),
    onFinished: (e) => extra.history?.push(e)
  });
}

describe('BatchProcessingService', () => {
  it('runs jobs, delivers unique names and records history', async () => {
    const history: HistoryEntry[] = [];
    const snaps: QueueSnapshot[] = [];
    const q = service(fakeRunner(), { history, snaps });
    q.enqueue([plan('a'), plan('a'), plan('b')]);
    await q.idle();
    const s = q.snapshot();
    expect(s.counts.done).toBe(3);
    expect(s.overall).toBe(1);
    expect((await readdir(join(dir, 'out'))).sort()).toEqual(['a (1).mp3', 'a.mp3', 'b.mp3']);
    expect(history.map((h) => h.status)).toEqual(['done', 'done', 'done']);
    expect(snaps.length).toBeGreaterThan(0);
  });

  it('respects the concurrency limit and queue order', async () => {
    const started: string[] = [];
    const q = service(fakeRunner({ started }), { concurrency: 1 });
    const jobs = q.enqueue([plan('c1'), plan('c2'), plan('c3')]);
    q.move(jobs[2]?.id as string, 'up');
    await q.idle();
    expect(started).toEqual(['c1', 'c3', 'c2']);
  });

  it('cancels queued and running jobs and cleans their work dirs', async () => {
    const q = service(fakeRunner({ ms: 400 }), { concurrency: 1 });
    const outputDir = join(dir, 'cancel');
    const [first, second] = q.enqueue([plan('x', outputDir), plan('y', outputDir)]);
    q.cancel(second?.id as string);
    await new Promise((r) => setTimeout(r, 50));
    q.cancel(first?.id as string);
    await q.idle();
    expect(q.snapshot().counts.cancelled).toBe(2);
    expect(await readdir(outputDir)).toEqual([]);
  });

  it('marks failures, keeps going and retries', async () => {
    let failing = true;
    const q = service(fakeRunner({ fail: (args) => failing && args[0] === 'bad' }));
    const [bad] = q.enqueue([plan('bad'), plan('good')]);
    await q.idle();
    expect(q.snapshot().jobs.find((j) => j.id === bad?.id)?.error).toBe('falhou de propósito');
    expect(q.snapshot().counts.done).toBe(1);
    failing = false;
    q.retry(bad?.id as string);
    await q.idle();
    expect(q.snapshot().counts.done).toBe(2);
    q.clearFinished();
    expect(q.snapshot().jobs).toHaveLength(0);
  });

  it('pauses on Windows by requeueing running jobs and resumes later', async () => {
    const started: string[] = [];
    const q = service(fakeRunner({ ms: 200, started }), { platform: 'win32', concurrency: 1 });
    q.enqueue([plan('p1'), plan('p2')]);
    await new Promise((r) => setTimeout(r, 40));
    q.pause();
    await new Promise((r) => setTimeout(r, 40));
    const paused = q.snapshot();
    expect(paused.paused).toBe(true);
    expect(paused.counts.queued).toBe(2);
    expect(paused.counts.running).toBe(0);
    q.resume();
    await q.idle();
    expect(q.snapshot().counts.done).toBe(2);
    expect(started).toEqual(['p1', 'p1', 'p2']);
  });
});
