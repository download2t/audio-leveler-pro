import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { buildAnalysisArgs, buildExportArgs, type EncoderSpec } from '../../core/ffmpegArgs';
import { parseAnalysisOutput, parseFfprobeOutput } from '../../core/parsers';
import type { AudioProbe, ExportSettings, GainResult, LoudnessAnalysis } from '../../shared/types';
import { runProcess } from '../ffmpeg/runner';

export interface TaskOptions {
  signal?: AbortSignal;
  /** 0..1 progress of the current file. */
  onProgress?: (fraction: number) => void;
}

const fraction = (seconds: number, duration: number): number =>
  duration > 0 ? Math.min(1, Math.max(0, seconds / duration)) : 0;

export async function probeFile(ffprobe: string, file: string, opts: TaskOptions = {}): Promise<AudioProbe> {
  const { stdout } = await runProcess(
    ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file],
    { signal: opts.signal, captureStdout: true }
  );
  return parseFfprobeOutput(stdout);
}

export async function analyzeFile(
  ffmpeg: string,
  file: string,
  durationSec: number,
  opts: TaskOptions = {}
): Promise<LoudnessAnalysis> {
  const { stderr } = await runProcess(ffmpeg, buildAnalysisArgs(file), {
    signal: opts.signal,
    onProgressSeconds: (s) => opts.onProgress?.(fraction(s, durationSec))
  });
  return parseAnalysisOutput(stderr);
}

export interface ExportJob {
  input: string;
  output: string;
  probe: AudioProbe;
  spec: EncoderSpec;
  gain: GainResult;
  settings: ExportSettings;
  ceilingDb: number;
}

/**
 * Encodes into a hidden temporary file in the destination folder and renames
 * it on success, so a cancelled/failed run never leaves a truncated output
 * (and never damages the original when overwriting).
 */
export async function exportFile(ffmpeg: string, job: ExportJob, opts: TaskOptions = {}): Promise<void> {
  const dir = dirname(job.output);
  await mkdir(dir, { recursive: true });
  const tmp = join(dir, `.${basename(job.output)}.${randomBytes(4).toString('hex')}.alp-tmp`);
  try {
    await runProcess(ffmpeg, buildExportArgs({ ...job, output: tmp }), {
      signal: opts.signal,
      onProgressSeconds: (s) => opts.onProgress?.(fraction(s, job.probe.durationSec))
    });
    await rename(tmp, job.output);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}
