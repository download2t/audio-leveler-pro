import type { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { aggregateQueue, etaSeconds, jobProgress, speedOf } from '../../core/queueMath';
import type { HistoryEntry, QueueJob, QueueSnapshot } from '../../shared/media';
import type { FfmpegBinaries } from '../ffmpeg/locator';
import { isCancelled, runProcess, type RunOptions, type RunResult } from '../ffmpeg/runner';
import type { ScopedLogger } from '../logger';
import type { JobPlan } from './jobPlan';

export type StepRunner = (bin: string, args: string[], opts: RunOptions) => Promise<RunResult>;

export interface BatchProcessingOptions {
  binaries: () => FfmpegBinaries;
  concurrency: () => number;
  emit: (snapshot: QueueSnapshot) => void;
  onFinished?: (entry: HistoryEntry) => void;
  log: ScopedLogger;
  run?: StepRunner;
  platform?: NodeJS.Platform;
  flushIntervalMs?: number;
}

interface Entry {
  view: QueueJob;
  plan: JobPlan;
  controller: AbortController | null;
  child: ChildProcess | null;
  stepStartedAt: number;
  pausedAt: number | null;
  pausedMs: number;
  /** Interrupted by a Windows pause: goes back to the queue instead of failing. */
  interrupted: boolean;
}

export type MoveDirection = 'up' | 'down' | 'top' | 'bottom';

const FINAL = new Set(['done', 'error', 'cancelled']);

/**
 * Single processing queue shared by every module. Runs JobPlans with limited
 * concurrency and supports pause/resume, cancel, reorder and retry.
 */
export class BatchProcessingService {
  private readonly entries: Entry[] = [];
  private readonly reserved = new Set<string>();
  private paused = false;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly run: StepRunner;
  private readonly platform: NodeJS.Platform;

  constructor(private readonly opts: BatchProcessingOptions) {
    this.run = opts.run ?? runProcess;
    this.platform = opts.platform ?? process.platform;
  }

  enqueue(plans: readonly JobPlan[]): QueueJob[] {
    const added = plans.map((plan): Entry => ({
      plan,
      controller: null,
      child: null,
      stepStartedAt: 0,
      pausedAt: null,
      pausedMs: 0,
      interrupted: false,
      view: {
        id: randomUUID(),
        module: plan.module,
        title: plan.title,
        inputs: plan.inputs,
        outputs: [],
        status: 'queued',
        progress: 0,
        speed: null,
        etaSec: null,
        stepIndex: 0,
        stepCount: plan.steps.length,
        totalDurationSec: plan.steps.reduce((s, st) => s + st.durationSec, 0),
        createdAt: Date.now(),
        startedAt: null,
        finishedAt: null,
        command: plan.command
      }
    }));
    this.entries.push(...added);
    this.opts.log.info(`${added.length} job(s) adicionados à fila`);
    this.schedule();
    this.changed();
    return added.map((e) => e.view);
  }

  snapshot(): QueueSnapshot {
    const jobs = this.entries.map((e) => ({ ...e.view }));
    return { jobs, paused: this.paused, ...aggregateQueue(jobs) };
  }

  get isPaused(): boolean {
    return this.paused;
  }

  pause(): void {
    if (this.paused) return;
    this.paused = true;
    for (const e of this.entries) {
      if (e.view.status !== 'running') continue;
      if (this.platform === 'win32') {
        // Node cannot suspend a process on Windows: interrupt and requeue it.
        e.interrupted = true;
        e.controller?.abort();
      } else if (e.child) {
        e.child.kill('SIGSTOP');
        e.pausedAt = Date.now();
        e.view.status = 'paused';
      }
    }
    this.opts.log.info('Fila pausada');
    this.changed();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    for (const e of this.entries) {
      if (e.view.status !== 'paused') continue;
      e.child?.kill('SIGCONT');
      if (e.pausedAt) e.pausedMs += Date.now() - e.pausedAt;
      e.pausedAt = null;
      e.view.status = 'running';
    }
    this.opts.log.info('Fila retomada');
    this.schedule();
    this.changed();
  }

  cancel(id: string): void {
    const e = this.find(id);
    if (!e) return;
    if (e.view.status === 'queued') {
      this.finish(e, 'cancelled');
    } else if (e.view.status === 'running' || e.view.status === 'paused') {
      e.interrupted = false;
      e.controller?.abort();
      // A stopped process must be resumed to receive the kill on some platforms.
      if (e.view.status === 'paused') e.child?.kill('SIGCONT');
    }
    this.changed();
  }

  cancelAll(): void {
    for (const e of [...this.entries]) if (!FINAL.has(e.view.status)) this.cancel(e.view.id);
  }

  retry(id: string): void {
    const e = this.find(id);
    if (!e || (e.view.status !== 'error' && e.view.status !== 'cancelled')) return;
    Object.assign(e.view, { status: 'queued', progress: 0, speed: null, etaSec: null, stepIndex: 0, error: undefined, startedAt: null, finishedAt: null, outputs: [] });
    this.schedule();
    this.changed();
  }

  remove(id: string): void {
    const i = this.entries.findIndex((e) => e.view.id === id);
    const e = this.entries[i];
    if (!e || e.view.status === 'running' || e.view.status === 'paused') return;
    this.entries.splice(i, 1);
    this.changed();
  }

  clearFinished(): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (FINAL.has((this.entries[i] as Entry).view.status)) this.entries.splice(i, 1);
    }
    this.changed();
  }

  move(id: string, direction: MoveDirection): void {
    const i = this.entries.findIndex((e) => e.view.id === id);
    const e = this.entries[i];
    if (!e || e.view.status !== 'queued') return;
    const target = direction === 'top' ? 0 : direction === 'bottom' ? this.entries.length - 1 : direction === 'up' ? Math.max(0, i - 1) : Math.min(this.entries.length - 1, i + 1);
    this.entries.splice(i, 1);
    this.entries.splice(target, 0, e);
    this.changed();
  }

  /** Resolves when nothing is queued or running (used by tests and on quit). */
  async idle(): Promise<void> {
    while (this.entries.some((e) => !FINAL.has(e.view.status) && !(this.paused && e.view.status === 'queued'))) {
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  private find(id: string): Entry | undefined {
    return this.entries.find((e) => e.view.id === id);
  }

  private schedule(): void {
    if (this.paused) return;
    const active = this.entries.filter((e) => e.view.status === 'running' || e.view.status === 'paused').length;
    let slots = Math.max(1, this.opts.concurrency()) - active;
    for (const e of this.entries) {
      if (slots <= 0) break;
      if (e.view.status !== 'queued') continue;
      slots--;
      void this.execute(e);
    }
  }

  private async execute(e: Entry): Promise<void> {
    const { plan, view } = e;
    const controller = new AbortController();
    Object.assign(e, { controller, interrupted: false, pausedMs: 0, pausedAt: null });
    Object.assign(view, { status: 'running', startedAt: view.startedAt ?? Date.now(), progress: 0, stepIndex: 0, speed: null, etaSec: null });
    this.changed();
    const durations = plan.steps.map((s) => s.durationSec);
    const { ffmpeg } = this.opts.binaries();

    try {
      await mkdir(plan.workDir, { recursive: true });
      // The segment muxer does not create its output folder.
      if (plan.deliverDir) await mkdir(plan.deliverDir, { recursive: true });
      for (const p of plan.prepare) {
        if (p.kind === 'copy') await copyFile(p.from, join(plan.workDir, p.name));
        else await writeFile(join(plan.workDir, p.name), p.content, 'utf8');
      }
      for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i] as JobPlan['steps'][number];
        view.stepIndex = i;
        e.stepStartedAt = Date.now();
        e.pausedMs = 0;
        await this.run(ffmpeg, step.args, {
          signal: controller.signal,
          cwd: step.inWorkDir ? plan.workDir : undefined,
          onSpawn: (child) => {
            e.child = child;
            // Paused between steps (POSIX): stop the new process right away.
            if (this.paused && this.platform !== 'win32') {
              child.kill('SIGSTOP');
              e.pausedAt = Date.now();
              view.status = 'paused';
            }
          },
          onProgressSeconds: (seconds) => {
            const fraction = step.durationSec > 0 ? seconds / step.durationSec : 0;
            view.progress = jobProgress(durations, i, fraction);
            view.speed = speedOf(seconds, Date.now() - e.stepStartedAt - e.pausedMs);
            const remaining = Math.max(0, step.durationSec - seconds) + durations.slice(i + 1).reduce((a, b) => a + b, 0);
            view.etaSec = etaSeconds(remaining, view.speed);
            this.changed();
          }
        });
      }
      view.outputs = await this.deliver(plan);
      this.finish(e, 'done');
    } catch (err) {
      if (e.interrupted) {
        Object.assign(view, { status: 'queued', progress: 0, speed: null, etaSec: null, stepIndex: 0 });
        this.opts.log.info(`Job interrompido pela pausa e devolvido à fila: ${plan.title}`);
      } else if (isCancelled(err) || controller.signal.aborted) {
        this.finish(e, 'cancelled');
      } else {
        view.error = err instanceof Error ? err.message : String(err);
        this.opts.log.error(`Job falhou: ${plan.title}`, view.error);
        this.finish(e, 'error');
      }
    } finally {
      e.child = null;
      e.controller = null;
      if (FINAL.has(view.status)) await rm(plan.workDir, { recursive: true, force: true }).catch(() => undefined);
      this.changed();
      this.schedule();
    }
  }

  private finish(e: Entry, status: 'done' | 'error' | 'cancelled'): void {
    const view = e.view;
    Object.assign(view, { status, finishedAt: Date.now(), speed: null, etaSec: status === 'done' ? 0 : null });
    if (status === 'done') view.progress = 1;
    if (view.startedAt !== null) {
      this.opts.onFinished?.({
        id: view.id, module: view.module, title: view.title, status,
        startedAt: view.startedAt, finishedAt: view.finishedAt as number,
        inputs: view.inputs, outputs: view.outputs, error: view.error
      });
    }
  }

  private key(p: string): string {
    return this.platform === 'linux' ? p : p.toLowerCase();
  }

  /** Unique destination name: never overwrites existing files or names reserved by other jobs. */
  private allocate(dir: string, name: string): string {
    const ext = extname(name);
    const stem = name.slice(0, name.length - ext.length);
    let candidate = join(dir, name);
    for (let n = 1; existsSync(candidate) || this.reserved.has(this.key(candidate)); n++) candidate = join(dir, `${stem} (${n})${ext}`);
    this.reserved.add(this.key(candidate));
    return candidate;
  }

  private async deliver(plan: JobPlan): Promise<string[]> {
    await mkdir(plan.outputDir, { recursive: true });
    const moves = [...plan.deliver];
    if (plan.deliverDir) {
      const names = (await readdir(plan.deliverDir)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      moves.push(...names.map((name) => ({ from: join(plan.deliverDir as string, name), name })));
    }
    if (moves.length === 0) throw new Error('O FFmpeg não gerou nenhum arquivo de saída.');
    const outputs: string[] = [];
    for (const m of moves) {
      const target = this.allocate(plan.outputDir, m.name);
      try {
        await rename(m.from, target);
        outputs.push(target);
      } finally {
        this.reserved.delete(this.key(target));
      }
    }
    return outputs;
  }

  private changed(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.opts.emit(this.snapshot());
    }, this.opts.flushIntervalMs ?? 150);
  }
}
