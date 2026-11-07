import { useCallback, useEffect, useState } from 'react';
import type { OperationPreview, OperationRequest } from '../../../shared/media';
import { errorText } from '../lib/labels';
import { useApp } from '../state/AppContext';

/** Debounced preview (command, estimates, warnings) + enqueue of an operation request. */
export function useOperation(request: OperationRequest | null) {
  const { notify, navigate } = useApp();
  const [preview, setPreview] = useState<OperationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signature = request ? JSON.stringify(request) : '';

  useEffect(() => {
    if (!request) {
      setPreview(null);
      setError(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      window.api
        .previewOperation(request)
        .then((p) => alive && (setPreview(p), setError(null)))
        .catch((err) => alive && (setPreview(null), setError(errorText(err))));
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [signature]);

  const enqueue = useCallback(async () => {
    if (!request) return;
    setBusy(true);
    try {
      const count = await window.api.enqueueOperation(request);
      notify(`${count} tarefa(s) adicionada(s) à fila.`, 'success');
    } catch (err) {
      notify(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  }, [request, notify]);

  return { preview, error, busy, enqueue, openQueue: () => navigate('batch') };
}
