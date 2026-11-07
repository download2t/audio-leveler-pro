import type { ChannelsOption, MediaInfo, QualityLevel, VideoAudioCodec, VideoCodec, VideoConvertOptions, VideoFormat } from '../../shared/media';
import { estimateEncodeSeconds, estimateVideoBitrate, type EffectiveVideoCodec } from '../estimates';
import { HEAD, baseNameNoExt, joinPath, requireVideo, sizeFilter, tail, type BuildContext, type BuildResult } from './common';

type EffectiveAudioCodec = Exclude<VideoAudioCodec, 'copy' | 'none'> | 'mp2';

export interface VideoFormatSpec {
  label: string;
  ext: string;
  muxer: string;
  videoCodecs: readonly EffectiveVideoCodec[];
  audioCodecs: readonly EffectiveAudioCodec[];
  faststart: boolean;
}

export const VIDEO_FORMATS: Record<VideoFormat, VideoFormatSpec> = {
  mp4: { label: 'MP4', ext: 'mp4', muxer: 'mp4', videoCodecs: ['h264', 'h265', 'av1', 'vp9'], audioCodecs: ['aac', 'mp3', 'opus'], faststart: true },
  mkv: { label: 'MKV', ext: 'mkv', muxer: 'matroska', videoCodecs: ['h264', 'h265', 'av1', 'vp9'], audioCodecs: ['aac', 'mp3', 'opus', 'vorbis', 'flac'], faststart: false },
  avi: { label: 'AVI', ext: 'avi', muxer: 'avi', videoCodecs: ['h264'], audioCodecs: ['mp3', 'aac'], faststart: false },
  mov: { label: 'MOV', ext: 'mov', muxer: 'mov', videoCodecs: ['h264', 'h265'], audioCodecs: ['aac'], faststart: true },
  webm: { label: 'WEBM', ext: 'webm', muxer: 'webm', videoCodecs: ['vp9', 'av1'], audioCodecs: ['opus', 'vorbis'], faststart: false },
  mpeg: { label: 'MPEG', ext: 'mpeg', muxer: 'mpeg', videoCodecs: ['mpeg2'], audioCodecs: ['mp2'], faststart: false },
  flv: { label: 'FLV', ext: 'flv', muxer: 'flv', videoCodecs: ['h264'], audioCodecs: ['aac', 'mp3'], faststart: false }
};

export const VIDEO_CODEC_LABELS: Record<EffectiveVideoCodec, string> = {
  h264: 'H.264', h265: 'H.265 (HEVC)', av1: 'AV1', vp9: 'VP9', mpeg2: 'MPEG-2'
};

const CRF: Record<'h264' | 'h265' | 'vp9' | 'av1', Record<QualityLevel, number>> = {
  h264: { 'very-high': 18, high: 21, medium: 24, low: 28 },
  h265: { 'very-high': 20, high: 24, medium: 27, low: 31 },
  vp9: { 'very-high': 24, high: 31, medium: 36, low: 42 },
  av1: { 'very-high': 24, high: 30, medium: 36, low: 42 }
};
const MPEG2_Q: Record<QualityLevel, number> = { 'very-high': 2, high: 4, medium: 6, low: 9 };

export function videoFormatFromExt(ext: string): VideoFormat | null {
  const e = ext.toLowerCase();
  if (e in VIDEO_FORMATS) return e as VideoFormat;
  if (e === 'mpg') return 'mpeg';
  if (e === 'm4v') return 'mp4';
  return null;
}

export function resolveVideoCodec(format: VideoFormat, requested: VideoCodec): { codec: EffectiveVideoCodec; warning?: string } {
  const allowed = VIDEO_FORMATS[format].videoCodecs;
  if (allowed.includes(requested)) return { codec: requested };
  const codec = allowed[0] as EffectiveVideoCodec;
  return { codec, warning: `${VIDEO_FORMATS[format].label} não suporta ${VIDEO_CODEC_LABELS[requested]}; será usado ${VIDEO_CODEC_LABELS[codec]}.` };
}

export function resolveAudioCodecFor(format: VideoFormat, requested: VideoAudioCodec): { codec: EffectiveAudioCodec | 'copy' | 'none'; warning?: string } {
  if (requested === 'copy' || requested === 'none') return { codec: requested };
  const allowed = VIDEO_FORMATS[format].audioCodecs;
  if (allowed.includes(requested)) return { codec: requested };
  const codec = allowed[0] as EffectiveAudioCodec;
  return { codec, warning: `${VIDEO_FORMATS[format].label} não suporta áudio ${requested.toUpperCase()}; será usado ${codec.toUpperCase()}.` };
}

export function videoEncodeArgs(codec: EffectiveVideoCodec, quality: QualityLevel, format: VideoFormat): string[] {
  switch (codec) {
    case 'h264':
      return ['-c:v', 'libx264', '-preset', 'medium', '-crf', String(CRF.h264[quality]), '-pix_fmt', 'yuv420p'];
    case 'h265': {
      const args = ['-c:v', 'libx265', '-preset', 'medium', '-crf', String(CRF.h265[quality]), '-pix_fmt', 'yuv420p', '-x265-params', 'log-level=error'];
      if (format === 'mp4' || format === 'mov') args.push('-tag:v', 'hvc1');
      return args;
    }
    case 'vp9':
      return ['-c:v', 'libvpx-vp9', '-crf', String(CRF.vp9[quality]), '-b:v', '0', '-row-mt', '1', '-deadline', 'good', '-cpu-used', '4', '-pix_fmt', 'yuv420p'];
    case 'av1':
      return ['-c:v', 'libaom-av1', '-crf', String(CRF.av1[quality]), '-b:v', '0', '-cpu-used', '6', '-row-mt', '1', '-pix_fmt', 'yuv420p'];
    case 'mpeg2':
      return ['-c:v', 'mpeg2video', '-q:v', String(MPEG2_Q[quality]), '-pix_fmt', 'yuv420p'];
  }
}

const AUDIO_ENCODERS: Record<EffectiveAudioCodec, string> = {
  aac: 'aac', mp3: 'libmp3lame', opus: 'libopus', vorbis: 'libvorbis', flac: 'flac', mp2: 'mp2'
};

export function videoAudioArgs(
  codec: EffectiveAudioCodec | 'copy' | 'none',
  bitrateKbps: number,
  channels: ChannelsOption,
  source: MediaInfo['audio']
): string[] {
  if (codec === 'none' || !source) return ['-an'];
  if (codec === 'copy') return ['-c:a', 'copy'];
  const args = ['-c:a', AUDIO_ENCODERS[codec]];
  if (codec !== 'flac') args.push('-b:a', `${Math.min(codec === 'mp3' ? 320 : codec === 'mp2' ? 384 : 512, Math.max(32, bitrateKbps))}k`);
  const maxChannels = codec === 'mp3' || codec === 'mp2' ? 2 : 8;
  const target = channels === 'original' ? source.channels : channels;
  if (channels !== 'original' || source.channels > maxChannels) args.push('-ac', String(Math.min(target, maxChannels)));
  return args;
}

const PRESET_HEIGHT: Record<string, number> = { '2160': 2160, '1440': 1440, '1080': 1080, '720': 720, '480': 480 };

/** Scale filter + resulting size. Presets refer to the short side, so portrait videos stay portrait. */
export function resolutionFilter(o: Pick<VideoConvertOptions, 'resolution' | 'customWidth' | 'customHeight'>, video: NonNullable<MediaInfo['video']>): {
  filter: string | null;
  width: number;
  height: number;
} {
  if (o.resolution === 'original') return { filter: null, width: video.width, height: video.height };
  if (o.resolution === 'custom') {
    const filter = sizeFilter(o.customWidth, o.customHeight);
    const width = o.customWidth > 0 ? o.customWidth : Math.round((video.width * o.customHeight) / video.height);
    const height = o.customHeight > 0 ? o.customHeight : Math.round((video.height * o.customWidth) / video.width);
    return { filter, width: width || video.width, height: height || video.height };
  }
  const short = PRESET_HEIGHT[o.resolution] ?? video.height;
  const portrait = video.height > video.width;
  if ((portrait ? video.width : video.height) === short) return { filter: null, width: video.width, height: video.height };
  return portrait
    ? { filter: `scale=${short}:-2`, width: short, height: Math.round((video.height * short) / video.width) }
    : { filter: `scale=-2:${short}`, width: Math.round((video.width * short) / video.height), height: short };
}

export function buildVideoConvert(ctx: BuildContext, o: VideoConvertOptions): BuildResult {
  const info = ctx.inputs[0];
  if (!info) throw new Error('Nenhum arquivo de entrada.');
  requireVideo(info);
  const video = info.video as NonNullable<MediaInfo['video']>;
  const format = VIDEO_FORMATS[o.format];
  const warnings: string[] = [];
  const vc = resolveVideoCodec(o.format, o.videoCodec);
  const ac = resolveAudioCodecFor(o.format, o.audioCodec);
  if (vc.warning) warnings.push(vc.warning);
  if (ac.warning) warnings.push(ac.warning);

  const size = resolutionFilter(o, video);
  const fps = o.fps === 'original' ? video.fps || 30 : o.fps;
  const output = joinPath(ctx.workDir, `output.${format.ext}`);

  const args = [...HEAD, '-i', info.path, '-map', '0:v:0', '-map', '0:a:0?'];
  args.push(...videoEncodeArgs(vc.codec, o.quality, o.format));
  if (size.filter) args.push('-vf', size.filter);
  if (o.fps !== 'original') args.push('-r', String(o.fps));
  args.push(...videoAudioArgs(ac.codec, o.audioBitrateKbps, o.audioChannels, info.audio));
  args.push('-map_metadata', o.keepMetadata ? '0' : '-1');
  if (format.faststart) args.push('-movflags', '+faststart');
  args.push(...tail(format.muxer, output));

  const videoBps = estimateVideoBitrate(vc.codec, o.quality, size.width, size.height, fps);
  const audioBps = !info.audio || ac.codec === 'none' ? 0 : ac.codec === 'copy' ? (info.audio.bitRate ?? 128_000) : o.audioBitrateKbps * 1000;

  return {
    steps: [{ args, durationSec: info.durationSec, label: 'Convertendo' }],
    outputs: [{ path: output, name: `${baseNameNoExt(info.path)}.${format.ext}` }],
    prepare: [],
    warnings,
    estimatedBytes: ((videoBps + audioBps) / 8) * info.durationSec * 1.02,
    estimatedSeconds: estimateEncodeSeconds(vc.codec, size.width, size.height, fps, info.durationSec, ctx.cpuCount)
  };
}
