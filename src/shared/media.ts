// Types and constants of the media suite modules (converters, editors, queue, presets).

export type AudioFormat = 'mp3' | 'wav' | 'flac' | 'aac' | 'm4a' | 'ogg' | 'opus' | 'wma';
export type VideoFormat = 'mp4' | 'mkv' | 'avi' | 'mov' | 'webm' | 'mpeg' | 'flv';
export type VideoCodec = 'h264' | 'h265' | 'av1' | 'vp9';
export type VideoAudioCodec = 'aac' | 'mp3' | 'opus' | 'vorbis' | 'flac' | 'copy' | 'none';
export type ResolutionPreset = 'original' | '2160' | '1440' | '1080' | '720' | '480' | 'custom';
export type QualityLevel = 'very-high' | 'high' | 'medium' | 'low';
export type FpsOption = 'original' | 24 | 30 | 60;
export type SampleRateOption = 'original' | 44100 | 48000 | 96000;
export type ChannelsOption = 'original' | 1 | 2;

export const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg', 'opus', 'wma', 'oga', 'aiff', 'aif', 'alac', 'ac3', 'mka'];
export const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'avi', 'mov', 'webm', 'mpeg', 'mpg', 'flv', 'm4v', 'wmv', '3gp', 'ts', 'mts', 'm2ts', 'ogv'];
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp'];
export const SUBTITLE_EXTENSIONS = ['srt', 'ass', 'ssa', 'vtt'];
export type MediaKind = 'audio' | 'video' | 'media';

export interface MediaInfo {
  path: string;
  sizeBytes: number;
  durationSec: number;
  formatName: string;
  bitRate: number | null;
  video: { codec: string; width: number; height: number; fps: number; bitRate: number | null } | null;
  audio: { codec: string; sampleRate: number; channels: number; bitRate: number | null } | null;
  hasCover: boolean;
  tags: Record<string, string>;
}

export interface AudioConvertOptions {
  format: AudioFormat;
  /** Codec id from AUDIO_FORMATS[format].codecs. */
  codec: string;
  bitrateKbps: number;
  sampleRate: SampleRateOption;
  channels: ChannelsOption;
  keepMetadata: boolean;
}

export interface VideoConvertOptions {
  format: VideoFormat;
  videoCodec: VideoCodec;
  resolution: ResolutionPreset;
  /** Used when resolution = custom; 0 keeps the aspect ratio for that side. */
  customWidth: number;
  customHeight: number;
  quality: QualityLevel;
  fps: FpsOption;
  audioCodec: VideoAudioCodec;
  audioBitrateKbps: number;
  audioChannels: ChannelsOption;
  keepMetadata: boolean;
}

export type LoopTransition = 'none' | 'cut' | 'crossfade' | 'fade';

export interface LoopOptions {
  mode: 'times' | 'duration';
  times: number;
  targetSec: number;
  transition: LoopTransition;
  transitionSec: number;
}

export type SplitOptions = { mode: 'segments'; segmentSec: number } | { mode: 'parts'; parts: number } | { mode: 'points'; points: number[] };

export type AudioEditOp =
  | { tool: 'join'; crossfadeSec: number }
  | ({ tool: 'split' } & { split: SplitOptions })
  | { tool: 'trim'; startSec: number; endSec: number }
  | { tool: 'remove-silence'; thresholdDb: number; minSilenceSec: number }
  | { tool: 'fade-in'; durationSec: number }
  | { tool: 'fade-out'; durationSec: number }
  | { tool: 'volume'; gainDb: number }
  | { tool: 'speed'; factor: number; keepPitch: boolean }
  | { tool: 'channels'; channels: 1 | 2 }
  | ({ tool: 'loop' } & { loop: LoopOptions });

export type WatermarkPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'center';
export interface TimeRange {
  startSec: number;
  endSec: number;
}

export type VideoEditOp =
  | { tool: 'join' }
  | { tool: 'trim'; startSec: number; endSec: number; precise: boolean }
  | ({ tool: 'split'; precise: boolean } & { split: SplitOptions })
  | { tool: 'remove'; ranges: TimeRange[] }
  | { tool: 'resize'; width: number; height: number; fit: 'pad' | 'stretch' | 'crop' }
  | { tool: 'rotate'; angle: 90 | 180 | 270 }
  | { tool: 'flip'; direction: 'horizontal' | 'vertical' }
  | { tool: 'extract-audio'; format: AudioFormat }
  | { tool: 'replace-audio'; audioPath: string; loopAudio: boolean }
  | { tool: 'subtitle'; subtitlePath: string; mode: 'burn' | 'soft' }
  | {
      tool: 'watermark';
      kind: 'image' | 'text';
      imagePath: string;
      text: string;
      position: WatermarkPosition;
      opacity: number;
      /** Image width as % of the video width / text size as % of the video height. */
      sizePct: number;
    }
  | { tool: 'gif'; startSec: number; durationSec: number; fps: number; width: number }
  | ({ tool: 'loop' } & { loop: LoopOptions });

export type AudioEditTool = AudioEditOp['tool'];
export type VideoEditTool = VideoEditOp['tool'];

export interface EditOutputOptions {
  /** 'original' keeps the input container when possible. */
  format: 'original' | AudioFormat | VideoFormat;
}

export type OperationModule = 'audio-convert' | 'video-convert' | 'audio-edit' | 'video-edit';

export type OperationRequest =
  | { module: 'audio-convert'; files: string[]; outputDir: string; options: AudioConvertOptions }
  | { module: 'video-convert'; files: string[]; outputDir: string; options: VideoConvertOptions }
  | { module: 'audio-edit'; files: string[]; outputDir: string; op: AudioEditOp; output: EditOutputOptions }
  | { module: 'video-edit'; files: string[]; outputDir: string; op: VideoEditOp; output: EditOutputOptions };

export interface OperationPreview {
  jobs: number;
  /** FFmpeg command of the first step of the first job. */
  command: string;
  stepCount: number;
  inputBytes: number;
  estimatedBytes: number | null;
  estimatedSeconds: number | null;
  warnings: string[];
}

export type JobStatus = 'queued' | 'running' | 'paused' | 'done' | 'error' | 'cancelled';

export interface QueueJob {
  id: string;
  module: OperationModule;
  title: string;
  inputs: string[];
  outputs: string[];
  status: JobStatus;
  progress: number;
  /** Processing speed in × realtime (null until measurable). */
  speed: number | null;
  etaSec: number | null;
  stepIndex: number;
  stepCount: number;
  totalDurationSec: number;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  error?: string;
  command: string;
}

export interface QueueSnapshot {
  jobs: QueueJob[];
  paused: boolean;
  overall: number;
  speed: number | null;
  etaSec: number | null;
  counts: Record<JobStatus, number>;
}

export interface HistoryEntry {
  id: string;
  module: OperationModule | 'normalizer';
  title: string;
  status: 'done' | 'error' | 'cancelled';
  startedAt: number;
  finishedAt: number;
  inputs: string[];
  outputs: string[];
  error?: string;
}

export type PresetModule = 'audio-convert' | 'video-convert';

export type Preset =
  | { id: string; name: string; module: 'audio-convert'; builtin: boolean; options: AudioConvertOptions }
  | { id: string; name: string; module: 'video-convert'; builtin: boolean; options: VideoConvertOptions };

export type QueueAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'cancelAll' }
  | { type: 'clearFinished' }
  | { type: 'cancel'; id: string }
  | { type: 'retry'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; direction: 'up' | 'down' | 'top' | 'bottom' };

export type AuxFileKind = 'audio' | 'image' | 'subtitle' | 'executable';
