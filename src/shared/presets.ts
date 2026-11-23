import type { AudioConvertOptions, ImageConvertOptions, Preset, VideoConvertOptions } from './media';

export const DEFAULT_IMAGE_CONVERT: ImageConvertOptions = {
  format: 'jpeg',
  compression: 'quality',
  quality: 80,
  targetKb: 500,
  resize: { mode: 'none', width: 1920, height: 1920, percent: 50, fit: 'cover', enlarge: false },
  keepMetadata: false,
  palette: true
};

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

const image = (id: string, name: string, o: Partial<ImageConvertOptions>): Preset => ({
  id, name, module: 'image-convert', builtin: true, options: { ...DEFAULT_IMAGE_CONVERT, ...o, resize: { ...DEFAULT_IMAGE_CONVERT.resize, ...o.resize } }
});
const fit = (px: number): ImageConvertOptions['resize'] => ({ ...DEFAULT_IMAGE_CONVERT.resize, mode: 'fit', width: px, height: px });

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
  audio('builtin-flac', 'FLAC Lossless', { format: 'flac', codec: 'flac', sampleRate: 'original' }),
  image('builtin-img-web', 'Web (WebP 1920px)', { format: 'webp', quality: 80, resize: fit(1920) }),
  image('builtin-img-whatsapp', 'WhatsApp (JPEG 1600px)', { format: 'jpeg', quality: 75, resize: fit(1600) }),
  image('builtin-img-email', 'E-mail (JPEG até 500 KB)', { format: 'jpeg', compression: 'target-size', targetKb: 500, resize: fit(2048) }),
  image('builtin-img-instagram', 'Instagram (JPEG 1080px)', { format: 'jpeg', quality: 85, resize: fit(1080) }),
  image('builtin-img-max', 'Compressão máxima (AVIF)', { format: 'avif', quality: 50 }),
  image('builtin-img-lossless', 'Sem perda (PNG)', { format: 'png', compression: 'lossless', palette: false })
];
