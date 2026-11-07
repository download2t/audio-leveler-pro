import { stat } from 'node:fs/promises';
import { parseMediaInfo } from '../../core/parsers';
import type { MediaInfo } from '../../shared/media';
import { runProcess } from '../ffmpeg/runner';

/** ffprobe wrapper with a cache keyed by path + size + mtime (files are probed by the UI and again when planning). */
export class MediaProbe {
  private readonly cache = new Map<string, { key: string; info: MediaInfo }>();

  constructor(private readonly ffprobe: () => string) {}

  async probe(path: string): Promise<MediaInfo> {
    const s = await stat(path);
    const key = `${s.size}:${s.mtimeMs}`;
    const cached = this.cache.get(path);
    if (cached?.key === key) return cached.info;
    const { stdout } = await runProcess(
      this.ffprobe(),
      ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', path],
      { captureStdout: true }
    );
    const info = parseMediaInfo(stdout, path);
    if (!info.sizeBytes) info.sizeBytes = s.size;
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(path, { key, info });
    return info;
  }
}
