import { existsSync } from 'node:fs';

const FONT_CANDIDATES: Record<string, string[]> = {
  win32: ['C:/Windows/Fonts/arial.ttf', 'C:/Windows/Fonts/segoeui.ttf', 'C:/Windows/Fonts/calibri.ttf'],
  darwin: ['/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf', '/System/Library/Fonts/Helvetica.ttc'],
  linux: ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/TTF/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf']
};

/** A system font for text watermarks (drawtext needs an explicit font file). */
export function findSystemFont(platform: NodeJS.Platform = process.platform): string | undefined {
  return (FONT_CANDIDATES[platform] ?? FONT_CANDIDATES['linux'] ?? []).find((f) => existsSync(f));
}
