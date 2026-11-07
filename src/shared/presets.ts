import type { AudioConvertOptions, Preset, VideoConvertOptions } from './media';

export const DEFAULT_AUDIO_CONVERT: AudioConvertOptions = {
  format: 'mp3',
  codec: 'mp3',
  bitrateKbps: 192,
  sampleRate: 'original',
  channels: 'original',
  keepMetadata: true
};

export const DEFAULT_VIDEO_CONVERT: VideoConvertOptions = {
  format: 'mp4',
  videoCodec: 'h264',
  resolution: 'original',
  customWidth: 1920,
  customHeight: 1080,
  quality: 'high',
  fps: 'original',
  audioCodec: 'aac',
  audioBitrateKbps: 192,
  audioChannels: 'original',
  keepMetadata: true
};

const video = (id: string, name: string, o: Partial<VideoConvertOptions>): Preset => ({
  id, name, module: 'video-convert', builtin: true, options: { ...DEFAULT_VIDEO_CONVERT, ...o }
});
const audio = (id: string, name: string, o: Partial<AudioConvertOptions>): Preset => ({
  id, name, module: 'audio-convert', builtin: true, options: { ...DEFAULT_AUDIO_CONVERT, ...o }
});

const vertical = { resolution: 'custom' as const, customWidth: 1080, customHeight: 1920 };

export const BUILTIN_PRESETS: readonly Preset[] = [
  video('builtin-youtube-1080', 'YouTube 1080p', { resolution: '1080', quality: 'high', audioBitrateKbps: 192 }),
  video('builtin-youtube-shorts', 'YouTube Shorts', { ...vertical, quality: 'high', fps: 'original', audioBitrateKbps: 192 }),
  video('builtin-tiktok', 'TikTok', { ...vertical, quality: 'high', fps: 30, audioBitrateKbps: 128 }),
  video('builtin-reels', 'Instagram Reels', { ...vertical, quality: 'high', fps: 30, audioBitrateKbps: 128 }),
  video('builtin-whatsapp', 'WhatsApp', { resolution: '720', quality: 'medium', fps: 30, audioBitrateKbps: 96, audioChannels: 2 }),
  video('builtin-telegram', 'Telegram', { resolution: '1080', quality: 'medium', audioBitrateKbps: 128 }),
  audio('builtin-podcast-128', 'Podcast MP3 128kbps', { format: 'mp3', codec: 'mp3', bitrateKbps: 128, sampleRate: 44100 }),
  audio('builtin-podcast-320', 'Podcast MP3 320kbps', { format: 'mp3', codec: 'mp3', bitrateKbps: 320, sampleRate: 44100 }),
  audio('builtin-flac', 'FLAC Lossless', { format: 'flac', codec: 'flac', sampleRate: 'original' })
];
