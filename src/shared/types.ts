// Domain types shared by the main process, preload and renderer.

export type NormalizationMode = 'lufs' | 'replaygain' | 'peak' | 'rms';
export type ReplayGainType = 'track' | 'album';
export type AlbumGrouping = 'tag' | 'folder';
/** What to do when the gain would push the true peak above the ceiling. */
export type PeakProtection = 'none' | 'reduce' | 'limiter';
export type OutputFormat = 'original' | 'mp3' | 'flac' | 'wav' | 'm4a' | 'ogg';
/** Concrete container written to disk ('aac' = raw ADTS stream). */
export type ContainerFormat = 'mp3' | 'flac' | 'wav' | 'm4a' | 'aac' | 'ogg';
export type BitrateMode = 'original' | 'custom';
export type ThemeMode = 'system' | 'light' | 'dark';
export type BatchMode = 'analyze' | 'normalize';

export interface NormalizationSettings {
  mode: NormalizationMode;
  /** Integrated loudness target for LUFS mode. */
  lufsTarget: number;
  replayGainType: ReplayGainType;
  /** ReplayGain 2.0 reference loudness (default -18 LUFS). */
  replayGainReference: number;
  albumGrouping: AlbumGrouping;
  /** Use REPLAYGAIN_* tags already present in the file instead of the measurement. */
  useExistingReplayGainTags: boolean;
  /** Sample peak target (dBFS) for peak mode. */
  peakTarget: number;
  /** RMS target (dBFS) for RMS mode. */
  rmsTarget: number;
  /** True peak ceiling (dBTP) used by peak protection. */
  truePeakCeiling: number;
  peakProtection: PeakProtection;
  /** Maximum positive gain, protects near-silent tracks from huge boosts. */
  maxGain: number;
}

export interface ExportSettings {
  outputDir: string;
  overwriteOriginals: boolean;
  preserveFolderStructure: boolean;
  fileSuffix: string;
  outputFormat: OutputFormat;
  bitrateMode: BitrateMode;
  customBitrateKbps: number;
  keepMetadata: boolean;
  keepCover: boolean;
}

export interface MediaSettings {
  /** Default output folder of converters and editors. */
  outputDir: string;
  /** Jobs processed in parallel by the queue. */
  concurrency: number;
}

export interface AppSettings {
  normalization: NormalizationSettings;
  export: ExportSettings;
  media: MediaSettings;
  concurrency: number;
  theme: ThemeMode;
  /** Optional overrides; empty = bundled binary, then PATH. */
  ffmpegPath: string;
  ffprobePath: string;
}

export interface AudioTags {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  track?: string;
  date?: string;
  genre?: string;
  replayGainTrackGain?: number;
  replayGainAlbumGain?: number;
}

export interface AudioProbe {
  durationSec: number;
  codec: string;
  formatName: string;
  /** Bits per second, null when unknown. */
  bitRate: number | null;
  sampleRate: number;
  channels: number;
  sampleFmt: string;
  bitsPerSample: number | null;
  hasCover: boolean;
  tags: AudioTags;
}

/** Measurements of a track. null = not measurable (e.g. digital silence = -inf). */
export interface LoudnessAnalysis {
  integratedLufs: number | null;
  truePeakDb: number | null;
  lra: number | null;
  threshold: number | null;
  samplePeakDb: number | null;
  rmsDb: number | null;
}

export type GainNote = 'max-gain' | 'peak-reduced' | 'limiter' | 'clipping-risk' | 'from-tag';
export type LevelUnit = 'LUFS' | 'dBFS';

export interface GainResult {
  /** true = the file must not be processed (see skipReason). */
  skip: boolean;
  skipReason?: 'silence';
  gainDb: number;
  /** Track level in the unit of the active mode, before processing. */
  currentLevel: number | null;
  /** Expected level after processing. */
  finalLevel: number | null;
  unit: LevelUnit;
  useLimiter: boolean;
  /** Expected true/sample peak after processing. */
  predictedPeakDb: number | null;
  notes: GainNote[];
}

export type FileStatus =
  | 'pending'
  | 'analyzing'
  | 'analyzed'
  | 'processing'
  | 'done'
  | 'error'
  | 'skipped'
  | 'cancelled';

export interface FileEntry {
  id: string;
  path: string;
  /** Directory used as base when preserving folder structure. */
  rootDir: string;
  name: string;
  ext: string;
  size: number;
}

export interface FileItem extends FileEntry {
  status: FileStatus;
  /** 0..1 progress of the current operation. */
  progress: number;
  probe?: AudioProbe;
  analysis?: LoudnessAnalysis;
  /** Gain actually applied in the last export. */
  result?: GainResult;
  outputPath?: string;
  error?: string;
}

export type FilePatch = { id: string } & Partial<
  Pick<FileItem, 'status' | 'progress' | 'probe' | 'analysis' | 'result' | 'outputPath' | 'error'>
>;

export interface ScanResult {
  files: FileEntry[];
  /** Files ignored because of an unsupported extension. */
  ignored: number;
  errors: string[];
}

export interface BatchFileInput {
  id: string;
  path: string;
  rootDir: string;
  name: string;
  probe?: AudioProbe;
  analysis?: LoudnessAnalysis;
}

export interface BatchRequest {
  mode: BatchMode;
  files: BatchFileInput[];
  settings: AppSettings;
}

export type BatchPhase = 'idle' | 'analyzing' | 'exporting';

export interface BatchProgress {
  phase: BatchPhase;
  /** Units (analysis or export of one file) completed. */
  completed: number;
  total: number;
  /** 0..1 including partial progress of running files. */
  overall: number;
  elapsedMs: number;
}

export type BatchEvent =
  | { type: 'files'; patches: FilePatch[] }
  | { type: 'progress'; progress: BatchProgress };

export interface BatchReport {
  mode: BatchMode;
  cancelled: boolean;
  total: number;
  analyzed: number;
  processed: number;
  failed: Array<{ id: string; name: string; error: string }>;
  skipped: Array<{ id: string; name: string; reason: string }>;
  averageGainDb: number | null;
  totalTimeMs: number;
  outputDir: string | null;
  startedAt: number;
  finishedAt: number;
}

export interface EnvironmentInfo {
  appVersion: string;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion: string | null;
  platform: string;
  cpuCount: number;
  logFile: string | null;
}
