import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { runProcess } from './runner';

export interface FfmpegBinaries {
  ffmpeg: string;
  ffprobe: string;
}

/** Binaries inside app.asar cannot be spawned; electron-builder unpacks them next to it. */
function unpacked(p: string): string {
  return p.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function pick(override: string, bundled: string | null | undefined, fallback: string): string {
  if (override && existsSync(override)) return override;
  if (bundled) {
    const real = unpacked(bundled);
    if (existsSync(real)) return real;
  }
  return fallback;
}

/** Priority: user override -> bundled static binary -> executable on PATH. */
export function resolveBinaries(overrides: { ffmpegPath: string; ffprobePath: string }): FfmpegBinaries {
  return {
    ffmpeg: pick(overrides.ffmpegPath, ffmpegStatic, 'ffmpeg'),
    ffprobe: pick(overrides.ffprobePath, ffprobeStatic.path, 'ffprobe')
  };
}

export async function getFfmpegVersion(ffmpeg: string): Promise<string | null> {
  try {
    const { stdout } = await runProcess(ffmpeg, ['-hide_banner', '-version'], { captureStdout: true });
    return stdout.split(/\r?\n/)[0]?.trim() ?? null;
  } catch {
    return null;
  }
}
