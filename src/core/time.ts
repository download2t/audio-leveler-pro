/** Parses "90", "1:30", "01:02:03.5" or "1,5" into seconds. null when invalid. */
export function parseTime(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (!t) return null;
  const parts = t.split(':');
  if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) return null;
  const value = parts.reduce((acc, p) => acc * 60 + Number(p), 0);
  return Number.isFinite(value) ? value : null;
}

/** 83.5 -> "1:23.5", 3725 -> "1:02:05". */
export function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const whole = Math.floor(sec);
  const frac = Math.round((sec - whole) * 10) / 10;
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = (whole % 60) + frac;
  const ss = (s < 10 ? '0' : '') + (Number.isInteger(s) ? String(s) : s.toFixed(1));
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
