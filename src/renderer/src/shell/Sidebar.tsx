import { APP_CREDITS } from '../../../shared/defaults';
import type { ThemeMode } from '../../../shared/types';
import { Icon, type IconName } from '../components/ui/Icon';
import { useApp, type ModuleId } from '../state/AppContext';

export const MODULES: ReadonlyArray<{ id: ModuleId; label: string; icon: IconName }> = [
  { id: 'normalizer', label: 'Normalizador de Áudio', icon: 'wave' },
  { id: 'audio-converter', label: 'Conversor de Áudio', icon: 'music' },
  { id: 'video-converter', label: 'Conversor de Vídeo', icon: 'film' },
  { id: 'audio-editor', label: 'Editor de Áudio', icon: 'scissors' },
  { id: 'video-editor', label: 'Editor de Vídeo', icon: 'repeat' },
  { id: 'batch', label: 'Ferramentas em Lote', icon: 'layers' },
  { id: 'settings', label: 'Configurações', icon: 'gear' }
];

const THEME_NEXT: Record<ThemeMode, { next: ThemeMode; icon: IconName; label: string }> = {
  system: { next: 'light', icon: 'monitor', label: 'Tema do sistema' },
  light: { next: 'dark', icon: 'sun', label: 'Tema claro' },
  dark: { next: 'system', icon: 'moon', label: 'Tema escuro' }
};

export function Sidebar({ active, onSelect }: { active: ModuleId; onSelect: (id: ModuleId) => void }) {
  const { queue, settingsApi, env } = useApp();
  const theme = settingsApi.settings?.theme ?? 'system';
  const t = THEME_NEXT[theme];
  const pending = queue.snapshot.counts.queued + queue.snapshot.counts.running + queue.snapshot.counts.paused;

  return (
    <nav className="sidebar" aria-label="Módulos">
      <div className="brand">
        <span className="brand-logo">
          <Icon name="wave" size={20} />
        </span>
        <div>
          <h1>{APP_CREDITS.appName}</h1>
          <span className="brand-sub">Suíte multimídia</span>
        </div>
      </div>
      <ul className="nav">
        {MODULES.map((m) => (
          <li key={m.id}>
            <button type="button" className={`nav-item ${active === m.id ? 'is-active' : ''}`} aria-current={active === m.id ? 'page' : undefined} onClick={() => onSelect(m.id)}>
              <Icon name={m.icon} size={17} />
              <span>{m.label}</span>
              {m.id === 'batch' && pending > 0 && <span className="nav-badge">{pending}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-footer">
        <div className="sidebar-tools">
          <span className={`pill ${env?.ffmpegVersion ? 'pill-ok' : 'pill-error'}`} title={env?.ffmpegVersion ?? 'FFmpeg não encontrado'}>
            <span className="pill-dot" />
            FFmpeg {env?.ffmpegVersion?.match(/ffmpeg version (\d+(\.\d+)?)/)?.[1] ?? '?'}
          </span>
          <button type="button" className="icon-button" title={t.label} aria-label={t.label} onClick={() => settingsApi.update((s) => ({ ...s, theme: t.next }))}>
            <Icon name={t.icon} size={16} />
          </button>
        </div>
        <div className="credits small">
          Desenvolvido por <strong>{APP_CREDITS.developer}</strong>
          {env && <span className="muted"> · v{env.appVersion}</span>}
        </div>
      </div>
    </nav>
  );
}
