import type { EditOutputOptions, MediaInfo, VideoEditOp, VideoFormat, WatermarkPosition } from '../../shared/media';
import { AUDIO_FORMATS } from './audioConvert';
import { audioEditTarget, segmentArgs } from './audioEdit';
import { HEAD, baseNameNoExt, exactSizeFilter, extOf, joinPath, requireAudio, requireVideo, sec, tail, type BuildContext, type BuildResult, type PrepareAction } from './common';
import { buildLoopSteps } from './loop';
import { VIDEO_FORMATS, videoAudioArgs, videoEncodeArgs, videoFormatFromExt } from './videoConvert';

export const VIDEO_TOOL_SUFFIX: Record<VideoEditOp['tool'], string> = {
  join: 'juntado', trim: 'cortado', split: 'parte', remove: 'editado', resize: 'redimensionado', rotate: 'rotacionado',
  flip: 'espelhado', 'extract-audio': 'audio', 'replace-audio': 'novo-audio', subtitle: 'legendado',
  watermark: 'marca', gif: 'gif', loop: 'loop'
};

interface VideoTarget {
  format: VideoFormat;
  muxer: string;
  ext: string;
  sameAsInput: boolean;
  video: string[];
  audio: (info: MediaInfo) => string[];
  extra: string[];
}

export function videoEditTarget(info: MediaInfo, output: EditOutputOptions): VideoTarget {
  const inputFormat = videoFormatFromExt(extOf(info.path));
  const format: VideoFormat = output.format === 'original' ? (inputFormat ?? 'mp4') : (output.format as VideoFormat);
  if (!(format in VIDEO_FORMATS)) throw new Error(`Formato de vídeo inválido: ${output.format}`);
  const spec = VIDEO_FORMATS[format];
  const vcodec = spec.videoCodecs[0] ?? 'h264';
  const acodec = spec.audioCodecs[0] ?? 'aac';
  return {
    format,
    muxer: spec.muxer,
    ext: spec.ext,
    sameAsInput: format === inputFormat,
    video: videoEncodeArgs(vcodec, 'high', format),
    audio: (m) => videoAudioArgs(acodec, 192, 'original', m.audio),
    extra: spec.faststart ? ['-movflags', '+faststart'] : []
  };
}

const MARGIN = 24;
function overlayPosition(p: WatermarkPosition): string {
  switch (p) {
    case 'top-left': return `${MARGIN}:${MARGIN}`;
    case 'top-right': return `main_w-overlay_w-${MARGIN}:${MARGIN}`;
    case 'bottom-left': return `${MARGIN}:main_h-overlay_h-${MARGIN}`;
    case 'bottom-right': return `main_w-overlay_w-${MARGIN}:main_h-overlay_h-${MARGIN}`;
    case 'center': return '(main_w-overlay_w)/2:(main_h-overlay_h)/2';
  }
}
function textPosition(p: WatermarkPosition): string {
  switch (p) {
    case 'top-left': return `x=${MARGIN}:y=${MARGIN}`;
    case 'top-right': return `x=w-tw-${MARGIN}:y=${MARGIN}`;
    case 'bottom-left': return `x=${MARGIN}:y=h-th-${MARGIN}`;
    case 'bottom-right': return `x=w-tw-${MARGIN}:y=h-th-${MARGIN}`;
    case 'center': return 'x=(w-tw)/2:y=(h-th)/2';
  }
}

export function buildVideoEdit(ctx: BuildContext, op: VideoEditOp, output: EditOutputOptions): BuildResult {
  const info = ctx.inputs[0];
  if (!info) throw new Error('Nenhum arquivo de entrada.');
  const d = info.durationSec;
  const base = baseNameNoExt(info.path);
  const suffix = VIDEO_TOOL_SUFFIX[op.tool];
  const prepare: PrepareAction[] = [];
  const warnings: string[] = [];

  // Audio-only results (extract audio) use the audio formats.
  if (op.tool === 'extract-audio') {
    requireAudio(info);
    const fmt = AUDIO_FORMATS[op.format];
    const target = audioEditTarget({ ...info, path: `x.${fmt.ext}` }, { format: op.format });
    const out = joinPath(ctx.workDir, `output.${fmt.ext}`);
    const args = [...HEAD, '-i', info.path, '-map', '0:a:0', '-vn', ...target.encode, '-map_metadata', '0', ...tail(fmt.muxer, out)];
    return { steps: [{ args, durationSec: d, label: 'Extraindo áudio' }], outputs: [{ path: out, name: `${base}.${fmt.ext}` }], prepare, warnings, estimatedBytes: null, estimatedSeconds: d / 80 };
  }

  if (op.tool === 'gif') {
    requireVideo(info);
    if (!(op.durationSec > 0)) throw new Error('Defina a duração do GIF.');
    const out = joinPath(ctx.workDir, 'output.gif');
    const graph = `[0:v]fps=${op.fps},scale=${op.width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`;
    const args = [...HEAD, '-ss', sec(op.startSec), '-t', sec(op.durationSec), '-i', info.path, '-filter_complex', graph, '-loop', '0', ...tail('gif', out)];
    return { steps: [{ args, durationSec: op.durationSec, label: 'Gerando GIF' }], outputs: [{ path: out, name: `${base}.gif` }], prepare, warnings, estimatedBytes: null, estimatedSeconds: op.durationSec / 5 };
  }

  requireVideo(info);
  const t = videoEditTarget(info, output);
  const out = joinPath(ctx.workDir, `output.${t.ext}`);
  const name = `${base}_${suffix}.${t.ext}`;
  const result = (args: string[], durationSec: number, label: string, inWorkDir = false): BuildResult => ({
    steps: [{ args, durationSec, label, inWorkDir }],
    outputs: [{ path: out, name }],
    prepare, warnings, estimatedBytes: null, estimatedSeconds: null
  });
  const reencode = (m: MediaInfo): string[] => [...t.video, ...t.audio(m)];
  const audioKeep = t.sameAsInput ? ['-c:a', 'copy'] : t.audio(info);
  const finish = [...t.extra, ...tail(t.muxer, out)];

  switch (op.tool) {
    case 'trim': {
      const end = Math.min(op.endSec, d);
      if (op.startSec < 0 || end <= op.startSec) throw new Error('O fim do corte deve ser maior que o início.');
      const len = end - op.startSec;
      const fast = !op.precise && t.sameAsInput;
      if (!op.precise && !fast) warnings.push('Corte rápido exige o mesmo formato; o vídeo será recodificado.');
      const args = [...HEAD, '-ss', sec(op.startSec), '-i', info.path, '-t', sec(len), '-map', '0:v:0', '-map', '0:a:0?'];
      args.push(...(fast ? ['-c', 'copy', '-avoid_negative_ts', 'make_zero'] : reencode(info)), '-map_metadata', '0', ...finish);
      return result(args, len, 'Cortando');
    }
    case 'split': {
      const dir = joinPath(ctx.workDir, 'parts');
      const pattern = joinPath(dir, `${base}_parte%03d.${t.ext}`);
      const seg = segmentArgs(op.split, d);
      const copy = !op.precise && t.sameAsInput;
      const args = [...HEAD, '-i', info.path, '-map', '0:v:0', '-map', '0:a:0?'];
      if (copy) args.push('-c', 'copy');
      else {
        const keyframes = seg[0] === '-segment_time' ? `expr:gte(t,n_forced*${seg[1]})` : (seg[1] as string);
        args.push(...reencode(info), '-force_key_frames', keyframes);
      }
      args.push('-progress', 'pipe:1', '-f', 'segment', ...seg, '-reset_timestamps', '1', '-segment_format', t.muxer, pattern);
      return { steps: [{ args, durationSec: d, label: 'Dividindo' }], outputs: [], outputDir: dir, prepare, warnings, estimatedBytes: null, estimatedSeconds: null };
    }
    case 'remove': {
      const ranges = op.ranges.filter((r) => r.endSec > r.startSec).sort((a, b) => a.startSec - b.startSec);
      if (ranges.length === 0) throw new Error('Adicione pelo menos um trecho válido para remover.');
      const expr = ranges.map((r) => `between(t,${sec(r.startSec)},${sec(r.endSec)})`).join('+');
      const removed = ranges.reduce((s, r) => s + Math.min(r.endSec, d) - Math.max(0, r.startSec), 0);
      const args = [...HEAD, '-i', info.path, '-vf', `select='not(${expr})',setpts=N/FRAME_RATE/TB`];
      if (info.audio) args.push('-af', `aselect='not(${expr})',asetpts=N/SR/TB`);
      args.push(...reencode(info), '-map_metadata', '0', ...finish);
      return result(args, Math.max(0.1, d - removed), 'Removendo trechos');
    }
    case 'resize': {
      if (!(op.width > 0 && op.height > 0)) throw new Error('Informe largura e altura.');
      return result([...HEAD, '-i', info.path, '-map', '0:v:0', '-map', '0:a:0?', '-vf', exactSizeFilter(op.width, op.height, op.fit), ...t.video, ...audioKeep, '-map_metadata', '0', ...finish], d, 'Redimensionando');
    }
    case 'rotate': {
      const vf = op.angle === 90 ? 'transpose=1' : op.angle === 270 ? 'transpose=2' : 'hflip,vflip';
      return result([...HEAD, '-i', info.path, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf, ...t.video, ...audioKeep, '-map_metadata', '0', '-metadata:s:v:0', 'rotate=0', ...finish], d, 'Rotacionando');
    }
    case 'flip':
      return result([...HEAD, '-i', info.path, '-map', '0:v:0', '-map', '0:a:0?', '-vf', op.direction === 'horizontal' ? 'hflip' : 'vflip', ...t.video, ...audioKeep, '-map_metadata', '0', ...finish], d, 'Espelhando');
    case 'replace-audio': {
      if (!op.audioPath) throw new Error('Escolha o arquivo de áudio.');
      const args = [...HEAD, '-i', info.path, ...(op.loopAudio ? ['-stream_loop', '-1'] : []), '-i', op.audioPath, '-map', '0:v:0', '-map', '1:a:0'];
      args.push(...(t.sameAsInput ? ['-c:v', 'copy'] : t.video), ...videoAudioArgs(VIDEO_FORMATS[t.format].audioCodecs[0] ?? 'aac', 192, 'original', { codec: '', sampleRate: 48000, channels: 2, bitRate: null }));
      args.push('-t', sec(d), '-map_metadata', '0', ...finish);
      return result(args, d, 'Substituindo áudio');
    }
    case 'subtitle': {
      if (!op.subtitlePath) throw new Error('Escolha o arquivo de legenda.');
      const subExt = extOf(op.subtitlePath) || 'srt';
      const subName = `sub.${subExt}`;
      prepare.push({ kind: 'copy', from: op.subtitlePath, name: subName });
      if (op.mode === 'burn') {
        return result([...HEAD, '-i', info.path, '-map', '0:v:0', '-map', '0:a:0?', '-vf', `subtitles=${subName}`, ...t.video, ...audioKeep, '-map_metadata', '0', ...finish], d, 'Gravando legenda', true);
      }
      const subCodec = t.format === 'mp4' || t.format === 'mov' ? 'mov_text' : t.format === 'webm' ? 'webvtt' : t.format === 'mkv' ? (subExt === 'ass' || subExt === 'ssa' ? 'ass' : 'srt') : null;
      if (!subCodec) throw new Error('Legenda como faixa exige saída MP4, MKV, MOV ou WEBM.');
      const args = [...HEAD, '-i', info.path, '-i', subName, '-map', '0:v:0', '-map', '0:a:0?', '-map', '1:0'];
      args.push(...(t.sameAsInput ? ['-c:v', 'copy', '-c:a', 'copy'] : reencode(info)), '-c:s', subCodec, '-metadata:s:s:0', 'language=por', '-map_metadata', '0', ...finish);
      return result(args, d, 'Adicionando legenda', true);
    }
    case 'watermark': {
      const opacity = Math.min(1, Math.max(0.05, op.opacity));
      if (op.kind === 'image') {
        if (!op.imagePath) throw new Error('Escolha a imagem da marca d\'água.');
        const imgName = `wm.${extOf(op.imagePath) || 'png'}`;
        prepare.push({ kind: 'copy', from: op.imagePath, name: imgName });
        const width = Math.max(2, Math.round((((info.video?.width ?? 1280) * op.sizePct) / 100) / 2) * 2);
        // A single image frame: overlay repeats its last frame until the video ends.
        const graph = `[1:v]scale=${width}:-1,format=rgba,colorchannelmixer=aa=${sec(opacity)}[wm];[0:v][wm]overlay=${overlayPosition(op.position)}[v]`;
        return result([...HEAD, '-i', info.path, '-i', imgName, '-filter_complex', graph, '-map', '[v]', '-map', '0:a:0?', ...t.video, ...audioKeep, '-map_metadata', '0', ...finish], d, 'Aplicando marca d\'água', true);
      }
      if (!op.text.trim()) throw new Error('Digite o texto da marca d\'água.');
      if (!ctx.fontPath) throw new Error('Nenhuma fonte encontrada no sistema para desenhar o texto.');
      prepare.push({ kind: 'write', name: 'wm.txt', content: op.text }, { kind: 'copy', from: ctx.fontPath, name: `font.${extOf(ctx.fontPath) || 'ttf'}` });
      const size = Math.max(8, Math.round(((info.video?.height ?? 720) * op.sizePct) / 100));
      const vf = `drawtext=fontfile=font.${extOf(ctx.fontPath) || 'ttf'}:textfile=wm.txt:fontsize=${size}:fontcolor=white@${sec(opacity)}:borderw=2:bordercolor=black@${sec(opacity * 0.6)}:${textPosition(op.position)}`;
      return result([...HEAD, '-i', info.path, '-map', '0:v:0', '-map', '0:a:0?', '-vf', vf, ...t.video, ...audioKeep, '-map_metadata', '0', ...finish], d, 'Aplicando marca d\'água', true);
    }
    case 'join': {
      if (ctx.inputs.length < 2) throw new Error('Selecione pelo menos 2 vídeos para juntar.');
      ctx.inputs.forEach(requireVideo);
      const first = info.video as NonNullable<MediaInfo['video']>;
      const fps = Math.round((first.fps || 30) * 1000) / 1000;
      const parts: string[] = [];
      ctx.inputs.forEach((m, i) => {
        parts.push(`[${i}:v]${exactSizeFilter(first.width, first.height, 'pad')},fps=${fps},format=yuv420p[v${i}]`);
        parts.push(m.audio ? `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]` : `anullsrc=r=48000:cl=stereo,atrim=duration=${sec(m.durationSec)}[a${i}]`);
      });
      parts.push(`${ctx.inputs.map((_, i) => `[v${i}][a${i}]`).join('')}concat=n=${ctx.inputs.length}:v=1:a=1[v][a]`);
      const total = ctx.inputs.reduce((s, m) => s + m.durationSec, 0);
      const audio = videoAudioArgs(VIDEO_FORMATS[t.format].audioCodecs[0] ?? 'aac', 192, 'original', { codec: '', sampleRate: 48000, channels: 2, bitRate: null });
      const args = [...HEAD, ...ctx.inputs.flatMap((m) => ['-i', m.path]), '-filter_complex', parts.join(';'), '-map', '[v]', '-map', '[a]', ...t.video, ...audio, ...finish];
      return result(args, total, 'Juntando');
    }
    case 'loop': {
      const built = buildLoopSteps(info, op.loop, ctx.workDir, {
        videoArgs: t.video, audioArgs: t.audio(info), muxer: t.muxer, ext: t.ext, copyOk: t.sameAsInput
      });
      return { steps: built.steps, outputs: [{ path: built.output, name }], prepare, warnings, estimatedBytes: null, estimatedSeconds: null };
    }
  }
}
