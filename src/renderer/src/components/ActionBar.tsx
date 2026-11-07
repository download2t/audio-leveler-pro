import { formatElapsed } from '../../../core/format';
import type { BatchProgress } from '../../../shared/types';
import { PHASE_LABELS } from '../lib/labels';
import { Button } from './ui/Button';
import { ProgressBar } from './ui/ProgressBar';

export function ActionBar({
  running,
  progress,
  targetCount,
  selectionActive,
  canAnalyze,
  canNormalize,
  onAnalyze,
  onNormalize,
  onCancel
}: {
  running: boolean;
  progress: BatchProgress | null;
  targetCount: number;
  selectionActive: boolean;
  canAnalyze: boolean;
  canNormalize: boolean;
  onAnalyze: () => void;
  onNormalize: () => void;
  onCancel: () => void;
}) {
  const scope = selectionActive ? `seleção (${targetCount})` : `${targetCount} arquivo${targetCount === 1 ? '' : 's'}`;
  const eta =
    progress && progress.overall > 0.02 && progress.overall < 1
      ? formatElapsed((progress.elapsedMs / progress.overall) * (1 - progress.overall))
      : null;

  return (
    <footer className="action-bar">
      <div className="action-progress">
        {running && progress ? (
          <>
            <div className="action-progress-text">
              <strong>{PHASE_LABELS[progress.phase]}</strong>
              <span>
                {progress.completed} / {progress.total} · {Math.round(progress.overall * 100)}%
              </span>
              <span className="muted">
                {formatElapsed(progress.elapsedMs)}
                {eta ? ` · restante ~${eta}` : ''}
              </span>
            </div>
            <ProgressBar value={progress.overall} />
          </>
        ) : (
          <span className="muted">
            {targetCount === 0
              ? 'Adicione arquivos para começar.'
              : `Pronto para processar ${scope}. Os originais não são alterados.`}
          </span>
        )}
      </div>
      <div className="action-buttons">
        {running ? (
          <Button variant="danger" icon="stop" size="lg" onClick={onCancel}>
            Cancelar
          </Button>
        ) : (
          <>
            <Button icon="chart" size="lg" onClick={onAnalyze} disabled={!canAnalyze}>
              Analisar
            </Button>
            <Button variant="primary" icon="play" size="lg" onClick={onNormalize} disabled={!canNormalize}>
              Normalizar {scope}
            </Button>
          </>
        )}
      </div>
    </footer>
  );
}
