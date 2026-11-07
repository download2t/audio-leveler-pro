import path from 'node:path';
import type { ExportSettings } from '../../shared/types';

type PathApi = Pick<typeof path, 'basename' | 'dirname' | 'extname' | 'join' | 'relative' | 'isAbsolute' | 'resolve'>;

/**
 * Decides where each normalized file is written. Guarantees, within a batch,
 * that two inputs never map to the same output and that an original file is
 * never targeted unless overwriting was explicitly enabled.
 */
export class OutputPathPlanner {
  private readonly used = new Set<string>();

  constructor(
    private readonly settings: Pick<
      ExportSettings,
      'outputDir' | 'overwriteOriginals' | 'preserveFolderStructure' | 'fileSuffix'
    >,
    private readonly p: PathApi = path,
    private readonly caseInsensitive = process.platform !== 'linux'
  ) {}

  plan(inputPath: string, rootDir: string, ext: string): string {
    if (this.settings.overwriteOriginals) {
      this.used.add(this.key(inputPath));
      return inputPath;
    }
    const { p } = this;
    let rel = this.settings.preserveFolderStructure ? p.relative(rootDir, p.dirname(inputPath)) : '';
    if (rel.startsWith('..') || p.isAbsolute(rel)) rel = '';
    const dir = p.join(this.settings.outputDir, rel);
    const base = p.basename(inputPath, p.extname(inputPath)) + this.settings.fileSuffix;

    let candidate = p.join(dir, `${base}.${ext}`);
    for (let n = 1; this.used.has(this.key(candidate)) || this.key(candidate) === this.key(inputPath); n++) {
      candidate = p.join(dir, `${base} (${n}).${ext}`);
    }
    this.used.add(this.key(candidate));
    return candidate;
  }

  private key(file: string): string {
    const resolved = this.p.resolve(file);
    return this.caseInsensitive ? resolved.toLowerCase() : resolved;
  }
}
