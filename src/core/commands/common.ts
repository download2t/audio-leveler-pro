import type { MediaInfo } from '../../shared/media';

export interface BuiltStep {
  args: string[];
  /** Media duration produced by the step (progress weighting). */
  durationSec: number;
  label: string;
  /** Run inside the job work directory (filters reference relative file names). */
  inWorkDir?: boolean;
}

export type PrepareAction = { kind: 'copy'; from: string; name: string } | { kind: 'write'; name: string; content: string };

export interface BuildResult {
  steps: BuiltStep[];
  /** Files produced in the work dir and their desired final file names. */
  outputs: Array<{ path: string; name: string }>;
  /** Every file inside this work-dir folder is delivered (split outputs). */
  outputDir?: string;
  prepare: PrepareAction[];
  warnings: string[];
  estimatedBytes: number | null;
  estimatedSeconds: number | null;
}

export interface BuildContext {
  inputs: MediaInfo[];
  workDir: string;
  cpuCount: number;
  /** Font used by text watermarks. */
  fontPath?: string;
}

export const HEAD = ['-hide_banner', '-nostdin', '-nostats', '-y'];

export const tail = (muxer: string, output: string): string[] => ['-progress', 'pipe:1', '-f', muxer, output];

export const joinPath = (dir: string, name: string): string => `${dir.replace(/[\\/]+$/, '')}/${name}`;

/** Seconds as a compact decimal string for ffmpeg arguments. */
export const sec = (n: number): string => String(Math.round(n * 1000) / 1000);

export function baseNameNoExt(p: string): string {
  const name = p.split(/[\\/]/).pop() ?? p;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

export function extOf(p: string): string {
  const name = p.split(/[\\/]/).pop() ?? p;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

const even = (n: number): number => Math.max(2, Math.round(n / 2) * 2);

/** Scale filter to an exact size: fit with black bars, stretch or crop to fill. */
export function exactSizeFilter(width: number, height: number, fit: 'pad' | 'stretch' | 'crop'): string {
  const w = even(width);
  const h = even(height);
  if (fit === 'stretch') return `scale=${w}:${h},setsar=1`;
  if (fit === 'crop') return `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1`;
  return `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,setsar=1`;
}

/** Scale keeping aspect when one side is 0. */
export function sizeFilter(width: number, height: number, fit: 'pad' | 'stretch' | 'crop' = 'pad'): string | null {
  if (width > 0 && height > 0) return exactSizeFilter(width, height, fit);
  if (width > 0) return `scale=${even(width)}:-2`;
  if (height > 0) return `scale=-2:${even(height)}`;
  return null;
}

function quoteArg(arg: string): string {
  return /^[\w@%+=:,./\\-]+$/.test(arg) ? arg : `"${arg.replace(/"/g, '\\"')}"`;
}

export function formatCommand(args: readonly string[]): string {
  return ['ffmpeg', ...args.filter((a, i, all) => !(a === '-progress' || all[i - 1] === '-progress')).map(quoteArg)].join(' ');
}

export function requireAudio(info: MediaInfo): void {
  if (!info.audio) throw new Error('O arquivo não tem faixa de áudio.');
}

export function requireVideo(info: MediaInfo): void {
  if (!info.video) throw new Error('O arquivo não tem faixa de vídeo.');
}
