import type { AudioConvertOptions, AudioFormat, ChannelsOption, MediaInfo, SampleRateOption } from '../../shared/media';
import { estimateAudioBytes } from '../estimates';
import { HEAD, baseNameNoExt, joinPath, requireAudio, tail, type BuildContext, type BuildResult } from './common';

export interface AudioCodecSpec {
  id: string;
  label: string;
  encoder: string;
  lossless: boolean;
  defaultBitrate: number;
  maxBitrate: number;
  /** Supported sample rates (undefined = any). */
  sampleRates?: readonly number[];
  maxChannels?: number;
}

export interface AudioFormatSpec {
  label: string;
  ext: string;
  muxer: string;
  codecs: readonly AudioCodecSpec[];
  cover: boolean;
  metadata: boolean;
}

const MPEG_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];

const lossless = (id: string, label: string, encoder: string): AudioCodecSpec => ({
  id, label, encoder, lossless: true, defaultBitrate: 0, maxBitrate: 0
});

export const AUDIO_FORMATS: Record<AudioFormat, AudioFormatSpec> = {
  mp3: {
    label: 'MP3', ext: 'mp3', muxer: 'mp3', cover: true, metadata: true,
    codecs: [{ id: 'mp3', label: 'MP3 (LAME)', encoder: 'libmp3lame', lossless: false, defaultBitrate: 192, maxBitrate: 320, sampleRates: MPEG_RATES, maxChannels: 2 }]
  },
  wav: {
    label: 'WAV', ext: 'wav', muxer: 'wav', cover: false, metadata: true,
    codecs: [lossless('pcm16', 'PCM 16 bits', 'pcm_s16le'), lossless('pcm24', 'PCM 24 bits', 'pcm_s24le'), lossless('pcm32f', 'PCM 32 bits float', 'pcm_f32le')]
  },
  flac: { label: 'FLAC', ext: 'flac', muxer: 'flac', cover: true, metadata: true, codecs: [lossless('flac', 'FLAC', 'flac')] },
  aac: {
    label: 'AAC (ADTS)', ext: 'aac', muxer: 'adts', cover: false, metadata: false,
    codecs: [{ id: 'aac', label: 'AAC-LC', encoder: 'aac', lossless: false, defaultBitrate: 192, maxBitrate: 512 }]
  },
  m4a: {
    label: 'M4A', ext: 'm4a', muxer: 'ipod', cover: true, metadata: true,
    codecs: [
      { id: 'aac', label: 'AAC-LC', encoder: 'aac', lossless: false, defaultBitrate: 192, maxBitrate: 512 },
      lossless('alac', 'ALAC (sem perda)', 'alac')
    ]
  },
  ogg: {
    label: 'OGG', ext: 'ogg', muxer: 'ogg', cover: false, metadata: true,
    codecs: [
      { id: 'vorbis', label: 'Vorbis', encoder: 'libvorbis', lossless: false, defaultBitrate: 192, maxBitrate: 500 },
      { id: 'opus', label: 'Opus', encoder: 'libopus', lossless: false, defaultBitrate: 128, maxBitrate: 510, sampleRates: [48000] }
    ]
  },
  opus: {
    label: 'OPUS', ext: 'opus', muxer: 'opus', cover: false, metadata: true,
    codecs: [{ id: 'opus', label: 'Opus', encoder: 'libopus', lossless: false, defaultBitrate: 128, maxBitrate: 510, sampleRates: [48000] }]
  },
  wma: {
    label: 'WMA', ext: 'wma', muxer: 'asf', cover: false, metadata: true,
    codecs: [{ id: 'wma', label: 'WMA v2', encoder: 'wmav2', lossless: false, defaultBitrate: 192, maxBitrate: 320, sampleRates: MPEG_RATES, maxChannels: 2 }]
  }
};

export function resolveAudioCodec(format: AudioFormat, codecId: string): AudioCodecSpec {
  const codecs = AUDIO_FORMATS[format].codecs;
  return codecs.find((c) => c.id === codecId) ?? (codecs[0] as AudioCodecSpec);
}

/** Maps a file extension to the audio format used when "keep original format" is selected. */
export function audioFormatFromExt(ext: string): AudioFormat | null {
  const e = ext.toLowerCase();
  if (e in AUDIO_FORMATS) return e as AudioFormat;
  if (e === 'oga') return 'ogg';
  if (e === 'aif' || e === 'aiff') return 'wav';
  return null;
}

function closestRate(rates: readonly number[], target: number): number {
  const notAbove = rates.filter((r) => r <= target);
  return notAbove.length ? Math.max(...notAbove) : Math.min(...rates);
}

export interface AudioEncodeSettings {
  bitrateKbps: number;
  sampleRate: SampleRateOption;
  channels: ChannelsOption;
}

/** Encoder arguments (codec, bitrate, sample rate, channels) plus warnings about adjustments. */
export function audioEncodeArgs(
  spec: AudioCodecSpec,
  s: AudioEncodeSettings,
  source: MediaInfo['audio']
): { args: string[]; warnings: string[]; sampleRate: number; channels: number; bitrateKbps: number } {
  const args = ['-c:a', spec.encoder];
  const warnings: string[] = [];
  let bitrate = 0;
  if (!spec.lossless) {
    bitrate = Math.min(Math.max(32, Math.round(s.bitrateKbps || spec.defaultBitrate)), spec.maxBitrate);
    if (bitrate !== s.bitrateKbps) warnings.push(`Bitrate ajustado para ${bitrate} kbps (limite do codec ${spec.label}).`);
    args.push('-b:a', `${bitrate}k`);
  }

  const sourceRate = source?.sampleRate || 44100;
  let rate = s.sampleRate === 'original' ? sourceRate : s.sampleRate;
  if (spec.sampleRates && !spec.sampleRates.includes(rate)) {
    const adjusted = closestRate(spec.sampleRates, rate);
    warnings.push(`${spec.label} não suporta ${rate} Hz; será usado ${adjusted} Hz.`);
    rate = adjusted;
    args.push('-ar', String(rate));
  } else if (s.sampleRate !== 'original') {
    args.push('-ar', String(rate));
  }

  const sourceChannels = source?.channels || 2;
  let channels = s.channels === 'original' ? sourceChannels : s.channels;
  if (spec.maxChannels && channels > spec.maxChannels) {
    channels = spec.maxChannels;
    warnings.push(`${spec.label} suporta no máximo ${channels} canais; será feito downmix.`);
    args.push('-ac', String(channels));
  } else if (s.channels !== 'original') {
    args.push('-ac', String(channels));
  }
  return { args, warnings, sampleRate: rate, channels, bitrateKbps: bitrate };
}

export function metadataArgs(info: MediaInfo, keep: boolean): string[] {
  if (!keep) return ['-map_metadata', '-1'];
  // Ogg/Opus keep tags on the audio stream; lift them to the global level.
  return ['-map_metadata', /ogg|opus/.test(info.formatName) ? '0:s:a:0' : '0'];
}

export function buildAudioConvert(ctx: BuildContext, o: AudioConvertOptions): BuildResult {
  const info = ctx.inputs[0];
  if (!info) throw new Error('Nenhum arquivo de entrada.');
  requireAudio(info);
  const format = AUDIO_FORMATS[o.format];
  const codec = resolveAudioCodec(o.format, o.codec);
  const enc = audioEncodeArgs(codec, o, info.audio);
  const output = joinPath(ctx.workDir, `output.${format.ext}`);
  const withCover = format.cover && o.keepMetadata && info.hasCover;

  const args = [...HEAD, '-i', info.path, '-map', '0:a:0'];
  if (withCover) args.push('-map', '0:v:0?', '-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  else args.push('-vn');
  args.push(...enc.args);
  args.push(...metadataArgs(info, o.keepMetadata && format.metadata));
  if (o.format === 'mp3') args.push('-id3v2_version', '3');
  args.push(...tail(format.muxer, output));

  return {
    steps: [{ args, durationSec: info.durationSec, label: 'Convertendo' }],
    outputs: [{ path: output, name: `${baseNameNoExt(info.path)}.${format.ext}` }],
    prepare: [],
    warnings: enc.warnings,
    estimatedBytes: estimateAudioBytes(info.durationSec, codec, enc.bitrateKbps, enc.sampleRate, enc.channels),
    // Audio encoding runs at roughly 80× realtime.
    estimatedSeconds: info.durationSec / 80
  };
}
