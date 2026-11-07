import { formatBytes, formatDuration } from '../../../../core/format';
import type { MediaKind } from '../../../../shared/media';
import type { MediaFilesApi } from '../../hooks/useMediaFiles';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';

const KIND_LABEL: Record<MediaKind, string> = { audio: 'áudio', video: 'vídeo', media: 'áudio ou vídeo' };

export function MediaFileList({
  api,
  kind,
  reorderable = false,
  disabled = false,
  onAdd,
  onAddFolder,
  hint
}: {
  api: MediaFilesApi;
  kind: MediaKind;
  reorderable?: boolean;
  disabled?: boolean;
  onAdd: () => void;
  onAddFolder: () => void;
  hint?: string;
}) {
  const { files } = api;
  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const totalDuration = files.reduce((s, f) => s + (f.info?.durationSec ?? 0), 0);

  return (
    <div className="media-list">
      <div className="media-list-toolbar">
        <div className="toolbar-group">
          <Button variant="primary" icon="plus" onClick={onAdd} disabled={disabled}>
            Arquivos
          </Button>
          <Button icon="folder" onClick={onAddFolder} disabled={disabled}>
            Pasta
          </Button>
          <Button variant="ghost" onClick={api.clear} disabled={disabled || files.length === 0}>
            Limpar
          </Button>
        </div>
        <span className="toolbar-count">
          {files.length} arquivo(s) · {formatDuration(totalDuration || null)} · {formatBytes(totalSize)}
          {api.probing && ' · lendo…'}
        </span>
      </div>

      {files.length === 0 ? (
        <div className="empty-state compact">
          <div className="empty-icon">
            <Icon name={kind === 'video' ? 'film' : kind === 'audio' ? 'music' : 'layers'} size={30} />
          </div>
          <h2>Arraste arquivos de {KIND_LABEL[kind]} ou pastas</h2>
          {hint && <p>{hint}</p>}
          <div className="empty-actions">
            <Button variant="primary" icon="plus" onClick={onAdd}>
              Adicionar arquivos
            </Button>
            <Button icon="folder" onClick={onAddFolder}>
              Adicionar pasta
            </Button>
          </div>
        </div>
      ) : (
        <div className="media-rows">
          {files.map((f, i) => {
            const v = f.info?.video;
            const a = f.info?.audio;
            const details = v
              ? `${v.width}×${v.height} · ${Math.round(v.fps * 100) / 100} fps · ${v.codec.toUpperCase()}${a ? ` + ${a.codec.toUpperCase()}` : ''}`
              : a
                ? `${a.codec.toUpperCase()} · ${(a.sampleRate / 1000).toFixed(1)} kHz · ${a.channels === 1 ? 'mono' : a.channels === 2 ? 'estéreo' : `${a.channels} canais`}${a.bitRate ? ` · ${Math.round(a.bitRate / 1000)} kbps` : ''}`
                : '';
            return (
              <div key={f.id} className={`media-row ${f.error ? 'has-error' : ''}`} title={f.path}>
                {reorderable && <span className="media-index">{i + 1}</span>}
                <div className="media-name">
                  <span className="file-name">{f.name}</span>
                  <span className="file-meta">{f.error ?? (f.info ? details : 'Lendo informações…')}</span>
                </div>
                <span className="mono media-col">{formatDuration(f.info?.durationSec)}</span>
                <span className="mono media-col">{formatBytes(f.size)}</span>
                <div className="media-actions">
                  {reorderable && (
                    <>
                      <Button variant="ghost" size="sm" icon="up" aria-label="Mover para cima" disabled={disabled || i === 0} onClick={() => api.move(f.id, -1)} />
                      <Button variant="ghost" size="sm" icon="down" aria-label="Mover para baixo" disabled={disabled || i === files.length - 1} onClick={() => api.move(f.id, 1)} />
                    </>
                  )}
                  <Button variant="ghost" size="sm" icon="x" aria-label="Remover" disabled={disabled} onClick={() => api.remove(f.id)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
