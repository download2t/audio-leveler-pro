import type { AudioProbe, ContainerFormat, ExportSettings, GainResult, OutputFormat } from '../shared/types';

export interface EncoderSpec {
  format: ContainerFormat;
  ext: string;
  muxer: string;
  codec: string;
  lossless: boolean;
  supportsCover: boolean;
  supportsMetadata: boolean;
  sampleFmt?: string;
  defaultBitrateKbps: number;
  maxBitrateKbps: number;
}

const EXTENSION_FORMATS: Record<string, ContainerFormat> = {
  mp3: 'mp3',
  flac: 'flac',
  wav: 'wav',
  m4a: 'm4a',
  aac: 'aac',
  ogg: 'ogg'
};

const LOSSLESS_CODECS = /^(flac|alac|pcm_|wavpack|ape|tta|mlp|truehd)/;
const MP3_BITRATES = [32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];

/** ReplayGain tags become wrong after the gain is applied, so they are removed. */
export const REPLAYGAIN_TAGS = [
  'REPLAYGAIN_TRACK_GAIN',
  'REPLAYGAIN_TRACK_PEAK',
  'REPLAYGAIN_ALBUM_GAIN',
  'REPLAYGAIN_ALBUM_PEAK'
];

export function targetContainer(inputExt: string, outputFormat: OutputFormat): ContainerFormat {
  if (outputFormat !== 'original') return outputFormat;
  const format = EXTENSION_FORMATS[inputExt.toLowerCase()];
  if (!format) throw new Error(`Formato não suportado: .${inputExt}`);
  return format;
}

export function isLosslessCodec(codec: string): boolean {
  return LOSSLESS_CODECS.test(codec);
}

function sourceBits(probe: AudioProbe): number {
  if (probe.bitsPerSample !== null) return probe.bitsPerSample;
  // Lossy decoders report no bit depth; 16 bits is the natural PCM target.
  return 16;
}

export function resolveEncoder(format: ContainerFormat, probe: AudioProbe): EncoderSpec {
  const bits = sourceBits(probe);
  switch (format) {
    case 'mp3':
      return {
        format, ext: 'mp3', muxer: 'mp3', codec: 'libmp3lame', lossless: false,
        supportsCover: true, supportsMetadata: true, defaultBitrateKbps: 320, maxBitrateKbps: 320
      };
    case 'flac':
      return {
        format, ext: 'flac', muxer: 'flac', codec: 'flac', lossless: true,
        supportsCover: true, supportsMetadata: true, sampleFmt: bits > 16 ? 's32' : 's16',
        defaultBitrateKbps: 0, maxBitrateKbps: 0
      };
    case 'wav': {
      let codec = 'pcm_s16le';
      if (probe.codec.startsWith('pcm_f')) codec = 'pcm_f32le';
      else if (bits > 24) codec = 'pcm_s32le';
      else if (bits > 16) codec = 'pcm_s24le';
      return {
        format, ext: 'wav', muxer: 'wav', codec, lossless: true,
        supportsCover: false, supportsMetadata: true, defaultBitrateKbps: 0, maxBitrateKbps: 0
      };
    }
    case 'm4a':
      if (probe.codec === 'alac') {
        return {
          format, ext: 'm4a', muxer: 'ipod', codec: 'alac', lossless: true,
          supportsCover: true, supportsMetadata: true, sampleFmt: bits > 16 ? 's32p' : 's16p',
          defaultBitrateKbps: 0, maxBitrateKbps: 0
        };
      }
      return {
        format, ext: 'm4a', muxer: 'ipod', codec: 'aac', lossless: false,
        supportsCover: true, supportsMetadata: true, defaultBitrateKbps: 256, maxBitrateKbps: 512
      };
    case 'aac':
      return {
        format, ext: 'aac', muxer: 'adts', codec: 'aac', lossless: false,
        supportsCover: false, supportsMetadata: false, defaultBitrateKbps: 256, maxBitrateKbps: 512
      };
    case 'ogg':
      if (probe.codec === 'opus') {
        return {
          format, ext: 'ogg', muxer: 'ogg', codec: 'libopus', lossless: false,
          supportsCover: false, supportsMetadata: true, defaultBitrateKbps: 160, maxBitrateKbps: 510
        };
      }
      return {
        format, ext: 'ogg', muxer: 'ogg', codec: 'libvorbis', lossless: false,
        supportsCover: false, supportsMetadata: true, defaultBitrateKbps: 256, maxBitrateKbps: 500
      };
  }
}

function nearest(values: readonly number[], target: number): number {
  return values.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best));
}

/** Bitrate in kbps for lossy encoders, null for lossless ones. */
export function resolveBitrateKbps(
  probe: AudioProbe,
  spec: EncoderSpec,
  settings: Pick<ExportSettings, 'bitrateMode' | 'customBitrateKbps'>
): number | null {
  if (spec.lossless) return null;
  let kbps: number;
  if (settings.bitrateMode === 'custom') {
    kbps = settings.customBitrateKbps;
  } else if (probe.bitRate === null || isLosslessCodec(probe.codec)) {
    // A lossless source has no meaningful "original" lossy bitrate.
    kbps = spec.defaultBitrateKbps;
  } else {
    kbps = Math.round(probe.bitRate / 1000);
  }
  kbps = Math.min(Math.max(Math.round(kbps), 32), spec.maxBitrateKbps);
  return spec.codec === 'libmp3lame' ? nearest(MP3_BITRATES, kbps) : kbps;
}

/** One decoding pass that measures sample peak/RMS (astats) and loudness/true peak (loudnorm). */
export function buildAnalysisArgs(input: string): string[] {
  return [
    '-hide_banner', '-nostdin', '-nostats',
    '-i', input,
    '-map', '0:a:0', '-vn', '-sn', '-dn',
    // astats first: loudnorm resamples to 192 kHz internally.
    '-af', 'astats=metadata=0,loudnorm=I=-23:TP=-1:LRA=11:print_format=json',
    '-progress', 'pipe:1',
    '-f', 'null', '-'
  ];
}

export function dbToLinear(db: number): number {
  return 10 ** (db / 20);
}

export function buildGainFilter(gain: Pick<GainResult, 'gainDb' | 'useLimiter'>, ceilingDb: number): string {
  const filters = [`volume=${gain.gainDb.toFixed(2)}dB`];
  if (gain.useLimiter) {
    const limit = Math.min(1, Math.max(0.0625, dbToLinear(ceilingDb)));
    filters.push(`alimiter=limit=${limit.toFixed(4)}:attack=5:release=50:level=false:latency=true`);
  }
  return filters.join(',');
}

export interface ExportArgsOptions {
  input: string;
  output: string;
  probe: AudioProbe;
  spec: EncoderSpec;
  gain: Pick<GainResult, 'gainDb' | 'useLimiter'>;
  settings: ExportSettings;
  ceilingDb: number;
}

export function buildExportArgs(o: ExportArgsOptions): string[] {
  const { probe, spec, settings } = o;
  const withCover = spec.supportsCover && settings.keepCover && probe.hasCover;
  const args = ['-hide_banner', '-nostdin', '-nostats', '-y', '-i', o.input, '-map', '0:a:0'];
  if (withCover) args.push('-map', '0:v:0?');

  args.push('-af', buildGainFilter(o.gain, o.ceilingDb), '-c:a', spec.codec);
  const bitrate = resolveBitrateKbps(probe, spec, settings);
  if (bitrate !== null) args.push('-b:a', `${bitrate}k`);
  if (spec.sampleFmt) args.push('-sample_fmt', spec.sampleFmt);
  if (spec.codec === 'libmp3lame') args.push('-id3v2_version', '3', '-write_id3v1', '1');

  if (withCover) args.push('-c:v', 'copy', '-disposition:v:0', 'attached_pic');
  else args.push('-vn');

  if (settings.keepMetadata && spec.supportsMetadata) {
    // Ogg stores tags on the audio stream; lift them to the global level.
    const fromStream = /ogg/.test(probe.formatName);
    args.push('-map_metadata', fromStream ? '0:s:a:0' : '0');
    for (const tag of REPLAYGAIN_TAGS) {
      args.push('-metadata', `${tag}=`, '-metadata:s:a:0', `${tag}=`);
    }
  } else {
    args.push('-map_metadata', '-1', '-map_metadata:s:a:0', '-1');
  }

  args.push('-progress', 'pipe:1', '-f', spec.muxer, o.output);
  return args;
}
