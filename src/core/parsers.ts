import type { MediaInfo } from '../shared/media';
import type { AudioProbe, AudioTags, LoudnessAnalysis } from '../shared/types';

/** Parses numbers like "-14.2", "-6.20 dB", 3.5. Returns null for "-inf", "nan", garbage. */
export function parseDbValue(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== 'string') return null;
  const match = raw.trim().match(/^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?/i);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

export interface LoudnormStats {
  integratedLufs: number | null;
  truePeakDb: number | null;
  lra: number | null;
  threshold: number | null;
}

/** Extracts the JSON block printed by `loudnorm=print_format=json` from stderr. */
export function parseLoudnormOutput(stderr: string): LoudnormStats {
  const key = stderr.lastIndexOf('"input_i"');
  if (key < 0) throw new Error('Saída do loudnorm não encontrada na análise do FFmpeg');
  const open = stderr.lastIndexOf('{', key);
  const close = stderr.indexOf('}', key);
  if (open < 0 || close < 0) throw new Error('Saída do loudnorm incompleta');
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(stderr.slice(open, close + 1)) as Record<string, unknown>;
  } catch {
    throw new Error('JSON do loudnorm inválido');
  }
  return {
    integratedLufs: parseDbValue(json['input_i']),
    truePeakDb: parseDbValue(json['input_tp']),
    lra: parseDbValue(json['input_lra']),
    threshold: parseDbValue(json['input_thresh'])
  };
}

/** Reads the "Overall" section of the astats filter output. */
export function parseAstatsOutput(stderr: string): { samplePeakDb: number | null; rmsDb: number | null } {
  const idx = stderr.lastIndexOf('Overall');
  if (idx < 0) throw new Error('Saída do astats não encontrada na análise do FFmpeg');
  const section = stderr.slice(idx);
  const peak = section.match(/Peak level dB:\s*(\S+)/);
  const rms = section.match(/RMS level dB:\s*(\S+)/);
  return {
    samplePeakDb: peak ? parseDbValue(peak[1]) : null,
    rmsDb: rms ? parseDbValue(rms[1]) : null
  };
}

export function parseAnalysisOutput(stderr: string): LoudnessAnalysis {
  return { ...parseLoudnormOutput(stderr), ...parseAstatsOutput(stderr) };
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  sample_rate?: string;
  channels?: number;
  sample_fmt?: string;
  bit_rate?: string;
  bits_per_raw_sample?: string;
  bits_per_sample?: number;
  duration?: string;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
  r_frame_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { format_name?: string; duration?: string; bit_rate?: string; size?: string; tags?: Record<string, string> };
}

const COVER_CODECS = new Set(['mjpeg', 'png', 'bmp', 'gif', 'webp']);

function positiveInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractTags(...sources: Array<Record<string, string> | undefined>): AudioTags {
  const lower: Record<string, string> = {};
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      const key = k.toLowerCase();
      if (lower[key] === undefined && v.trim() !== '') lower[key] = v.trim();
    }
  }
  const pick = (...keys: string[]): string | undefined => keys.map((k) => lower[k]).find(Boolean);
  const tags: AudioTags = {};
  const assign = <K extends keyof AudioTags>(key: K, value: AudioTags[K] | undefined | null): void => {
    if (value !== undefined && value !== null) tags[key] = value;
  };
  assign('title', pick('title'));
  assign('artist', pick('artist'));
  assign('album', pick('album'));
  assign('albumArtist', pick('album_artist', 'albumartist', 'album artist'));
  assign('track', pick('track', 'tracknumber'));
  assign('date', pick('date', 'year'));
  assign('genre', pick('genre'));
  assign('replayGainTrackGain', parseDbValue(pick('replaygain_track_gain')));
  assign('replayGainAlbumGain', parseDbValue(pick('replaygain_album_gain')));
  return tags;
}

export function parseFfprobeOutput(raw: string): AudioProbe {
  let data: FfprobeOutput;
  try {
    data = JSON.parse(raw) as FfprobeOutput;
  } catch {
    throw new Error('Resposta do ffprobe inválida');
  }
  const streams = data.streams ?? [];
  const audio = streams.find((s) => s.codec_type === 'audio');
  if (!audio) throw new Error('Nenhuma faixa de áudio encontrada no arquivo');
  const format = data.format ?? {};
  const hasCover = streams.some(
    (s) => s.codec_type === 'video' && (s.disposition?.attached_pic === 1 || COVER_CODECS.has(s.codec_name ?? ''))
  );
  return {
    durationSec: parseDbValue(format.duration) ?? parseDbValue(audio.duration) ?? 0,
    codec: audio.codec_name ?? 'unknown',
    formatName: format.format_name ?? '',
    bitRate: positiveInt(audio.bit_rate) ?? positiveInt(format.bit_rate),
    sampleRate: positiveInt(audio.sample_rate) ?? 0,
    channels: audio.channels ?? 0,
    sampleFmt: audio.sample_fmt ?? '',
    bitsPerSample: positiveInt(audio.bits_per_raw_sample) ?? positiveInt(audio.bits_per_sample),
    hasCover,
    tags: extractTags(format.tags, audio.tags)
  };
}

/** Incremental parser for `-progress pipe:1` output. Returns elapsed media seconds. */
export class ProgressParser {
  private buffer = '';

  push(chunk: string): number | null {
    this.buffer += chunk;
    const lines = this.buffer.split(/\r?\n/);
    this.buffer = lines.pop() ?? '';
    let latest: number | null = null;
    for (const line of lines) {
      const value = parseProgressLine(line);
      if (value !== null) latest = value;
    }
    return latest;
  }
}

export function parseProgressLine(line: string): number | null {
  const eq = line.indexOf('=');
  if (eq < 0) return null;
  const key = line.slice(0, eq).trim();
  const value = line.slice(eq + 1).trim();
  // Note: ffmpeg's out_time_ms is actually in microseconds as well.
  if (key === 'out_time_us' || key === 'out_time_ms') {
    const us = Number.parseInt(value, 10);
    return Number.isFinite(us) && us >= 0 ? us / 1_000_000 : null;
  }
  if (key === 'out_time') {
    const m = value.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
    if (!m) return null;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
  return null;
}

/** "30000/1001" -> 29.97 */
export function parseFrameRate(raw: string | undefined): number {
  if (!raw) return 0;
  const [num, den] = raw.split('/').map(Number);
  if (!num || !Number.isFinite(num)) return 0;
  return den ? num / den : num;
}

/** Generic media description (audio and/or video) from `ffprobe -show_format -show_streams`. */
export function parseMediaInfo(raw: string, path: string): MediaInfo {
  let data: FfprobeOutput;
  try {
    data = JSON.parse(raw) as FfprobeOutput;
  } catch {
    throw new Error('Resposta do ffprobe inválida');
  }
  const streams = data.streams ?? [];
  const format = data.format ?? {};
  const isCover = (s: FfprobeStream): boolean => s.disposition?.attached_pic === 1 || COVER_CODECS.has(s.codec_name ?? '');
  const v = streams.find((s) => s.codec_type === 'video' && !isCover(s));
  const a = streams.find((s) => s.codec_type === 'audio');
  if (!v && !a) throw new Error('Nenhuma faixa de áudio ou vídeo encontrada');
  const tags: Record<string, string> = {};
  for (const src of [format.tags, a?.tags]) {
    for (const [k, val] of Object.entries(src ?? {})) if (!(k.toLowerCase() in tags)) tags[k.toLowerCase()] = val;
  }
  return {
    path,
    sizeBytes: positiveInt(format.size) ?? 0,
    durationSec: parseDbValue(format.duration) ?? parseDbValue(v?.duration) ?? parseDbValue(a?.duration) ?? 0,
    formatName: format.format_name ?? '',
    bitRate: positiveInt(format.bit_rate),
    video: v
      ? {
          codec: v.codec_name ?? 'unknown',
          width: v.width ?? 0,
          height: v.height ?? 0,
          fps: Math.round((parseFrameRate(v.avg_frame_rate) || parseFrameRate(v.r_frame_rate)) * 1000) / 1000,
          bitRate: positiveInt(v.bit_rate)
        }
      : null,
    audio: a
      ? { codec: a.codec_name ?? 'unknown', sampleRate: positiveInt(a.sample_rate) ?? 0, channels: a.channels ?? 0, bitRate: positiveInt(a.bit_rate) }
      : null,
    hasCover: streams.some((s) => s.codec_type === 'video' && isCover(s)),
    tags
  };
}
