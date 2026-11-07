export interface PoolResult {
  completed: number;
  errors: unknown[];
  aborted: boolean;
}

/**
 * Runs `worker` over `items` with at most `concurrency` tasks in flight.
 * A failing task never stops the pool; aborting stops scheduling new tasks
 * (running tasks are expected to observe the same signal).
 */
export async function runPool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  signal?: AbortSignal
): Promise<PoolResult> {
  let next = 0;
  let completed = 0;
  const errors: unknown[] = [];
  const size = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length));

  const lane = async (): Promise<void> => {
    while (next < items.length && !signal?.aborted) {
      const index = next++;
      try {
        await worker(items[index] as T, index);
        completed++;
      } catch (err) {
        errors.push(err);
      }
    }
  };

  await Promise.all(Array.from({ length: items.length === 0 ? 0 : size }, lane));
  return { completed, errors, aborted: signal?.aborted ?? false };
}
