import type { QualityLevel } from '../shared/media';

export type EffectiveVideoCodec = 'h264' | 'h265' | 'av1' | 'vp9' | 'mpeg2';

/** Bits per pixel per frame produced by H.264 at each quality level (empirical). */
const H264_BPP: Record<QualityLevel, number> = { 'very-high': 0.14, high: 0.09, medium: 0.06, low: 0.035 };
const CODEC_EFFICIENCY: Record<EffectiveVideoCodec, number> = { h264: 1, h265: 0.6, vp9: 0.65, av1: 0.5, mpeg2: 2.2 };
/** Encoding speed in frames/s at 1080p on an 8-thread CPU (presets used by the app). */
const REFERENCE_FPS: Record<EffectiveVideoCodec, number> = { h264: 90, h265: 22, vp9: 18, av1: 10, mpeg2: 220 };
const REF_PIXELS = 1920 * 1080;

export function estimateVideoBitrate(codec: EffectiveVideoCodec, quality: QualityLevel, width: number, height: number, fps: number): number {
  return H264_BPP[quality] * CODEC_EFFICIENCY[codec] * width * height * fps;
}

export function estimateEncodeSeconds(
  codec: EffectiveVideoCodec,
  width: number,
  height: number,
  fps: number,
  durationSec: number,
  cpuCount: number
): number {
  const pixels = Math.max(1, width * height);
  const cpuFactor = Math.min(2, Math.max(0.25, cpuCount / 8));
  const speed = REFERENCE_FPS[codec] * cpuFactor * (REF_PIXELS / pixels) ** 0.9;
  return (durationSec * fps) / speed;
}

export function estimateAudioBytes(
  durationSec: number,
  codec: { lossless: boolean; encoder: string },
  bitrateKbps: number,
  sampleRate: number,
  channels: number
): number {
  if (!codec.lossless) return (bitrateKbps * 1000 * durationSec) / 8;
  const bytesPerSample = codec.encoder === 'pcm_s24le' ? 3 : codec.encoder === 'pcm_f32le' ? 4 : 2;
  const pcm = sampleRate * channels * bytesPerSample * durationSec;
  // FLAC/ALAC typically compress music to ~60% of 16-bit PCM.
  return codec.encoder.startsWith('pcm_') ? pcm : pcm * 0.6;
}
