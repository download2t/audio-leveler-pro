import { useCallback, type ReactNode } from 'react';
import type { MediaKind } from '../../../shared/media';
import { DropOverlay } from '../components/Overlays';
import { Icon, type IconName } from '../components/ui/Icon';
import { useFileDrop } from '../hooks/useFileDrop';
import type { MediaFilesApi } from '../hooks/useMediaFiles';
import { errorText } from '../lib/labels';
import { useApp } from '../state/AppContext';

export function ModuleHeader({ icon, title, subtitle, actions }: { icon: IconName; title: string; subtitle: string; actions?: ReactNode }) {
  return (
    <header className="module-header">
      <div className="module-title">
        <span className="module-icon">
          <Icon name={icon} size={18} />
        </span>
        <div>
          <h1>{title}</h1>
          <span>{subtitle}</span>
        </div>
      </div>
      {actions && <div className="header-actions">{actions}</div>}
    </header>
  );
}

/** Two-column module: file list on the left, options panel on the right. */
export function SplitModule({ header, main, side }: { header: ReactNode; main: ReactNode; side: ReactNode }) {
  return (
    <div className="module">
      {header}
      <div className="module-split">
        <section className="module-main">{main}</section>
        <aside className="module-side">{side}</aside>
      </div>
    </div>
  );
}

/** Wires picking, folder picking and window drag & drop of a module's file list. */
export function useModuleFiles(files: MediaFilesApi, kind: MediaKind, active: boolean) {
  const { notify } = useApp();
  const addPaths = useCallback(
    async (paths: string[]) => {
      try {
        const r = await files.add(paths);
        if (paths.length) notify(`${r.added} arquivo(s) adicionado(s)${r.ignored ? ` · ${r.ignored} ignorado(s)` : ''}`, r.added ? 'success' : 'info');
      } catch (err) {
        notify(errorText(err), 'error');
      }
    },
    [files, notify]
  );
  const dragging = useFileDrop((paths) => void addPaths(paths), active);
  return {
    overlay: dragging ? <DropOverlay hint={kind === 'audio' ? 'Arquivos de áudio' : kind === 'video' ? 'Arquivos de vídeo' : 'Áudio e vídeo'} /> : null,
    pickFiles: async () => addPaths(await window.api.pickMedia(kind)),
    pickFolder: async () => addPaths(await window.api.pickFolders())
  };
}
