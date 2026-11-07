import { useEffect, useMemo, useState } from 'react';
import { formatElapsed } from '../../../../core/format';
import type { HistoryEntry, JobStatus, OperationRequest, QueueJob } from '../../../../shared/media';
import { CommandPreview } from '../../components/media/CommandPreview';
import { OutputDirField } from '../../components/media/Fields';
import { MediaFileList } from '../../components/media/MediaFileList';
import { Button } from '../../components/ui/Button';
import { Field, Section } from '../../components/ui/Field';
import { Segmented } from '../../components/ui/Inputs';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useOperation } from '../../hooks/useOperation';
import { ModuleHeader, SplitModule, useModuleFiles } from '../../shell/ModuleLayout';
import { useApp } from '../../state/AppContext';

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Na fila', running: 'Processando', paused: 'Pausado', done: 'Concluído', error: 'Erro', cancelled: 'Cancelado'
};
export const MODULE_LABELS: Record<HistoryEntry['module'], string> = {
  'audio-convert': 'Conversor de Áudio', 'video-convert': 'Conversor de Vídeo', 'audio-edit': 'Editor de Áudio',
  'video-edit': 'Editor de Vídeo', normalizer: 'Normalizador'
};

const speedText = (s: number | null): string => (s === null ? '—' : `${s >= 10 ? Math.round(s) : s.toFixed(1)}×`);
const etaText = (s: number | null): string => (s === null ? '—' : formatElapsed(s * 1000));

type Tab = 'queue' | 'history' | 'preset';

export function BatchModule({ active }: { active: boolean }) {
  const [tab, setTab] = useState<Tab>('queue');
  const { queue } = useApp();
  const pending = queue.snapshot.counts.queued + queue.snapshot.counts.running + queue.snapshot.counts.paused;

  return (
    <div className="module">
      <ModuleHeader
        icon="layers"
        title="Ferramentas em Lote"
        subtitle="Fila de processamento, histórico de execuções e presets aplicados a centenas de arquivos"
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'queue', label: `Fila${pending ? ` (${pending})` : ''}` },
              { value: 'history', label: 'Histórico' },
              { value: 'preset', label: 'Lote com preset' }
            ]}
          />
        }
      />
      {tab === 'queue' && <QueueView />}
      {tab === 'history' && <HistoryView />}
      <div style={{ display: tab === 'preset' ? 'contents' : 'none' }}>
        <PresetBatchView active={active && tab === 'preset'} />
      </div>
    </div>
  );
}

function QueueView() {
  const { queue } = useApp();
  const { snapshot, action } = queue;
  const { counts } = snapshot;
  const finished = counts.done + counts.error + counts.cancelled;

  return (
    <div className="module-body">
      <div className="queue-summary">
        <div className="queue-summary-progress">
          <div className="action-progress-text">
            <strong>{snapshot.paused ? 'Fila pausada' : counts.running ? 'Processando' : snapshot.jobs.length ? 'Fila ociosa' : 'Fila vazia'}</strong>
            <span>{Math.round(snapshot.overall * 100)}%</span>
            <span className="muted">Velocidade {speedText(snapshot.speed)} · Restante {etaText(snapshot.etaSec)}</span>
          </div>
          <ProgressBar value={snapshot.overall} />
          <div className="queue-counts">
            <span>{counts.running + counts.paused} em execução</span>
            <span>{counts.queued} na fila</span>
            <span className="ok">{counts.done} concluídos</span>
            <span className="bad">{counts.error} com erro</span>
            <span>{counts.cancelled} cancelados</span>
          </div>
        </div>
        <div className="toolbar-group">
          {snapshot.paused ? (
            <Button variant="primary" icon="play" onClick={() => void action({ type: 'resume' })}>
              Continuar
            </Button>
          ) : (
            <Button icon="pause" onClick={() => void action({ type: 'pause' })} disabled={snapshot.jobs.length === 0}>
              Pausar
            </Button>
          )}
          <Button variant="danger" icon="stop" onClick={() => void action({ type: 'cancelAll' })} disabled={counts.queued + counts.running + counts.paused === 0}>
            Cancelar tudo
          </Button>
          <Button variant="ghost" onClick={() => void action({ type: 'clearFinished' })} disabled={finished === 0}>
            Limpar concluídos
          </Button>
        </div>
      </div>
      {snapshot.paused && window.navigator.userAgent.includes('Windows') && counts.queued > 0 && (
        <div className="notice notice-warn">No Windows, tarefas pausadas no meio são reiniciadas do começo ao continuar.</div>
      )}
      <div className="job-list">
        {snapshot.jobs.length === 0 ? (
          <div className="empty-filter">Nenhuma tarefa. Use os conversores e editores e clique em “Adicionar à fila”.</div>
        ) : (
          snapshot.jobs.map((job, i) => <JobRow key={job.id} job={job} index={i} total={snapshot.jobs.length} />)
        )}
      </div>
    </div>
  );
}

function JobRow({ job, index, total }: { job: QueueJob; index: number; total: number }) {
  const { queue } = useApp();
  const [open, setOpen] = useState(false);
  const act = queue.action;
  const busy = job.status === 'running' || job.status === 'paused';
  return (
    <div className={`job-row job-${job.status}`}>
      <span className="job-index">{index + 1}</span>
      <div className="job-main">
        <div className="job-title">
          <span className="file-name" title={job.inputs.join('\n')}>{job.title}</span>
          <span className="chip">{MODULE_LABELS[job.module]}</span>
          {job.stepCount > 1 && busy && <span className="chip">passo {job.stepIndex + 1}/{job.stepCount}</span>}
        </div>
        {busy || job.status === 'queued' ? (
          <div className="job-progress">
            <ProgressBar value={job.progress} size="xs" />
            <span className="mono">{Math.round(job.progress * 100)}%</span>
          </div>
        ) : (
          <span className="file-meta" title={job.error}>
            {job.error ?? (job.outputs.length ? job.outputs.map((o) => o.split(/[\\/]/).pop()).join(', ') : '')}
          </span>
        )}
        {open && <code className="job-command">{job.command}</code>}
      </div>
      <span className="mono job-metric" title="Velocidade (× tempo real)">{busy ? speedText(job.speed) : ''}</span>
      <span className="mono job-metric" title="Tempo restante">{busy ? etaText(job.etaSec) : job.finishedAt && job.startedAt ? formatElapsed(job.finishedAt - job.startedAt) : ''}</span>
      <span className={`badge badge-${job.status === 'queued' ? 'pending' : job.status === 'running' ? 'analyzed' : job.status === 'paused' ? 'skipped' : job.status}`}>{JOB_STATUS_LABELS[job.status]}</span>
      <div className="media-actions">
        {job.status === 'queued' && (
          <>
            <Button variant="ghost" size="sm" icon="top" aria-label="Mover para o topo" disabled={index === 0} onClick={() => void act({ type: 'move', id: job.id, direction: 'top' })} />
            <Button variant="ghost" size="sm" icon="up" aria-label="Subir" disabled={index === 0} onClick={() => void act({ type: 'move', id: job.id, direction: 'up' })} />
            <Button variant="ghost" size="sm" icon="down" aria-label="Descer" disabled={index === total - 1} onClick={() => void act({ type: 'move', id: job.id, direction: 'down' })} />
          </>
        )}
        {(job.status === 'error' || job.status === 'cancelled') && <Button variant="ghost" size="sm" icon="refresh" aria-label="Tentar novamente" title="Tentar novamente" onClick={() => void act({ type: 'retry', id: job.id })} />}
        {job.status === 'done' && job.outputs[0] && <Button variant="ghost" size="sm" icon="external" aria-label="Mostrar arquivo" title="Mostrar arquivo" onClick={() => void window.api.showItemInFolder(job.outputs[0] as string)} />}
        <Button variant="ghost" size="sm" icon="log" aria-label="Ver comando" title="Ver comando FFmpeg" onClick={() => setOpen((v) => !v)} />
        {busy || job.status === 'queued' ? (
          <Button variant="ghost" size="sm" icon="x" aria-label="Cancelar" title="Cancelar" onClick={() => void act({ type: 'cancel', id: job.id })} />
        ) : (
          <Button variant="ghost" size="sm" icon="trash" aria-label="Remover da lista" title="Remover da lista" onClick={() => void act({ type: 'remove', id: job.id })} />
        )}
      </div>
    </div>
  );
}

function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    void window.api.listHistory().then(setEntries);
    return window.api.onHistoryEvent(setEntries);
  }, []);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? entries.filter((e) => e.title.toLowerCase().includes(q) || MODULE_LABELS[e.module].toLowerCase().includes(q)) : entries;
  }, [entries, query]);

  return (
    <div className="module-body">
      <div className="toolbar">
        <div className="search">
          <input className="input" placeholder="Buscar no histórico…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Button variant="ghost" icon="trash" onClick={() => void window.api.clearHistory()} disabled={entries.length === 0}>
          Limpar histórico
        </Button>
      </div>
      <div className="job-list">
        {visible.length === 0 ? (
          <div className="empty-filter">Nenhuma execução registrada ainda.</div>
        ) : (
          visible.map((e) => (
            <div key={e.id} className={`job-row job-${e.status}`}>
              <span className="job-index mono">{new Date(e.finishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
              <div className="job-main">
                <div className="job-title">
                  <span className="file-name">{e.title}</span>
                  <span className="chip">{MODULE_LABELS[e.module]}</span>
                </div>
                <span className="file-meta" title={e.error}>{e.error ?? e.outputs.map((o) => o.split(/[\\/]/).pop()).join(', ')}</span>
              </div>
              <span className="mono job-metric">{formatElapsed(e.finishedAt - e.startedAt)}</span>
              <span className={`badge badge-${e.status}`}>{JOB_STATUS_LABELS[e.status]}</span>
              <div className="media-actions">
                {e.outputs[0] && <Button variant="ghost" size="sm" icon="external" aria-label="Mostrar saída" onClick={() => void window.api.showItemInFolder(e.outputs[0] as string)} />}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PresetBatchView({ active }: { active: boolean }) {
  const { presets, settingsApi } = useApp();
  const files = useMediaFiles('media');
  const io = useModuleFiles(files, 'media', active);
  const [presetId, setPresetId] = useState('builtin-youtube-1080');
  const preset = presets.presets.find((p) => p.id === presetId);
  const outputDir = settingsApi.settings?.media.outputDir ?? '';

  const request = useMemo<OperationRequest | null>(() => {
    if (!preset) return null;
    // Audio presets accept audio and video (extracting the audio); video presets need a video stream.
    const eligible = files.ready.filter((f) => (preset.module === 'video-convert' ? f.info?.video : f.info?.audio)).map((f) => f.path);
    if (!eligible.length) return null;
    return preset.module === 'audio-convert'
      ? { module: 'audio-convert', files: eligible, outputDir, options: preset.options }
      : { module: 'video-convert', files: eligible, outputDir, options: preset.options };
  }, [preset, files.ready, outputDir]);
  const op = useOperation(request);
  const skipped = preset ? files.ready.length - (request?.files.length ?? 0) : 0;

  return (
    <SplitModule
      header={null}
      main={
        <>
          <MediaFileList api={files} kind="media" onAdd={() => void io.pickFiles()} onAddFolder={() => void io.pickFolder()} hint="Misture áudios e vídeos: o preset escolhido é aplicado a todos os arquivos compatíveis." />
          {io.overlay}
        </>
      }
      side={
        <>
          <Section title="Preset">
            <Field label="Aplicar a todos os arquivos">
              <select className="input" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                <optgroup label="Vídeo">
                  {presets.presets.filter((p) => p.module === 'video-convert').map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.builtin ? '' : ' (meu)'}</option>
                  ))}
                </optgroup>
                <optgroup label="Áudio">
                  {presets.presets.filter((p) => p.module === 'audio-convert').map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.builtin ? '' : ' (meu)'}</option>
                  ))}
                </optgroup>
              </select>
            </Field>
            {skipped > 0 && <div className="notice notice-warn">{skipped} arquivo(s) sem {preset?.module === 'video-convert' ? 'vídeo' : 'áudio'} serão ignorados.</div>}
          </Section>
          <Section title="Saída">
            <OutputDirField />
            <CommandPreview preview={op.preview} error={op.error} busy={op.busy} disabled={!request} onEnqueue={() => void op.enqueue()} onOpenQueue={op.openQueue} />
          </Section>
        </>
      }
    />
  );
}
