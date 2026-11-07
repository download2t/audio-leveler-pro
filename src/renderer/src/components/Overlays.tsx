import type { Toast } from '../hooks/useToasts';
import { SUPPORTED_EXTENSIONS } from '../../../shared/defaults';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';

const FORMATS = SUPPORTED_EXTENSIONS.map((e) => e.toUpperCase()).join(' · ');

export function DropOverlay({ hint = FORMATS }: { hint?: string }) {
  return (
    <div className="drop-overlay">
      <div className="drop-overlay-box">
        <Icon name="download" size={36} />
        <strong>Solte arquivos ou pastas aqui</strong>
        <span>{hint}</span>
      </div>
    </div>
  );
}

export function EmptyState({ onAddFiles, onAddFolder }: { onAddFiles: () => void; onAddFolder: () => void }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name="wave" size={34} />
      </div>
      <h2>Arraste arquivos ou pastas de áudio</h2>
      <p>Importe centenas ou milhares de faixas de uma vez. Formatos: {FORMATS}.</p>
      <div className="empty-actions">
        <Button variant="primary" icon="plus" onClick={onAddFiles}>
          Adicionar arquivos
        </Button>
        <Button icon="folder" onClick={onAddFolder}>
          Adicionar pasta
        </Button>
      </div>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'check' : 'file'} size={16} />
          <span>{t.message}</span>
          <button type="button" aria-label="Fechar" onClick={() => onDismiss(t.id)}>
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
