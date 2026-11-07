import type { AppSettings } from './types';

export const SUPPORTED_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg'] as const;

export const LUFS_PRESETS = [-23, -18, -16, -14, -12] as const;

export const BITRATE_OPTIONS_KBPS = [96, 128, 160, 192, 224, 256, 320] as const;

export const MAX_CONCURRENCY = 16;

export const DEFAULT_SETTINGS: AppSettings = {
  normalization: {
    mode: 'lufs',
    lufsTarget: -14,
    replayGainType: 'track',
    replayGainReference: -18,
    albumGrouping: 'tag',
    useExistingReplayGainTags: false,
    peakTarget: -1,
    rmsTarget: -16,
    truePeakCeiling: -1,
    peakProtection: 'limiter',
    maxGain: 20
  },
  export: {
    outputDir: '',
    overwriteOriginals: false,
    preserveFolderStructure: true,
    fileSuffix: '',
    outputFormat: 'original',
    bitrateMode: 'original',
    customBitrateKbps: 320,
    keepMetadata: true,
    keepCover: true
  },
  media: {
    outputDir: '',
    concurrency: 2
  },
  concurrency: 4,
  theme: 'system',
  ffmpegPath: '',
  ffprobePath: ''
};

export const APP_CREDITS = {
  developer: 'Matheus D. Barros',
  appName: 'Audio Leveler Pro'
} as const;
