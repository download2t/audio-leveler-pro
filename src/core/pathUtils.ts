// Platform-agnostic path helpers usable from the renderer (no `node:path`).

export function splitPath(p: string): string[] {
  return p.split(/[\\/]+/).filter(Boolean);
}

export function baseName(p: string): string {
  const parts = splitPath(p);
  return parts[parts.length - 1] ?? '';
}

export function parentDir(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx <= 0 ? '' : p.slice(0, idx);
}

/** Lower-case extension without the dot ('' if none). */
export function extensionOf(p: string): string {
  const name = baseName(p);
  const idx = name.lastIndexOf('.');
  return idx <= 0 ? '' : name.slice(idx + 1).toLowerCase();
}
