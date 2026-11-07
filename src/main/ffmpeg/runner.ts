import { spawn, type ChildProcess } from 'node:child_process';
import { ProgressParser } from '../../core/parsers';

export class CancelledError extends Error {
  constructor() {
    super('Operação cancelada');
    this.name = 'CancelledError';
  }
}

export class ProcessError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderrTail: string
  ) {
    super(message);
    this.name = 'ProcessError';
  }
}

export const isCancelled = (err: unknown): boolean => err instanceof CancelledError;

export interface RunOptions {
  signal?: AbortSignal;
  /** Parse `-progress pipe:1` on stdout and report elapsed media seconds. */
  onProgressSeconds?: (seconds: number) => void;
  captureStdout?: boolean;
  /** stderr is kept as a ring buffer of this size (corrupt files can be very chatty). */
  maxStderrChars?: number;
  cwd?: string;
  /** Gives access to the process (used by the queue to suspend/resume it). */
  onSpawn?: (child: ChildProcess) => void;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

const ERROR_LINE = /error|invalid|failed|unable|cannot|could not|not supported|no such|does not|unknown|too short|out of range|incompatible/i;
// Encoder statistics printed at the end of every run (never the cause of a failure).
const NOISE_LINE = /^(size|video|audio|frame|Stream mapping|Stream #|Press \[q\]|Qavg|\[libx26|kb\/s|encoded|frame I|frame P|frame B|mb I|mb P|mb B|coded y|i16 v|i8 v|ref [PB]|Weighted|consecutive|8x8 transform|direct mvs|SSIM|PSNR)/;

/** Human readable error: the lines that explain the failure, else the last meaningful lines. */
export function summarizeStderr(stderr: string, lines = 3): string {
  const meaningful = stderr
    .split(/\r?\n/)
    .map((l) => l.replace(/^\[[^\]]+@ [0-9a-fx]+\]\s*/i, '').trim())
    .filter((l) => l && !NOISE_LINE.test(l));
  const errors = [...new Set(meaningful.filter((l) => ERROR_LINE.test(l)))];
  return (errors.length ? errors : meaningful).slice(-lines).join(' | ');
}

export function runProcess(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const { signal, onProgressSeconds, captureStdout = false, maxStderrChars = 512 * 1024, cwd, onSpawn } = opts;
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError());
      return;
    }

    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd });
    onSpawn?.(child);
    const progress = onProgressSeconds ? new ProgressParser() : null;
    let stdout = '';
    let stderr = '';
    let settled = false;

    const onAbort = (): void => {
      child.kill('SIGKILL');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', onAbort);
      fn();
    };

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (captureStdout) stdout += chunk;
      if (progress && onProgressSeconds) {
        const seconds = progress.push(chunk);
        if (seconds !== null) onProgressSeconds(seconds);
      }
    });
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
      if (stderr.length > maxStderrChars) stderr = stderr.slice(-maxStderrChars);
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      finish(() => {
        const message =
          err.code === 'ENOENT'
            ? `Executável não encontrado: ${bin}. Configure o caminho do FFmpeg nas configurações.`
            : `Falha ao iniciar ${bin}: ${err.message}`;
        reject(new ProcessError(message, null, ''));
      });
    });

    child.on('close', (code) => {
      finish(() => {
        if (signal?.aborted) reject(new CancelledError());
        else if (code === 0) resolve({ stdout, stderr });
        else {
          const detail = summarizeStderr(stderr) || `código de saída ${code}`;
          reject(new ProcessError(detail, code, stderr.slice(-4000)));
        }
      });
    });
  });
}
