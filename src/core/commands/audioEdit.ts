import type { AudioEditOp, AudioFormat, EditOutputOptions, MediaInfo, SplitOptions } from '../../shared/media';
import { AUDIO_FORMATS, audioEncodeArgs, audioFormatFromExt, metadataArgs, resolveAudioCodec } from './audioConvert';
import { HEAD, baseNameNoExt, extOf, joinPath, requireAudio, sec, tail, type BuildContext, type BuildResult, type BuiltStep } from './common';
import { buildLoopSteps } from './loop';

export const AUDIO_TOOL_SUFFIX: Record<AudioEditOp['tool'], string> = {
  join: 'juntado', split: 'parte', trim: 'cortado', 'remove-silence': 'sem-silencio', 'fade-in': 'fade-in',
  'fade-out': 'fade-out', volume: 'volume', speed: 'velocidade', channels: 'canais', loop: 'loop'
};

interface AudioTarget {
  format: AudioFormat;
  encode: string[];
  muxer: string;
  ext: string;
  sameAsInput: boolean;
}

/** Output encoding for edits: keeps the input format/codec family and bitrate unless another format is chosen. */
export function audioEditTarget(info: MediaInfo, output: EditOutputOptions): AudioTarget {
  const inputFormat = audioFormatFromExt(extOf(info.path)) ?? 'mp3';
  const format = output.format === 'original' ? inputFormat : (output.format as AudioFormat);
  if (!(format in AUDIO_FORMATS)) throw new Error(`Formato de áudio inválido: ${output.format}`);
  const spec = AUDIO_FORMATS[format];
  let codecId = spec.codecs[0]?.id ?? '';
  if (format === 'ogg' && info.audio?.codec === 'opus') codecId = 'opus';
  if (format === 'm4a' && info.audio?.codec === 'alac') codecId = 'alac';
  if (format === 'wav' && info.audio?.codec === 'pcm_s24le') codecId = 'pcm24';
  const codec = resolveAudioCodec(format, codecId);
  const sourceKbps = info.audio?.bitRate ? Math.round(info.audio.bitRate / 1000) : codec.defaultBitrate;
  const bitrate = sourceKbps > 0 && sourceKbps <= codec.maxBitrate ? sourceKbps : codec.defaultBitrate;
  const enc = audioEncodeArgs(codec, { bitrateKbps: bitrate, sampleRate: 'original', channels: 'original' }, info.audio);
  return { format, encode: enc.args, muxer: spec.muxer, ext: spec.ext, sameAsInput: format === inputFormat };
}

/** atempo accepts 0.5–100 per instance; chain instances for smaller factors. */
export function atempoChain(factor: number): string {
  const parts: string[] = [];
  let f = factor;
  while (f > 2) {
    parts.push('atempo=2');
    f /= 2;
  }
  while (f < 0.5) {
    parts.push('atempo=0.5');
    f /= 0.5;
  }
  parts.push(`atempo=${sec(f)}`);
  return parts.join(',');
}

export function segmentArgs(split: SplitOptions, durationSec: number): string[] {
  switch (split.mode) {
    case 'segments':
      if (!(split.segmentSec > 0)) throw new Error('Defina a duração de cada parte.');
      return ['-segment_time', sec(split.segmentSec)];
    case 'parts':
      if (!(split.parts >= 2)) throw new Error('Defina pelo menos 2 partes.');
      return ['-segment_time', sec(durationSec / split.parts)];
    case 'points': {
      const points = [...new Set(split.points)].filter((p) => p > 0 && p < durationSec).sort((a, b) => a - b);
      if (points.length === 0) throw new Error('Informe pelo menos um ponto de divisão dentro da duração do arquivo.');
      return ['-segment_times', points.map(sec).join(',')];
    }
  }
}

function single(ctx: BuildContext, info: MediaInfo, target: AudioTarget, suffix: string, filters: string[], durationSec: number, pre: string[] = [], post: string[] = []): BuildResult {
  const output = joinPath(ctx.workDir, `output.${target.ext}`);
  const args = [...HEAD, ...pre, '-i', info.path, '-map', '0:a:0', '-vn', ...post];
  if (filters.length) args.push('-af', filters.join(','));
  args.push(...target.encode, ...metadataArgs(info, AUDIO_FORMATS[target.format].metadata), ...tail(target.muxer, output));
  return {
    steps: [{ args, durationSec, label: 'Processando' }],
    outputs: [{ path: output, name: `${baseNameNoExt(info.path)}_${suffix}.${target.ext}` }],
    prepare: [], warnings: [], estimatedBytes: null, estimatedSeconds: durationSec / 60
  };
}

export function buildAudioEdit(ctx: BuildContext, op: AudioEditOp, output: EditOutputOptions): BuildResult {
  const info = ctx.inputs[0];
  if (!info) throw new Error('Nenhum arquivo de entrada.');
  ctx.inputs.forEach(requireAudio);
  const target = audioEditTarget(info, output);
  const d = info.durationSec;
  const suffix = AUDIO_TOOL_SUFFIX[op.tool];

  switch (op.tool) {
    case 'trim': {
      const end = Math.min(op.endSec, d);
      if (op.startSec < 0 || end <= op.startSec) throw new Error('O fim do corte deve ser maior que o início.');
      return single(ctx, info, target, suffix, [], end - op.startSec, ['-ss', sec(op.startSec)], ['-t', sec(end - op.startSec)]);
    }
    case 'fade-in':
      if (!(op.durationSec > 0)) throw new Error('Defina a duração do fade.');
      return single(ctx, info, target, suffix, [`afade=t=in:st=0:d=${sec(op.durationSec)}`], d);
    case 'fade-out':
      if (!(op.durationSec > 0)) throw new Error('Defina a duração do fade.');
      return single(ctx, info, target, suffix, [`afade=t=out:st=${sec(Math.max(0, d - op.durationSec))}:d=${sec(op.durationSec)}`], d);
    case 'volume':
      return single(ctx, info, target, suffix, [`volume=${op.gainDb.toFixed(2)}dB`], d);
    case 'speed': {
      if (!(op.factor >= 0.25 && op.factor <= 4)) throw new Error('A velocidade deve ficar entre 0,25× e 4×.');
      const rate = info.audio?.sampleRate || 44100;
      const filter = op.keepPitch ? atempoChain(op.factor) : `asetrate=${Math.round(rate * op.factor)},aresample=${rate}`;
      return single(ctx, info, target, suffix, [filter], d / op.factor);
    }
    case 'channels':
      return { ...single(ctx, info, target, op.channels === 1 ? 'mono' : 'estereo', [], d, [], ['-ac', String(op.channels)]) };
    case 'remove-silence': {
      const th = `${op.thresholdDb}dB`;
      const filter = `silenceremove=start_periods=1:start_threshold=${th}:stop_periods=-1:stop_duration=${sec(op.minSilenceSec)}:stop_threshold=${th}`;
      return single(ctx, info, target, suffix, [filter], d);
    }
    case 'split': {
      const dir = joinPath(ctx.workDir, 'parts');
      const pattern = joinPath(dir, `${baseNameNoExt(info.path)}_parte%03d.${target.ext}`);
      const args = [...HEAD, '-i', info.path, '-map', '0:a:0', '-vn', ...(target.sameAsInput ? ['-c:a', 'copy'] : target.encode)];
      args.push('-map_metadata', '0', '-progress', 'pipe:1', '-f', 'segment', ...segmentArgs(op.split, d), '-reset_timestamps', '1', '-segment_format', target.muxer, pattern);
      return { steps: [{ args, durationSec: d, label: 'Dividindo' }], outputs: [], outputDir: dir, prepare: [], warnings: [], estimatedBytes: null, estimatedSeconds: d / 200 };
    }
    case 'join': {
      if (ctx.inputs.length < 2) throw new Error('Selecione pelo menos 2 arquivos para juntar.');
      const rate = info.audio?.sampleRate || 44100;
      const norm = ctx.inputs.map((_, i) => `[${i}:a]aresample=${rate},aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`);
      let graph: string;
      const xf = op.crossfadeSec;
      if (xf > 0) {
        const chain: string[] = [];
        let prev = 'a0';
        for (let i = 1; i < ctx.inputs.length; i++) {
          const out = i === ctx.inputs.length - 1 ? 'out' : `x${i}`;
          chain.push(`[${prev}][a${i}]acrossfade=d=${sec(xf)}[${out}]`);
          prev = out;
        }
        graph = [...norm, ...chain].join(';');
      } else {
        graph = [...norm, `${ctx.inputs.map((_, i) => `[a${i}]`).join('')}concat=n=${ctx.inputs.length}:v=0:a=1[out]`].join(';');
      }
      const total = ctx.inputs.reduce((s, m) => s + m.durationSec, 0) - xf * (ctx.inputs.length - 1);
      const outputPath = joinPath(ctx.workDir, `output.${target.ext}`);
      const args = [...HEAD, ...ctx.inputs.flatMap((m) => ['-i', m.path]), '-filter_complex', graph, '-map', '[out]', ...target.encode, '-map_metadata', '0', ...tail(target.muxer, outputPath)];
      return {
        steps: [{ args, durationSec: total, label: 'Juntando' }],
        outputs: [{ path: outputPath, name: `${baseNameNoExt(info.path)}_${suffix}.${target.ext}` }],
        prepare: [], warnings: [], estimatedBytes: null, estimatedSeconds: total / 60
      };
    }
    case 'loop': {
      const built = buildLoopSteps(info, op.loop, ctx.workDir, {
        videoArgs: null, audioArgs: target.encode, muxer: target.muxer, ext: target.ext, copyOk: target.sameAsInput
      });
      const steps: BuiltStep[] = built.steps;
      return {
        steps,
        outputs: [{ path: built.output, name: `${baseNameNoExt(info.path)}_${suffix}.${target.ext}` }],
        prepare: [], warnings: [], estimatedBytes: null, estimatedSeconds: built.plan.totalSec / 100
      };
    }
  }
}
