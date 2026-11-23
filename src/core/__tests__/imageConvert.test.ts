import { describe, expect, it } from 'vitest';
import type { ImageConvertOptions } from '../../shared/media';
import { DEFAULT_IMAGE_CONVERT } from '../../shared/presets';
import { describeImagePlan, encodePlan, imageFormatFromExt, imageWarnings, planResize, resolveImageFormat, searchQuality } from '../commands/imageConvert';

const resize = (o: Partial<ImageConvertOptions['resize']>): ImageConvertOptions['resize'] => ({ ...DEFAULT_IMAGE_CONVERT.resize, ...o });
const src = { width: 4000, height: 3000 };

describe('image formats', () => {
  it('maps extensions and resolves "original"', () => {
    expect(imageFormatFromExt('JPG')).toBe('jpeg');
    expect(imageFormatFromExt('tif')).toBe('tiff');
    expect(imageFormatFromExt('svg')).toBe('png');
    expect(imageFormatFromExt('bmp')).toBeNull();
    expect(resolveImageFormat('png', 'original')).toBe('png');
    expect(resolveImageFormat('png', 'webp')).toBe('webp');
    expect(() => resolveImageFormat('bmp', 'original')).toThrow(/não suportado/);
  });
});

describe('planResize', () => {
  it('fits inside a box without enlarging', () => {
    expect(planResize(src, resize({ mode: 'fit', width: 1920, height: 1920 }))).toEqual({ width: 1920, height: 1440, fit: 'inside' });
    expect(planResize({ width: 800, height: 600 }, resize({ mode: 'fit', width: 1920, height: 1920 }))).toBeNull();
    expect(planResize({ width: 800, height: 600 }, resize({ mode: 'fit', width: 1600, height: 0, enlarge: true }))).toEqual({ width: 1600, height: 1200, fit: 'inside' });
    expect(planResize(src, resize({ mode: 'fit', width: 0, height: 1000 }))).toEqual({ width: 1333, height: 1000, fit: 'inside' });
  });

  it('scales by percent and supports exact sizes', () => {
    expect(planResize(src, resize({ mode: 'percent', percent: 25 }))).toEqual({ width: 1000, height: 750, fit: 'fill' });
    expect(planResize(src, resize({ mode: 'percent', percent: 200 }))).toBeNull();
    expect(planResize(src, resize({ mode: 'exact', width: 1080, height: 1080, fit: 'cover' }))).toEqual({ width: 1080, height: 1080, fit: 'cover' });
    expect(() => planResize(src, resize({ mode: 'exact', width: 0, height: 10 }))).toThrow();
    expect(planResize(src, resize({ mode: 'none' }))).toBeNull();
  });
});

describe('encodePlan', () => {
  it('uses mozjpeg and flattens transparency for JPEG', () => {
    const p = encodePlan('jpeg', { compression: 'quality', palette: false }, 80, true);
    expect(p.options).toMatchObject({ quality: 80, mozjpeg: true, chromaSubsampling: '4:2:0' });
    expect(p.flatten).toBe(true);
    expect(encodePlan('jpeg', { compression: 'quality', palette: false }, 95, false).options['chromaSubsampling']).toBe('4:4:4');
  });

  it('handles lossless and palette modes', () => {
    expect(encodePlan('webp', { compression: 'lossless', palette: false }, 80, false).options).toMatchObject({ lossless: true });
    expect(encodePlan('png', { compression: 'quality', palette: true }, 70, true).options).toMatchObject({ palette: true, quality: 70 });
    expect(encodePlan('png', { compression: 'lossless', palette: true }, 70, true).options['palette']).toBeUndefined();
    expect(encodePlan('tiff', { compression: 'lossless', palette: false }, 70, false).options).toEqual({ compression: 'lzw' });
    expect(encodePlan('png', { compression: 'quality', palette: false }, 70, true).flatten).toBe(false);
  });

  it('warns about unsupported combinations', () => {
    const o = { ...DEFAULT_IMAGE_CONVERT, compression: 'target-size' as const };
    expect(imageWarnings('png', o, false)).toHaveLength(1);
    expect(imageWarnings('jpeg', { ...o, compression: 'lossless' }, true)).toHaveLength(2);
    expect(imageWarnings('webp', o, true)).toHaveLength(0);
  });
});

describe('searchQuality', () => {
  // Fake encoder: size grows linearly with quality.
  const encoder = (calls: number[]) => async (q: number) => {
    calls.push(q);
    return q * 10_000;
  };

  it('finds the highest quality under the target', async () => {
    const calls: number[] = [];
    const r = await searchQuality(encoder(calls), 500_000);
    expect(r).toEqual({ quality: 50, bytes: 500_000, fits: true });
    expect(calls.length).toBeLessThanOrEqual(9);
  });

  it('returns the maximum quality when it already fits', async () => {
    expect(await searchQuality(encoder([]), 10_000_000)).toMatchObject({ quality: 95, fits: true });
  });

  it('reports when even the minimum quality is too big', async () => {
    const r = await searchQuality(encoder([]), 10_000);
    expect(r.fits).toBe(false);
    expect(r.quality).toBe(5);
  });
});

describe('describeImagePlan', () => {
  it('summarizes the settings', () => {
    const text = describeImagePlan('jpeg', { ...DEFAULT_IMAGE_CONVERT, resize: resize({ mode: 'fit', width: 1920, height: 1920 }) });
    expect(text).toBe('JPEG · qualidade 80 · mozjpeg progressivo · caber em 1920×1920 px · remove EXIF/GPS');
  });
});
