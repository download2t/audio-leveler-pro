import { useCallback, useEffect, useState } from 'react';
import type { QueueAction, QueueSnapshot } from '../../../shared/media';

export interface QueueApi {
  snapshot: QueueSnapshot;
  action: (action: QueueAction) => Promise<void>;
}

const EMPTY: QueueSnapshot = {
  jobs: [],
  paused: false,
  overall: 0,
  speed: null,
  etaSec: null,
  counts: { queued: 0, running: 0, paused: 0, done: 0, error: 0, cancelled: 0 }
};

export function useQueue(): QueueApi {
  const [snapshot, setSnapshot] = useState<QueueSnapshot>(EMPTY);

  useEffect(() => {
    void window.api.getQueue().then(setSnapshot);
    return window.api.onQueueEvent(setSnapshot);
  }, []);

  const action = useCallback((a: QueueAction) => window.api.queueAction(a), []);
  return { snapshot, action };
}
