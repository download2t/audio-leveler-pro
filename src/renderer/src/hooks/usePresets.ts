import { useCallback, useEffect, useState } from 'react';
import type { Preset } from '../../../shared/media';

export interface PresetsApi {
  presets: Preset[];
  save: (preset: Preset) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export function usePresets(): PresetsApi {
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    void window.api.listPresets().then(setPresets);
  }, []);

  const save = useCallback(async (preset: Preset) => setPresets(await window.api.savePreset(preset)), []);
  const remove = useCallback(async (id: string) => setPresets(await window.api.deletePreset(id)), []);
  return { presets, save, remove };
}
