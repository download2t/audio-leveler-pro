import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { EnvironmentInfo } from '../../shared/types';
import { Toasts } from './components/Overlays';
import { usePresets } from './hooks/usePresets';
import { useQueue } from './hooks/useQueue';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { useToasts } from './hooks/useToasts';
import { AudioConverterModule } from './modules/audioConverter/AudioConverterModule';
import { AudioEditorModule } from './modules/audioEditor/AudioEditorModule';
import { BatchModule } from './modules/batch/BatchModule';
import { NormalizerModule } from './modules/normalizer/NormalizerModule';
import { SettingsModule } from './modules/settings/SettingsModule';
import { VideoConverterModule } from './modules/videoConverter/VideoConverterModule';
import { VideoEditorModule } from './modules/videoEditor/VideoEditorModule';
import { QueueBar } from './shell/QueueBar';
import { Sidebar } from './shell/Sidebar';
import { AppProvider, type AppContextValue, type ModuleId } from './state/AppContext';

const RENDER: Record<ModuleId, (active: boolean) => ReactNode> = {
  normalizer: (active) => <NormalizerModule active={active} />,
  'audio-converter': (active) => <AudioConverterModule active={active} />,
  'video-converter': (active) => <VideoConverterModule active={active} />,
  'audio-editor': (active) => <AudioEditorModule active={active} />,
  'video-editor': (active) => <VideoEditorModule active={active} />,
  batch: (active) => <BatchModule active={active} />,
  settings: () => <SettingsModule />
};

export function App() {
  const settingsApi = useSettings();
  const { toasts, notify, dismiss } = useToasts();
  const queue = useQueue();
  const presets = usePresets();
  const [env, setEnv] = useState<EnvironmentInfo | null>(null);
  const [module, setModule] = useState<ModuleId>('normalizer');
  // Modules mount on first visit and stay mounted, so switching never loses their file lists.
  const [visited, setVisited] = useState<ReadonlySet<ModuleId>>(new Set(['normalizer']));

  useTheme(settingsApi.settings?.theme ?? 'system');

  const refreshEnv = useCallback(() => void window.api.getEnvironment().then(setEnv), []);
  useEffect(refreshEnv, [refreshEnv]);

  const navigate = useCallback((id: ModuleId) => {
    setModule(id);
    setVisited((prev) => (prev.has(id) ? prev : new Set([...prev, id])));
  }, []);

  const ctx = useMemo<AppContextValue>(
    () => ({ settingsApi, env, refreshEnv, notify, queue, presets, navigate }),
    [settingsApi, env, refreshEnv, notify, queue, presets, navigate]
  );

  if (!settingsApi.settings) return <div className="app-loading">Carregando…</div>;

  return (
    <AppProvider value={ctx}>
      <div className="shell">
        <Sidebar active={module} onSelect={navigate} />
        <div className="shell-main">
          <div className="shell-content">
            {[...visited].map((id) => (
              <div key={id} className="module-slot" style={{ display: id === module ? 'flex' : 'none' }}>
                {RENDER[id](id === module)}
              </div>
            ))}
          </div>
          <QueueBar />
        </div>
        <Toasts toasts={toasts} onDismiss={dismiss} />
      </div>
    </AppProvider>
  );
}
