import type { HistoryEntry } from '../../shared/media';
import type { BatchReport, BatchRequest } from '../../shared/types';
import type { FfmpegBinaries } from '../ffmpeg/locator';
import { BatchProcessor, type BatchProcessorOptions } from './batchProcessor';

/** Loudness normalization module (two-phase analyze → gain → export flow), recorded in the history. */
export class NormalizerService {
  private readonly processor: BatchProcessor;

  constructor(
    opts: BatchProcessorOptions,
    private readonly onFinished?: (entry: HistoryEntry) => void
  ) {
    this.processor = new BatchProcessor(opts);
  }

  get isRunning(): boolean {
    return this.processor.isRunning;
  }

  async run(request: BatchRequest, binaries: FfmpegBinaries): Promise<BatchReport> {
    const report = await this.processor.run(request, binaries);
    const status = report.cancelled ? 'cancelled' : report.failed.length > 0 && report.processed === 0 && report.analyzed === 0 ? 'error' : 'done';
    this.onFinished?.({
      id: `normalizer-${report.startedAt}`,
      module: 'normalizer',
      title: `${request.mode === 'normalize' ? 'Normalização' : 'Análise'} de ${report.total} arquivo(s)`,
      status,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      inputs: request.files.map((f) => f.path),
      outputs: report.outputDir ? [report.outputDir] : [],
      error: report.failed.length ? `${report.failed.length} arquivo(s) com erro` : undefined
    });
    return report;
  }

  cancel(): boolean {
    return this.processor.cancel();
  }
}
