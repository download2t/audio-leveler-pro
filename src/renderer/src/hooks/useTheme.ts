import { useEffect, useState } from 'react';
import type { ThemeMode } from '../../../shared/types';

const query = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)');

/** Applies `data-theme` on <html>, following the OS when mode is "system". */
export function useTheme(mode: ThemeMode): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() => query().matches);

  useEffect(() => {
    const mq = query();
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.dataset['theme'] = resolved;
  }, [resolved]);

  return resolved;
}
