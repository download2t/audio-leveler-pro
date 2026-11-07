import { describe, expect, it } from 'vitest';
import { runPool } from '../pool';

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('runPool', () => {
  it('processes every item without exceeding the concurrency', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    const result = await runPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      active++;
      peak = Math.max(peak, active);
      await delay(5);
      seen.push(n);
      active--;
    });
    expect(result.completed).toBe(7);
    expect(peak).toBe(3);
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps going when a task fails', async () => {
    const result = await runPool([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
    });
    expect(result.completed).toBe(2);
    expect(result.errors).toHaveLength(1);
  });

  it('stops scheduling after abort', async () => {
    const controller = new AbortController();
    const started: number[] = [];
    const result = await runPool(
      Array.from({ length: 20 }, (_, i) => i),
      2,
      async (n) => {
        started.push(n);
        if (n === 3) controller.abort();
        await delay(1);
      },
      controller.signal
    );
    expect(result.aborted).toBe(true);
    expect(started.length).toBeLessThan(20);
  });

  it('handles empty input and invalid concurrency', async () => {
    expect((await runPool([], 4, async () => {})).completed).toBe(0);
    expect((await runPool([1, 2], 0, async () => {})).completed).toBe(2);
  });
});
