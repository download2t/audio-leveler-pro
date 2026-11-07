import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, ExportSettings, NormalizationSettings } from '../../../shared/types';

export interface SettingsApi {
  settings: AppSettings | null;
  update: (updater: (s: AppSettings) => AppSettings) => void;
  updateNormalization: (patch: Partial<NormalizationSettings>) => void;
  updateExport: (patch: Partial<ExportSettings>) => void;
}

/** Loads settings from the main process and persists every change (debounced). */
export function useSettings(): SettingsApi {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    void window.api.getSettings().then((s) => {
      loaded.current = true;
      setSettings(s);
    });
  }, []);

  useEffect(() => {
    if (!settings || !loaded.current) return;
    const timer = window.setTimeout(() => void window.api.saveSettings(settings), 300);
    return () => window.clearTimeout(timer);
  }, [settings]);

  const update = useCallback((updater: (s: AppSettings) => AppSettings) => {
    setSettings((prev) => (prev ? updater(prev) : prev));
  }, []);

  const updateNormalization = useCallback(
    (patch: Partial<NormalizationSettings>) =>
      update((s) => ({ ...s, normalization: { ...s.normalization, ...patch } })),
    [update]
  );

  const updateExport = useCallback(
    (patch: Partial<ExportSettings>) => update((s) => ({ ...s, export: { ...s.export, ...patch } })),
    [update]
  );

  return { settings, update, updateNormalization, updateExport };
}
