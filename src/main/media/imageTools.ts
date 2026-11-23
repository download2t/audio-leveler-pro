import { stat, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { encodePlan, planResize, searchQuality } from '../../core/commands/imageConvert';
import type { ImageConvertOptions, ImageFormat, MediaInfo } from '../../shared/media';

// Keep memory bounded when many photos are processed in parallel, and never keep
// files open: on Windows an open handle would lock the user's originals.
sharp.cache({ memory: 256, items: 50, files: 0 });

const SWAPS_AXES = new Set([5, 6, 7, 8]);

/** Photo description in the same shape as audio/video files (width/height follow EXIF rotation). */
export async function probeImage(path: string): Promise<MediaInfo> {
  const [meta, s] = await Promise.all([sharp(path, { failOn: 'none' }).metadata(), stat(path)]);
  const swap = SWAPS_AXES.has(meta.orientation ?? 1);
  const width = (swap ? meta.height : meta.width) ?? 0;
  const height = (swap ? meta.width : meta.height) ?? 0;
  return {
    path,
    sizeBytes: s.size,
    durationSec: 0,
    formatName: meta.format ?? 'unknown',
    bitRate: null,
    video: null,
    audio: null,
    hasCover: false,
    tags: {},
    image: { format: (meta.format ?? 'unknown').toUpperCase(), width, height, hasAlpha: meta.hasAlpha ?? false }
  };
}

export interface RenderResult {
  data: Buffer;
  width: number;
  height: number;
  quality: number;
  /** false when a target size could not be reached even at the lowest quality. */
  fitsTarget: boolean;
}

async function encodeOnce(input: string, format: ImageFormat, o: ImageConvertOptions, quality: number, hasAlpha: boolean, size: { width: number; height: number }) {
  const plan = encodePlan(format, o, quality, hasAlpha);
  // rotate() with no argument applies the EXIF orientation, so photos are never sideways.
  let img = sharp(input, { failOn: 'none', limitInputPixels: false }).rotate();
  const resize = planResize(size, o.resize);
  if (resize) img = img.resize({ width: resize.width, height: resize.height, fit: resize.fit, background: { r: 255, g: 255, b: 255, alpha: plan.flatten ? 1 : 0 } });
  if (plan.flatten) img = img.flatten({ background: '#ffffff' });
  if (o.keepMetadata) img = img.withMetadata();
  return img.toFormat(format, plan.options).toBuffer({ resolveWithObject: true });
}

/** Encodes one photo in memory (used by the preview and the queue). */
export async function renderImage(input: string, info: MediaInfo, format: ImageFormat, o: ImageConvertOptions, signal?: AbortSignal): Promise<RenderResult> {
  const image = info.image;
  if (!image) throw new Error('O arquivo não é uma imagem suportada.');
  const size = { width: image.width, height: image.height };
  const searchable = o.compression === 'target-size' && (format === 'jpeg' || format === 'webp' || format === 'avif');

  if (searchable) {
    // Every quality tried is kept, so the chosen one is never encoded twice.
    const outputs = new Map<number, Awaited<ReturnType<typeof encodeOnce>>>();
    const found = await searchQuality(
      async (q) => {
        const out = await encodeOnce(input, format, o, q, image.hasAlpha, size);
        outputs.set(q, out);
        return out.data.length;
      },
      Math.max(1, o.targetKb) * 1024,
      { signal }
    );
    const out = outputs.get(found.quality);
    if (!out) throw new Error('Falha ao codificar a imagem.');
    return { data: out.data, width: out.info.width, height: out.info.height, quality: found.quality, fitsTarget: found.fits };
  }

  const out = await encodeOnce(input, format, o, o.quality, image.hasAlpha, size);
  return { data: out.data, width: out.info.width, height: out.info.height, quality: o.quality, fitsTarget: true };
}

export async function convertImageFile(input: string, output: string, info: MediaInfo, format: ImageFormat, o: ImageConvertOptions, signal?: AbortSignal): Promise<RenderResult> {
  const result = await renderImage(input, info, format, o, signal);
  if (signal?.aborted) throw new Error('Operação cancelada');
  await writeFile(output, result.data);
  return result;
}
