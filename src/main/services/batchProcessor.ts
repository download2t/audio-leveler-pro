import { resolveEncoder, targetContainer } from '../../core/ffmpegArgs';
import { computeBatchGains, type GainInput } from '../../core/gain';
import { extensionOf } from '../../core/pathUtils';
import { runPool } from '../../core/pool';
import { sanitizeSettings } from '../../core/settings';
import { average } from '../../core/stats';
import type {
  AppSettings,
  AudioProbe,
  BatchEvent,
  BatchFileInput,
  BatchPhase,
  BatchReport,
  BatchRequest,
  ExportSettings,
  FilePatch,
  GainResult,
  LoudnessAnalysis
} from '../../shared/types';
import type { FfmpegBinaries } from '../ffmpeg/locator';
import { isCancelled } from '../ffmpeg/runner';
import { OutputPathPlanner } from '../lib/outputPaths';
import type { ScopedLogger } from '../logger';
import { analyzeFile, exportFile, probeFile } from './audioTools';

interface FileState {
  input: BatchFileInput;
  probe?: AudioProbe;
  analysis?: LoudnessAnalysis;
  result?: GainResult;
  error?: string;
  skipReason?: string;
  done: boolean;
}

interface ExportTask {
  state: FileState & { probe: AudioProbe; analysis: LoudnessAnalysis };
  gain: GainResult;
  output: string;
}

export interface BatchProcessorOptions {
  emit: (event: BatchEvent) => void;
  log: ScopedLogger;
  /** Patches/progress are coalesced and sent at this interval (keeps IPC cheap for huge batches). */
  flushIntervalMs?: number;
}

/** Error text without the file path (FFmpeg prefixes messages with it; the UI already shows the file). */
function errorMessage(err: unknown, file?: string): string {
  const message = err instanceof Error ? err.message : String(err);
  return file ? message.split(`${file}: `).join('') : message;
}

/** Overwriting in place only makes sense with the same container. */
export function effectiveExportSettings(s: ExportSettings): ExportSettings {
  return s.overwriteOriginals ? { ...s, outputFormat: 'original' } : s;
}

class BatchRun {
  private readonly states: Map<string, FileState>;
  private readonly patches = new Map<string, FilePatch>();
  private readonly partial = new Map<string, number>();
  private readonly startedAt = Date.now();
  private phase: BatchPhase = 'idle';
  private completed = 0;
  private total = 0;
  private dirtyProgress = true;

  constructor(
    private readonly request: BatchRequest,
    private readonly settings: AppSettings,
    private readonly bin: FfmpegBinaries,
    private readonly signal: AbortSignal,
    private readonly opts: BatchProcessorOptions
  ) {
    this.states = new Map(
      request.files.map((f) => [f.id, { input: f, probe: f.probe, analysis: f.analysis, done: false }])
    );
  }

  async execute(): Promise<BatchReport> {
    const { log } = this.opts;
    const timer = setInterval(() => this.flush(), this.opts.flushIntervalMs ?? 150);
    const exportSettings = effectiveExportSettings(this.settings.export);
    log.info(`Início do lote (${this.request.mode})`, {
      files: this.request.files.length,
      mode: this.settings.normalization.mode,
      concurrency: this.settings.concurrency
    });

    try {
      const toAnalyze = [...this.states.values()].filter((s) => !s.probe || !s.analysis);
      this.total = toAnalyze.length + (this.request.mode === 'normalize' ? this.states.size : 0);
      this.phase = 'analyzing';
      await runPool(toAnalyze, this.settings.concurrency, (s) => this.analyze(s), this.signal);

      if (this.request.mode === 'normalize' && !this.signal.aborted) {
        const tasks = this.planExports(exportSettings);
        this.total = toAnalyze.length + tasks.length;
        this.phase = 'exporting';
        this.dirtyProgress = true;
        await runPool(tasks, this.settings.concurrency, (t) => this.export(t, exportSettings), this.signal);
      }
    } finally {
      clearInterval(timer);
      this.phase = 'idle';
      this.dirtyProgress = true;
      this.flush();
    }

    const report = this.buildReport(exportSettings);
    log.info('Fim do lote', {
      cancelled: report.cancelled,
      processed: report.processed,
      failed: report.failed.length,
      skipped: report.skipped.length,
      ms: report.totalTimeMs
    });
    return report;
  }

  private async analyze(state: FileState): Promise<void> {
    const { id, path } = state.input;
    this.patch({ id, status: 'analyzing', progress: 0, error: undefined });
    try {
      const probe = await probeFile(this.bin.ffprobe, path, { signal: this.signal });
      const analysis = await analyzeFile(this.bin.ffmpeg, path, probe.durationSec, {
        signal: this.signal,
        onProgress: (p) => this.progressOf(id, p)
      });
      state.probe = probe;
      state.analysis = analysis;
      this.patch({ id, status: 'analyzed', progress: 1, probe, analysis });
      this.opts.log.debug(`Analisado: ${path}`, analysis);
    } catch (err) {
      if (isCancelled(err)) {
        this.patch({ id, status: 'cancelled', progress: 0 });
      } else {
        state.error = errorMessage(err, path);
        this.patch({ id, status: 'error', progress: 0, error: state.error });
        this.opts.log.error(`Falha na análise: ${path}`, state.error);
      }
    } finally {
      this.unitDone(id);
    }
  }

  private planExports(exportSettings: ExportSettings): ExportTask[] {
    const ready = [...this.states.values()].filter(
      (s): s is ExportTask['state'] => !s.error && s.probe !== undefined && s.analysis !== undefined
    );
    const inputs: GainInput[] = ready.map((s) => ({
      id: s.input.id,
      path: s.input.path,
      durationSec: s.probe.durationSec,
      analysis: s.analysis,
      tags: s.probe.tags
    }));
    const gains = computeBatchGains(inputs, this.settings.normalization);
    const planner = new OutputPathPlanner(exportSettings);
    const tasks: ExportTask[] = [];

    for (const state of ready) {
      const gain = gains.get(state.input.id);
      if (!gain) continue;
      if (gain.skip) {
        state.skipReason = 'Faixa silenciosa ou sem nível mensurável';
        this.patch({ id: state.input.id, status: 'skipped', progress: 0, result: gain, error: state.skipReason });
        continue;
      }
      try {
        const container = targetContainer(extensionOf(state.input.path), exportSettings.outputFormat);
        const spec = resolveEncoder(container, state.probe);
        tasks.push({ state, gain, output: planner.plan(state.input.path, state.input.rootDir, spec.ext) });
      } catch (err) {
        state.error = errorMessage(err);
        this.patch({ id: state.input.id, status: 'error', error: state.error });
      }
    }
    return tasks;
  }

  private async export(task: ExportTask, exportSettings: ExportSettings): Promise<void> {
    const { state, gain, output } = task;
    const { id, path } = state.input;
    this.patch({ id, status: 'processing', progress: 0, error: undefined });
    try {
      const container = targetContainer(extensionOf(path), exportSettings.outputFormat);
      await exportFile(
        this.bin.ffmpeg,
        {
          input: path,
          output,
          probe: state.probe,
          spec: resolveEncoder(container, state.probe),
          gain,
          settings: exportSettings,
          ceilingDb: this.settings.normalization.truePeakCeiling
        },
        { signal: this.signal, onProgress: (p) => this.progressOf(id, p) }
      );
      state.result = gain;
      state.done = true;
      const patch: FilePatch = { id, status: 'done', progress: 1, result: gain, outputPath: output };
      // The original changed: its cached measurements are no longer valid.
      if (exportSettings.overwriteOriginals) Object.assign(patch, { analysis: undefined, probe: undefined });
      this.patch(patch);
      this.opts.log.info(`Exportado: ${output}`, { gainDb: gain.gainDb, limiter: gain.useLimiter });
    } catch (err) {
      if (isCancelled(err)) {
        this.patch({ id, status: 'cancelled', progress: 0 });
      } else {
        state.error = errorMessage(err, path);
        this.patch({ id, status: 'error', progress: 0, error: state.error });
        this.opts.log.error(`Falha na exportação: ${path}`, state.error);
      }
    } finally {
      this.unitDone(id);
    }
  }

  private buildReport(exportSettings: ExportSettings): BatchReport {
    const states = [...this.states.values()];
    const done = states.filter((s) => s.done);
    return {
      mode: this.request.mode,
      cancelled: this.signal.aborted,
      total: states.length,
      analyzed: states.filter((s) => s.analysis && !s.error).length,
      processed: done.length,
      failed: states
        .filter((s) => s.error)
        .map((s) => ({ id: s.input.id, name: s.input.name, error: s.error as string })),
      skipped: states
        .filter((s) => s.skipReason)
        .map((s) => ({ id: s.input.id, name: s.input.name, reason: s.skipReason as string })),
      averageGainDb: average(done.map((s) => (s.result as GainResult).gainDb)),
      totalTimeMs: Date.now() - this.startedAt,
      outputDir:
        this.request.mode === 'normalize'
          ? exportSettings.overwriteOriginals
            ? null
            : exportSettings.outputDir
          : null,
      startedAt: this.startedAt,
      finishedAt: Date.now()
    };
  }

  private patch(p: FilePatch): void {
    const prev = this.patches.get(p.id);
    this.patches.set(p.id, prev ? { ...prev, ...p } : p);
  }

  private progressOf(id: string, fraction: number): void {
    this.partial.set(id, fraction);
    this.patch({ id, progress: fraction });
    this.dirtyProgress = true;
  }

  private unitDone(id: string): void {
    this.partial.delete(id);
    this.completed++;
    this.dirtyProgress = true;
  }

  private flush(): void {
    if (this.patches.size > 0) {
      this.opts.emit({ type: 'files', patches: [...this.patches.values()] });
      this.patches.clear();
    }
    if (this.dirtyProgress) {
      this.dirtyProgress = false;
      let partial = 0;
      for (const v of this.partial.values()) partial += v;
      const overall = this.total === 0 ? 1 : Math.min(1, (this.completed + partial) / this.total);
      this.opts.emit({
        type: 'progress',
        progress: {
          phase: this.phase,
          completed: this.completed,
          total: this.total,
          overall,
          elapsedMs: Date.now() - this.startedAt
        }
      });
    }
  }
}

/** Runs one batch at a time; `cancel()` kills running FFmpeg processes. */
export class BatchProcessor {
  private controller: AbortController | null = null;

  constructor(private readonly opts: BatchProcessorOptions) {}

  get isRunning(): boolean {
    return this.controller !== null;
  }

  async run(request: BatchRequest, binaries: FfmpegBinaries): Promise<BatchReport> {
    if (this.controller) throw new Error('Já existe um processamento em andamento.');
    const settings = sanitizeSettings(request.settings);
    const exportSettings = effectiveExportSettings(settings.export);
    if (request.mode === 'normalize' && !exportSettings.overwriteOriginals && !exportSettings.outputDir.trim()) {
      throw new Error('Selecione uma pasta de saída antes de normalizar.');
    }

    const controller = new AbortController();
    this.controller = controller;
    try {
      return await new BatchRun(request, settings, binaries, controller.signal, this.opts).execute();
    } finally {
      this.controller = null;
    }
  }

  cancel(): boolean {
    if (!this.controller) return false;
    this.opts.log.warn('Cancelamento solicitado pelo usuário');
    this.controller.abort();
    return true;
  }
}
