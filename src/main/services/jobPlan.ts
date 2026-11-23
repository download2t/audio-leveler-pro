import type { PrepareAction } from '../../core/commands/common';
import type { OperationModule } from '../../shared/media';

export interface JobStepPlan {
  args: string[];
  durationSec: number;
  label: string;
  inWorkDir?: boolean;
  /** In-process step (e.g. sharp for photos) run instead of FFmpeg; `args` is then ignored. */
  run?: (ctx: { workDir: string; signal: AbortSignal }) => Promise<void>;
}

/** Everything the queue needs to run one job; produced by the operation services. */
export interface JobPlan {
  module: OperationModule;
  title: string;
  inputs: string[];
  outputDir: string;
  /** Private folder (inside outputDir, same volume) created when the job starts. */
  workDir: string;
  prepare: PrepareAction[];
  steps: JobStepPlan[];
  /** Files in workDir delivered to outputDir under these names (made unique). */
  deliver: Array<{ from: string; name: string }>;
  /** Folder in workDir whose files are all delivered (split). */
  deliverDir?: string;
  command: string;
}
