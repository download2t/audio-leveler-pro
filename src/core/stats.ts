import type { BatchReport, FileItem, GainResult } from '../shared/types';

export interface BatchStats {
  total: number;
  analyzed: number;
  done: number;
  errors: number;
  skipped: number;
  totalDurationSec: number;
  totalSizeBytes: number;
  averageLufs: number | null;
  minLufs: number | null;
  maxLufs: number | null;
  averageGainDb: number | null;
}

export function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** `gains` holds the preview gains of analyzed files that are not exported yet. */
export function computeBatchStats(
  items: readonly FileItem[],
  gains?: ReadonlyMap<string, GainResult>
): BatchStats {
  const lufs: number[] = [];
  const gainValues: number[] = [];
  const stats: BatchStats = {
    total: items.length, analyzed: 0, done: 0, errors: 0, skipped: 0,
    totalDurationSec: 0, totalSizeBytes: 0,
    averageLufs: null, minLufs: null, maxLufs: null, averageGainDb: null
  };

  for (const item of items) {
    stats.totalSizeBytes += item.size;
    if (item.probe) stats.totalDurationSec += item.probe.durationSec;
    if (item.analysis) stats.analyzed++;
    if (item.status === 'done') stats.done++;
    if (item.status === 'error') stats.errors++;
    if (item.status === 'skipped') stats.skipped++;
    const l = item.analysis?.integratedLufs;
    if (l !== undefined && l !== null) lufs.push(l);
    const g = item.status === 'done' ? item.result : gains?.get(item.id);
    if (g && !g.skip) gainValues.push(g.gainDb);
  }

  stats.averageLufs = average(lufs);
  stats.minLufs = lufs.length ? Math.min(...lufs) : null;
  stats.maxLufs = lufs.length ? Math.max(...lufs) : null;
  stats.averageGainDb = average(gainValues);
  return stats;
}

const csvCell = (value: unknown): string => {
  const s = value === null || value === undefined ? '' : String(value);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const num = (n: number | null | undefined): string => (n === null || n === undefined ? '' : n.toFixed(2));

/** Semicolon-separated CSV (opens correctly in Excel with pt-BR locale). */
export function itemsToCsv(items: readonly FileItem[]): string {
  const header = [
    'arquivo', 'caminho', 'status', 'lufs_original', 'true_peak_db', 'pico_db', 'rms_db',
    'ganho_db', 'nivel_final', 'unidade', 'limitador', 'saida', 'erro'
  ];
  const rows = items.map((i) => [
    i.name, i.path, i.status,
    num(i.analysis?.integratedLufs), num(i.analysis?.truePeakDb), num(i.analysis?.samplePeakDb),
    num(i.analysis?.rmsDb), num(i.result?.gainDb), num(i.result?.finalLevel), i.result?.unit ?? '',
    i.result?.useLimiter ? 'sim' : '', i.outputPath ?? '', i.error ?? ''
  ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function reportSummaryLines(report: BatchReport): string[] {
  return [
    `Arquivos processados: ${report.processed}`,
    `Arquivos analisados: ${report.analyzed}`,
    `Arquivos com erro: ${report.failed.length}`,
    `Arquivos ignorados: ${report.skipped.length}`,
    `Ganho médio aplicado: ${report.averageGainDb === null ? '-' : `${report.averageGainDb.toFixed(2)} dB`}`,
    `Tempo total: ${(report.totalTimeMs / 1000).toFixed(1)} s`,
    `Pasta de saída: ${report.outputDir ?? '-'}`
  ];
}
