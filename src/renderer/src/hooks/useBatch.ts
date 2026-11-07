import { useCallback, useEffect, useState, type Dispatch } from 'react';
import type { AppSettings, BatchMode, BatchProgress, BatchReport, FileItem } from '../../../shared/types';
import { errorText } from '../lib/labels';
import type { FilesAction } from '../state/filesReducer';

export interface BatchApi {
  running: boolean;
  progress: BatchProgress | null;
  report: BatchReport | null;
  dismissReport: () => void;
  start: (mode: BatchMode, targets: readonly FileItem[], settings: AppSettings, reanalyze?: boolean) => Promise<string | null>;
  cancel: () => void;
}

/** Bridges batch IPC events to the files reducer. `start` resolves with an error message, or null. */
export function useBatch(dispatch: Dispatch<FilesAction>): BatchApi {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [report, setReport] = useState<BatchReport | null>(null);

  useEffect(
    () =>
      window.api.onBatchEvent((event) => {
        if (event.type === 'files') dispatch({ type: 'patch', patches: event.patches });
        else setProgress(event.progress);
      }),
    [dispatch]
  );

  const start = useCallback<BatchApi['start']>(
    async (mode, targets, settings, reanalyze = false) => {
      if (running || targets.length === 0) return null;
      setRunning(true);
      setReport(null);
      setProgress({ phase: 'analyzing', completed: 0, total: targets.length, overall: 0, elapsedMs: 0 });
      dispatch({
        type: 'patch',
        patches: targets.map((t) => ({
          id: t.id,
          status: t.analysis && !reanalyze ? 'analyzed' : 'pending',
          progress: 0,
          error: undefined
        }))
      });
      try {
        const result = await window.api.startBatch({
          mode,
          settings,
          files: targets.map((t) => ({
            id: t.id,
            path: t.path,
            rootDir: t.rootDir,
            name: t.name,
            probe: reanalyze ? undefined : t.probe,
            analysis: reanalyze ? undefined : t.analysis
          }))
        });
        setReport(result);
        return null;
      } catch (err) {
        return errorText(err);
      } finally {
        setRunning(false);
        setProgress(null);
      }
    },
    [dispatch, running]
  );

  const cancel = useCallback(() => void window.api.cancelBatch(), []);
  const dismissReport = useCallback(() => setReport(null), []);

  return { running, progress, report, dismissReport, start, cancel };
}
