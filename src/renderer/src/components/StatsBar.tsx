import { formatBytes, formatDuration, formatGain, formatLevel } from '../../../core/format';
import type { BatchStats } from '../../../core/stats';

export function StatsBar({ stats }: { stats: BatchStats }) {
  const range =
    stats.minLufs !== null && stats.maxLufs !== null
      ? `${stats.minLufs.toFixed(1)} … ${stats.maxLufs.toFixed(1)}`
      : '—';
  const items: Array<{ label: string; value: string; tone?: string }> = [
    { label: 'Arquivos', value: String(stats.total) },
    { label: 'Duração total', value: formatDuration(stats.totalDurationSec || null) },
    { label: 'Tamanho', value: formatBytes(stats.totalSizeBytes) },
    { label: 'Analisados', value: `${stats.analyzed}` },
    { label: 'Concluídos', value: `${stats.done}`, tone: stats.done ? 'success' : undefined },
    { label: 'Erros', value: `${stats.errors}`, tone: stats.errors ? 'danger' : undefined },
    { label: 'Loudness médio', value: formatLevel(stats.averageLufs, 'LUFS') },
    { label: 'Faixa (LUFS)', value: range },
    { label: 'Ganho médio', value: formatGain(stats.averageGainDb) }
  ];
  return (
    <div className="stats-bar">
      {items.map((i) => (
        <div key={i.label} className={`stat ${i.tone ? `stat-${i.tone}` : ''}`}>
          <span className="stat-label">{i.label}</span>
          <span className="stat-value">{i.value}</span>
        </div>
      ))}
    </div>
  );
}
