// Photo conversion through the real sharp/libvips and the shared queue.
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ImageConvertOptions } from '../../shared/media';
import { DEFAULT_IMAGE_CONVERT } from '../../shared/presets';
import { probeImage } from '../media/imageTools';
import { BatchProcessingService } from '../services/BatchProcessingService';
import { ImageConverterService } from '../services/ImageConverterService';

const silentLog = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
let dir: string;
let photo: string;
let logo: string;
let queue: BatchProcessingService;
let service: ImageConverterService;

const opts = (o: Partial<ImageConvertOptions>): ImageConvertOptions => ({ ...DEFAULT_IMAGE_CONVERT, ...o, resize: { ...DEFAULT_IMAGE_CONVERT.resize, ...o.resize } });

async function convert(files: string[], o: Partial<ImageConvertOptions>, out = join(dir, 'out')): Promise<string[]> {
  const before = new Set(queue.snapshot().jobs.map((j) => j.id));
  await service.enqueue({ module: 'image-convert', files, outputDir: out, options: opts(o) });
  await queue.idle();
  const jobs = queue.snapshot().jobs.filter((j) => !before.has(j.id));
  for (const j of jobs) expect(`${j.title}: ${j.error ?? j.status}`).toBe(`${j.title}: done`);
  return jobs.flatMap((j) => j.outputs);
}

describe('image converter (sharp)', () => {
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'alp-img-'));
    await mkdir(join(dir, 'src'));
    // Noisy 4000×3000 "camera photo" stored sideways (EXIF orientation 6) with GPS data.
    const noise = Buffer.alloc(3000 * 4000 * 3);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 7919 + (i >> 9) * 31) % 256;
    photo = join(dir, 'src', 'IMG_0001.jpg');
    await sharp(noise, { raw: { width: 4000, height: 3000, channels: 3 } })
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'TestCam' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 33/1 0/1' } } })
      .jpeg({ quality: 95 })
      .toFile(photo);
    logo = join(dir, 'src', 'logo.png');
    await sharp({ create: { width: 600, height: 300, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 0.5 } } }).png().toFile(logo);

    queue = new BatchProcessingService({ binaries: () => ({ ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' }), concurrency: () => 2, log: silentLog, emit: () => {} });
    service = new ImageConverterService({ queue, concurrency: () => 2 });
  });

  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('probes with EXIF orientation applied', async () => {
    const info = await probeImage(photo);
    expect(info.image).toEqual({ format: 'JPEG', width: 3000, height: 4000, hasAlpha: false });
    expect((await probeImage(logo)).image?.hasAlpha).toBe(true);
  });

  it('compresses and resizes, rotating upright and stripping GPS', async () => {
    const [out] = await convert([photo], { format: 'jpeg', quality: 75, resize: { ...DEFAULT_IMAGE_CONVERT.resize, mode: 'fit', width: 1600, height: 1600 } });
    const meta = await sharp(out as string).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 1600]);
    expect(meta.orientation ?? 1).toBe(1);
    expect(meta.exif).toBeUndefined();
    expect((await stat(out as string)).size).toBeLessThan((await stat(photo)).size / 3);
  });

  it('keeps EXIF when asked', async () => {
    const [out] = await convert([photo], { format: 'jpeg', keepMetadata: true, resize: { ...DEFAULT_IMAGE_CONVERT.resize, mode: 'percent', percent: 25 } }, join(dir, 'keep'));
    const meta = await sharp(out as string).metadata();
    expect(meta.exif).toBeDefined();
    expect([meta.width, meta.height]).toEqual([750, 1000]);
  });

  it('reaches a target size, and warns when it is impossible', async () => {
    const fit = (px: number) => ({ ...DEFAULT_IMAGE_CONVERT.resize, mode: 'fit' as const, width: px, height: px });
    const [out] = await convert([photo], { format: 'webp', compression: 'target-size', targetKb: 300, resize: fit(1000) }, join(dir, 'target'));
    expect((await stat(out as string)).size).toBeLessThanOrEqual(300 * 1024);
    // Pure noise at 4000 px cannot fit 20 KB even at the lowest quality.
    const p = await service.preview({ module: 'image-convert', files: [photo], outputDir: dir, options: opts({ format: 'jpeg', compression: 'target-size', targetKb: 20 }) });
    expect(p.warnings.some((w) => w.includes('qualidade mínima'))).toBe(true);
  });

  it('handles transparency, palette PNG, AVIF and lossless', async () => {
    const [jpg] = await convert([logo], { format: 'jpeg' }, join(dir, 'alpha'));
    expect((await sharp(jpg as string).metadata()).hasAlpha).toBe(false);
    const [png] = await convert([logo], { format: 'png', palette: true }, join(dir, 'palette'));
    // paletteBitDepth is reported at runtime but missing from sharp 0.33's typings.
    expect(((await sharp(png as string).metadata()) as { paletteBitDepth?: number }).paletteBitDepth).toBeDefined();
    const [avif] = await convert([photo], { format: 'avif', quality: 50, resize: { ...DEFAULT_IMAGE_CONVERT.resize, mode: 'fit', width: 800, height: 800 } }, join(dir, 'avif'));
    expect((await sharp(avif as string).metadata()).format).toBe('heif');
    const [webp] = await convert([logo], { format: 'webp', compression: 'lossless' }, join(dir, 'lossless'));
    expect((await sharp(webp as string).metadata()).hasAlpha).toBe(true);
  });

  it('crops to an exact size and never overwrites existing files', async () => {
    const out = join(dir, 'exact');
    const first = await convert([photo], { format: 'jpeg', resize: { ...DEFAULT_IMAGE_CONVERT.resize, mode: 'exact', width: 1080, height: 1080, fit: 'cover' } }, out);
    const second = await convert([photo], { format: 'jpeg', resize: { ...DEFAULT_IMAGE_CONVERT.resize, mode: 'exact', width: 1080, height: 1080, fit: 'cover' } }, out);
    expect((await sharp(first[0] as string).metadata()).width).toBe(1080);
    expect(second[0]).toMatch(/IMG_0001 \(1\)\.jpg$/);
  });

  it('previews with the real size of the first photo', async () => {
    const p = await service.preview({ module: 'image-convert', files: [photo, logo], outputDir: dir, options: opts({ format: 'webp', quality: 70 }) });
    expect(p.jobs).toBe(2);
    expect(p.command).toMatch(/IMG_0001\.jpg: .* → .*\(−\d+%\)/);
    expect(p.estimatedBytes).toBeGreaterThan(0);
    expect(p.warnings).toEqual([]);
  });
});
