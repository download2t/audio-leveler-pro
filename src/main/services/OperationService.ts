import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { formatCommand, type BuildContext, type BuildResult } from '../../core/commands/common';
import type { MediaInfo, OperationPreview, OperationRequest } from '../../shared/media';
import type { MediaProbe } from '../media/probe';
import type { BatchProcessingService } from './BatchProcessingService';
import type { JobPlan } from './jobPlan';

export interface OperationDeps {
  probe: MediaProbe;
  queue: BatchProcessingService;
  cpuCount: number;
  fontPath: () => string | undefined;
}

/**
 * Base of the module services: turns a request into JobPlans (one per input group)
 * using a pure builder from core/commands, and exposes preview + enqueue.
 */
export abstract class OperationService<R extends OperationRequest> {
  constructor(protected readonly deps: OperationDeps) {}

  /** Input files of each job (1 file per job, or all files for N:1 operations). */
  protected groups(req: R): string[][] {
    return req.files.map((f) => [f]);
  }

  protected abstract build(ctx: BuildContext, req: R): BuildResult;
  protected abstract title(req: R, inputs: MediaInfo[]): string;

  async preview(req: R): Promise<OperationPreview> {
    this.validate(req);
    const groups = this.groups(req);
    const warnings = new Set<string>();
    let estimatedBytes: number | null = 0;
    let estimatedSeconds: number | null = 0;
    let inputBytes = 0;
    let command = '';
    let stepCount = 0;

    for (const [index, group] of groups.entries()) {
      const inputs = await Promise.all(group.map((f) => this.deps.probe.probe(f)));
      inputBytes += inputs.reduce((s, m) => s + m.sizeBytes, 0);
      const workDir = join(req.outputDir, '.alp-work');
      const built = this.build(this.context(inputs, workDir), req);
      built.warnings.forEach((w) => warnings.add(w));
      estimatedBytes = estimatedBytes === null || built.estimatedBytes === null ? null : estimatedBytes + built.estimatedBytes;
      estimatedSeconds = estimatedSeconds === null || built.estimatedSeconds === null ? null : estimatedSeconds + built.estimatedSeconds;
      if (index === 0) {
        command = this.displayCommand(built, workDir, req.outputDir);
        stepCount = built.steps.length;
      }
    }
    return { jobs: groups.length, command, stepCount, inputBytes, estimatedBytes, estimatedSeconds, warnings: [...warnings] };
  }

  async enqueue(req: R): Promise<number> {
    this.validate(req);
    const plans: JobPlan[] = [];
    for (const group of this.groups(req)) {
      const inputs = await Promise.all(group.map((f) => this.deps.probe.probe(f)));
      const workDir = join(req.outputDir, `.alp-work-${randomBytes(5).toString('hex')}`);
      const built = this.build(this.context(inputs, workDir), req);
      plans.push({
        module: req.module,
        title: this.title(req, inputs),
        inputs: group,
        outputDir: req.outputDir,
        workDir,
        prepare: built.prepare,
        steps: built.steps,
        deliver: built.outputs.map((o) => ({ from: o.path, name: o.name })),
        deliverDir: built.outputDir,
        command: built.steps.map((s) => formatCommand(s.args)).join('\n')
      });
    }
    this.deps.queue.enqueue(plans);
    return plans.length;
  }

  protected validate(req: R): void {
    if (req.files.length === 0) throw new Error('Adicione pelo menos um arquivo.');
    if (!req.outputDir.trim()) throw new Error('Escolha uma pasta de saída.');
  }

  private context(inputs: MediaInfo[], workDir: string): BuildContext {
    return { inputs, workDir: workDir.replace(/\\/g, '/'), cpuCount: this.deps.cpuCount, fontPath: this.deps.fontPath() };
  }

  /** First step's command with work-dir outputs replaced by their final location. */
  private displayCommand(built: BuildResult, workDir: string, outputDir: string): string {
    const wd = workDir.replace(/\\/g, '/');
    const first = built.steps[0];
    if (!first) return '';
    const args = first.args.map((a) => {
      const out = built.outputs.find((o) => o.path === a);
      if (out) return join(outputDir, out.name);
      return a.startsWith(`${wd}/`) ? join(outputDir, a.slice(wd.length + 1).replace(/^parts\//, '')) : a;
    });
    return formatCommand(args);
  }
}
