import type { MediaInfo } from '../../shared/media';
import type { BuildContext } from '../commands/common';

export function videoInfo(o: Partial<MediaInfo> = {}): MediaInfo {
  return {
    path: 'C:/v/clip.mp4',
    sizeBytes: 50_000_000,
    durationSec: 30,
    formatName: 'mov,mp4,m4a,3gp,3g2,mj2',
    bitRate: 8_000_000,
    video: { codec: 'h264', width: 1920, height: 1080, fps: 30, bitRate: 7_800_000 },
    audio: { codec: 'aac', sampleRate: 48000, channels: 2, bitRate: 192_000 },
    hasCover: false,
    tags: {},
    ...o
  };
}

export function audioInfo(o: Partial<MediaInfo> = {}): MediaInfo {
  return {
    path: 'C:/m/song.mp3',
    sizeBytes: 5_000_000,
    durationSec: 200,
    formatName: 'mp3',
    bitRate: 192_000,
    video: null,
    audio: { codec: 'mp3', sampleRate: 44100, channels: 2, bitRate: 192_000 },
    hasCover: true,
    tags: { artist: 'X' },
    ...o
  };
}

export const ctxOf = (...inputs: MediaInfo[]): BuildContext => ({ inputs, workDir: 'W:/work', cpuCount: 8, fontPath: 'C:/Windows/Fonts/arial.ttf' });

export const argAfter = (args: readonly string[], flag: string): string | undefined => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
