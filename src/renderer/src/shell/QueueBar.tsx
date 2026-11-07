import { formatElapsed } from '../../../core/format';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { useApp } from '../state/AppContext';

/** Always-visible queue status at the bottom of every module. */
export function QueueBar() {
  const { queue, navigate } = useApp();
  const { snapshot, action } = queue;
  const { counts } = snapshot;
  const active = counts.running + counts.paused;
  const current = snapshot.jobs.find((j) => j.status === 'running' || j.status === 'paused');
  if (snapshot.jobs.length === 0) return null;

  return (
    <footer className="queue-bar">
      <div className="queue-bar-info">
        <strong>{snapshot.paused ? 'Fila pausada' : active ? 'Processando' : 'Fila'}</strong>
        <span className="muted queue-bar-current">{current ? current.title : `${counts.done} concluída(s)${counts.error ? ` · ${counts.error} com erro` : ''}`}</span>
      </div>
      <div className="queue-bar-progress">
        <ProgressBar value={snapshot.overall} />
        <span className="mono">
          {Math.round(snapshot.overall * 100)}% · {active} ativa(s) · {counts.queued} na fila
          {snapshot.speed !== null ? ` · ${snapshot.speed.toFixed(1)}×` : ''}
          {snapshot.etaSec !== null && snapshot.etaSec > 0 ? ` · ~${formatElapsed(snapshot.etaSec * 1000)}` : ''}
        </span>
      </div>
      <div className="toolbar-group">
        {snapshot.paused ? (
          <Button size="sm" variant="primary" icon="play" onClick={() => void action({ type: 'resume' })}>
            Continuar
          </Button>
        ) : (
          <Button size="sm" icon="pause" onClick={() => void action({ type: 'pause' })} disabled={active + counts.queued === 0}>
            Pausar
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="layers" onClick={() => navigate('batch')}>
          Abrir fila
        </Button>
      </div>
    </footer>
  );
}
