import type { BatchPhase, FileStatus, GainNote, NormalizationMode, OutputFormat } from '../../../shared/types';

export const STATUS_LABELS: Record<FileStatus, string> = {
  pending: 'Pendente',
  analyzing: 'Analisando',
  analyzed: 'Analisado',
  processing: 'Processando',
  done: 'Concluído',
  error: 'Erro',
  skipped: 'Ignorado',
  cancelled: 'Cancelado'
};

export const NOTE_LABELS: Record<GainNote, string> = {
  'max-gain': 'Ganho limitado ao máximo configurado',
  'peak-reduced': 'Ganho reduzido para respeitar o teto de pico',
  limiter: 'Limitador aplicado para respeitar o teto de pico',
  'clipping-risk': 'Risco de clipping (proteção de pico desativada)',
  'from-tag': 'Ganho lido da tag ReplayGain existente'
};

export const MODE_LABELS: Record<NormalizationMode, string> = {
  lufs: 'LUFS',
  replaygain: 'ReplayGain',
  peak: 'Pico',
  rms: 'RMS'
};

export const PHASE_LABELS: Record<BatchPhase, string> = {
  idle: 'Finalizando',
  analyzing: 'Analisando',
  exporting: 'Exportando'
};

export const FORMAT_LABELS: Record<OutputFormat, string> = {
  original: 'Mesmo do original',
  mp3: 'MP3',
  flac: 'FLAC',
  wav: 'WAV',
  m4a: 'M4A (AAC/ALAC)',
  ogg: 'OGG'
};

export const LUFS_PRESET_HINTS: Record<number, string> = {
  [-23]: 'EBU R128 / TV',
  [-18]: 'ReplayGain',
  [-16]: 'Apple / Podcasts',
  [-14]: 'Spotify / YouTube',
  [-12]: 'Alto'
};

/** Strips Electron's "Error invoking remote method" prefix. */
export function errorText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
}
