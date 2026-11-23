import type { ImageConvertOptions, ImageFormat } from '../../shared/media';

export interface ImageFormatSpec {
  label: string;
  ext: string;
  lossy: boolean;
  supportsLossless: boolean;
  supportsAlpha: boolean;
  /** Quality can be searched to reach a target file size. */
  supportsTargetSize: boolean;
}

export const IMAGE_FORMATS: Record<ImageFormat, ImageFormatSpec> = {
  jpeg: { label: 'JPEG', ext: 'jpg', lossy: true, supportsLossless: false, supportsAlpha: false, supportsTargetSize: true },
  png: { label: 'PNG', ext: 'png', lossy: false, supportsLossless: true, supportsAlpha: true, supportsTargetSize: false },
  webp: { label: 'WebP', ext: 'webp', lossy: true, supportsLossless: true, supportsAlpha: true, supportsTargetSize: true },
  avif: { label: 'AVIF', ext: 'avif', lossy: true, supportsLossless: true, supportsAlpha: true, supportsTargetSize: true },
  tiff: { label: 'TIFF', ext: 'tiff', lossy: false, supportsLossless: true, supportsAlpha: true, supportsTargetSize: false },
  gif: { label: 'GIF', ext: 'gif', lossy: false, supportsLossless: true, supportsAlpha: true, supportsTargetSize: false }
};

export function imageFormatFromExt(ext: string): ImageFormat | null {
  switch (ext.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'jpeg';
    case 'png':
    case 'svg':
      return 'png';
    case 'webp':
      return 'webp';
    case 'avif':
      return 'avif';
    case 'tif':
    case 'tiff':
      return 'tiff';
    case 'gif':
      return 'gif';
    default:
      return null;
  }
}

export function resolveImageFormat(inputExt: string, format: ImageConvertOptions['format']): ImageFormat {
  if (format !== 'original') return format;
  const f = imageFormatFromExt(inputExt);
  if (!f) throw new Error(`Formato de imagem não suportado: .${inputExt}`);
  return f;
}

export interface ResizePlan {
  width: number;
  height: number;
  /** sharp fit mode. */
  fit: 'inside' | 'cover' | 'contain' | 'fill';
}

/** Target size from the (EXIF-oriented) source size; null = keep the original dimensions. */
export function planResize(src: { width: number; height: number }, r: ImageConvertOptions['resize']): ResizePlan | null {
  const { width: w, height: h } = src;
  if (!(w > 0 && h > 0)) return null;
  switch (r.mode) {
    case 'none':
      return null;
    case 'percent': {
      if (!(r.percent > 0) || r.percent === 100) return null;
      const pct = r.enlarge ? r.percent : Math.min(100, r.percent);
      if (pct === 100) return null;
      return { width: Math.max(1, Math.round((w * pct) / 100)), height: Math.max(1, Math.round((h * pct) / 100)), fit: 'fill' };
    }
    case 'fit': {
      const maxW = r.width > 0 ? r.width : Infinity;
      const maxH = r.height > 0 ? r.height : Infinity;
      if (maxW === Infinity && maxH === Infinity) return null;
      let scale = Math.min(maxW / w, maxH / h);
      if (!r.enlarge) scale = Math.min(1, scale);
      if (scale === 1) return null;
      return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), fit: 'inside' };
    }
    case 'exact': {
      if (!(r.width > 0 && r.height > 0)) throw new Error('Informe largura e altura para o tamanho exato.');
      return { width: Math.round(r.width), height: Math.round(r.height), fit: r.fit };
    }
  }
}

export interface EncodePlan {
  format: ImageFormat;
  /** Options passed to sharp's toFormat(). */
  options: Record<string, unknown>;
  /** Fill transparent areas (output without alpha support). */
  flatten: boolean;
}

/** Encoder settings for a format at a given quality. */
export function encodePlan(format: ImageFormat, o: Pick<ImageConvertOptions, 'compression' | 'palette'>, quality: number, hasAlpha: boolean): EncodePlan {
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const lossless = o.compression === 'lossless';
  const flatten = hasAlpha && !IMAGE_FORMATS[format].supportsAlpha;
  switch (format) {
    case 'jpeg':
      return { format, flatten, options: { quality: lossless ? 100 : q, mozjpeg: true, progressive: true, chromaSubsampling: lossless || q >= 90 ? '4:4:4' : '4:2:0' } };
    case 'png':
      return { format, flatten, options: o.palette && !lossless ? { compressionLevel: 9, palette: true, quality: q, effort: 7 } : { compressionLevel: 9, effort: 7 } };
    case 'webp':
      return { format, flatten, options: lossless ? { lossless: true, effort: 5 } : { quality: q, effort: 5, smartSubsample: true } };
    case 'avif':
      return { format, flatten, options: lossless ? { lossless: true, effort: 4 } : { quality: q, effort: 4 } };
    case 'tiff':
      return { format, flatten, options: lossless ? { compression: 'lzw' } : { compression: 'jpeg', quality: q } };
    case 'gif':
      return { format, flatten, options: { effort: 7 } };
  }
}

/** Warnings about option combinations the chosen format cannot honour. */
export function imageWarnings(format: ImageFormat, o: ImageConvertOptions, hasAlpha: boolean): string[] {
  const spec = IMAGE_FORMATS[format];
  const w: string[] = [];
  if (o.compression === 'lossless' && !spec.supportsLossless) w.push(`${spec.label} não tem modo sem perda; será usada qualidade 100.`);
  if (o.compression === 'target-size' && !spec.supportsTargetSize) w.push(`Tamanho máximo funciona com JPEG, WebP e AVIF; ${spec.label} usará a qualidade definida.`);
  if (hasAlpha && !spec.supportsAlpha) w.push(`${spec.label} não tem transparência; o fundo transparente vira branco.`);
  return w;
}

/**
 * Highest quality whose encoded size fits targetBytes (binary search, ~6 encodes).
 * Returns the lowest quality tried when even that does not fit.
 */
export async function searchQuality(
  encode: (quality: number) => Promise<number>,
  targetBytes: number,
  opts: { min?: number; max?: number; signal?: AbortSignal } = {}
): Promise<{ quality: number; bytes: number; fits: boolean }> {
  let lo = opts.min ?? 5;
  let hi = opts.max ?? 95;
  let best: { quality: number; bytes: number } | null = null;
  const top = await encode(hi);
  if (top <= targetBytes) return { quality: hi, bytes: top, fits: true };
  let lowest = { quality: hi, bytes: top };
  while (lo <= hi) {
    if (opts.signal?.aborted) break;
    const mid = Math.floor((lo + hi) / 2);
    const bytes = await encode(mid);
    if (bytes <= targetBytes) {
      best = { quality: mid, bytes };
      lo = mid + 1;
    } else {
      if (mid < lowest.quality) lowest = { quality: mid, bytes };
      hi = mid - 1;
    }
  }
  return best ? { ...best, fits: true } : { ...lowest, fits: false };
}

/** One-line human description of the settings (shown where FFmpeg modules show the command). */
export function describeImagePlan(format: ImageFormat, o: ImageConvertOptions): string {
  const parts = [IMAGE_FORMATS[format].label];
  if (o.compression === 'lossless') parts.push('sem perda');
  else if (o.compression === 'target-size' && IMAGE_FORMATS[format].supportsTargetSize) parts.push(`até ${o.targetKb} KB`);
  else if (IMAGE_FORMATS[format].lossy || (o.palette && (format === 'png' || format === 'gif'))) parts.push(`qualidade ${o.quality}`);
  if (format === 'jpeg') parts.push('mozjpeg progressivo');
  if (o.palette && format === 'png' && o.compression !== 'lossless') parts.push('paleta reduzida');
  const r = o.resize;
  if (r.mode === 'fit') parts.push(`caber em ${r.width || '∞'}×${r.height || '∞'} px`);
  if (r.mode === 'percent') parts.push(`${r.percent}% do tamanho`);
  if (r.mode === 'exact') parts.push(`${r.width}×${r.height} px (${r.fit === 'cover' ? 'cortar' : r.fit === 'contain' ? 'bordas' : 'esticar'})`);
  parts.push(o.keepMetadata ? 'mantém EXIF' : 'remove EXIF/GPS');
  return parts.join(' · ');
}
