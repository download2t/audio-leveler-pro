import { useState } from 'react';
import { formatBytes, formatElapsed } from '../../../../core/format';
import type { OperationPreview } from '../../../../shared/media';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

export function CommandPreview({
  preview,
  error,
  busy,
  disabled,
  onEnqueue,
  onOpenQueue
}: {
  preview: OperationPreview | null;
  error: string | null;
  busy: boolean;
  disabled: boolean;
  onEnqueue: () => void;
  onOpenQueue: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    if (!preview) return;
    await navigator.clipboard.writeText(preview.command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="preview-card">
      <div className="preview-stats">
        <div>
          <span className="stat-label">Tarefas</span>
          <span className="stat-value">{preview?.jobs ?? 0}</span>
        </div>
        <div>
          <span className="stat-label">Tamanho original</span>
          <span className="stat-value">{preview ? formatBytes(preview.inputBytes) : '—'}</span>
        </div>
        <div>
          <span className="stat-label">Saída estimada</span>
          <span className="stat-value">{preview?.estimatedBytes != null ? `~${formatBytes(preview.estimatedBytes)}` : '—'}</span>
        </div>
        <div>
          <span className="stat-label">Tempo estimado</span>
          <span className="stat-value">{preview?.estimatedSeconds != null ? `~${formatElapsed(preview.estimatedSeconds * 1000)}` : '—'}</span>
        </div>
      </div>

      {error && (
        <div className="notice notice-error">
          <Icon name="alert" size={14} /> {error}
        </div>
      )}
      {preview?.warnings.map((w) => (
        <div key={w} className="notice notice-warn">
          <Icon name="info" size={14} /> {w}
        </div>
      ))}

      {preview?.command && (
        <div className="command">
          <div className="command-head">
            <span>
              Comando FFmpeg{preview.stepCount > 1 ? ` (passo 1 de ${preview.stepCount})` : ''}
              {preview.jobs > 1 ? ' · primeiro arquivo' : ''}
            </span>
            <button type="button" onClick={() => void copy()}>
              <Icon name={copied ? 'check' : 'copy'} size={12} /> {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>
          <code>{preview.command}</code>
        </div>
      )}

      <div className="preview-actions">
        <Button variant="ghost" icon="layers" onClick={onOpenQueue}>
          Ver fila
        </Button>
        <Button variant="primary" icon="play" size="lg" onClick={onEnqueue} disabled={disabled || busy || !preview || !!error}>
          Adicionar à fila{preview && preview.jobs > 0 ? ` (${preview.jobs})` : ''}
        </Button>
      </div>
    </div>
  );
}
