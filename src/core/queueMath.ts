import type { JobStatus, QueueJob } from '../shared/media';

/** Progress of a multi-step job weighted by each step's media duration. */
export function jobProgress(stepDurations: readonly number[], stepIndex: number, stepFraction: number): number {
  const weights = stepDurations.map((d) => Math.max(d, 0.001));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  let done = 0;
  for (let i = 0; i < Math.min(stepIndex, weights.length); i++) done += weights[i] as number;
  done += (weights[stepIndex] ?? 0) * Math.min(1, Math.max(0, stepFraction));
  return Math.min(1, done / total);
}

/** × realtime: media seconds processed per wall-clock second. */
export function speedOf(mediaSec: number, elapsedMs: number): number | null {
  if (elapsedMs < 500 || mediaSec <= 0) return null;
  return mediaSec / (elapsedMs / 1000);
}

export function etaSeconds(remainingMediaSec: number, speed: number | null): number | null {
  if (speed === null || speed <= 0) return null;
  return Math.max(0, remainingMediaSec / speed);
}

const STATUSES: JobStatus[] = ['queued', 'running', 'paused', 'done', 'error', 'cancelled'];

export function aggregateQueue(jobs: readonly QueueJob[]): {
  overall: number;
  speed: number | null;
  etaSec: number | null;
  counts: Record<JobStatus, number>;
} {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<JobStatus, number>;
  let weightSum = 0;
  let doneSum = 0;
  let remaining = 0;
  let speed = 0;
  let hasSpeed = false;
  for (const job of jobs) {
    counts[job.status]++;
    if (job.status === 'cancelled') continue;
    const w = Math.max(job.totalDurationSec, 1);
    weightSum += w;
    doneSum += w * (job.status === 'done' || job.status === 'error' ? 1 : job.progress);
    if (job.status === 'queued' || job.status === 'running' || job.status === 'paused') remaining += w * (1 - job.progress);
    if (job.status === 'running' && job.speed !== null) {
      speed += job.speed;
      hasSpeed = true;
    }
  }
  const aggregateSpeed = hasSpeed ? speed : null;
  return {
    overall: weightSum === 0 ? 0 : doneSum / weightSum,
    speed: aggregateSpeed,
    etaSec: remaining === 0 ? 0 : etaSeconds(remaining, aggregateSpeed),
    counts
  };
}
