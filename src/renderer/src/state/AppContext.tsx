import { createContext, useContext } from 'react';
import type { EnvironmentInfo } from '../../../shared/types';
import type { PresetsApi } from '../hooks/usePresets';
import type { QueueApi } from '../hooks/useQueue';
import type { SettingsApi } from '../hooks/useSettings';
import type { ToastKind } from '../hooks/useToasts';

export type ModuleId = 'normalizer' | 'audio-converter' | 'video-converter' | 'audio-editor' | 'video-editor' | 'batch' | 'settings';

export interface AppContextValue {
  settingsApi: SettingsApi;
  env: EnvironmentInfo | null;
  refreshEnv: () => void;
  notify: (message: string, kind?: ToastKind) => void;
  queue: QueueApi;
  presets: PresetsApi;
  navigate: (module: ModuleId) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = AppContext.Provider;

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp fora do AppProvider');
  return ctx;
}
