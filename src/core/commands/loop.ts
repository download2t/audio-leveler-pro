import type { LoopOptions, MediaInfo } from '../../shared/media';
import { HEAD, joinPath, sec, tail, type BuiltStep } from './common';

/** Crossfades overlap slightly less than the transition so trimmed parts never come up short. */
const XFADE_RATIO = 0.95;
const MAX_REPEATS = 10_000;

export interface LoopPlan {
  repeats: number;
  /** Length of one repetition (shorter than the clip when crossfading). */
  unitSec: number;
  totalSec: number;
  /** Exact output duration, null = whole repetitions. */
  trimTo: number | null;
}

export function planLoop(durationSec: number, o: LoopOptions): LoopPlan {
  if (!(durationSec > 0)) throw new Error('Duração do arquivo desconhecida.');
  const t = o.transition === 'crossfade' || o.transition === 'fade' ? o.transitionSec : 0;
  if (t < 0) throw new Error('A duração da transição não pode ser negativa.');
  if (t > 0 && 2 * t >= durationSec) throw new Error('A transição deve ser menor que metade da duração do clipe.');
  if (o.transition === 'crossfade' && t <= 0) throw new Error('Defina a duração do crossfade.');

  const unitSec = o.transition === 'crossfade' ? durationSec - XFADE_RATIO * t : durationSec;
  if (o.mode === 'times') {
    const repeats = Math.min(MAX_REPEATS, Math.max(1, Math.round(o.times)));
    return { repeats, unitSec, totalSec: repeats * unitSec, trimTo: null };
  }
  if (!(o.targetSec > 0)) throw new Error('Defina a duração desejada.');
  const repeats = Math.min(MAX_REPEATS, Math.max(1, Math.ceil(o.targetSec / unitSec - 1e-9)));
  if (o.transition === 'none') return { repeats, unitSec, totalSec: repeats * unitSec, trimTo: null };
  return { repeats, unitSec, totalSec: o.targetSec, trimTo: o.targetSec };
}

export interface LoopEncoding {
  /** Encoder args for video / audio; null when the stream is absent. */
  videoArgs: string[] | null;
  audioArgs: string[] | null;
  muxer: string;
  ext: string;
  /** Output container equals the input: plain repetition can stream-copy. */
  copyOk: boolean;
}

function crossfadeGraph(d: number, t: number, hasVideo: boolean, hasAudio: boolean): { graph: string; maps: string[] } {
  const x = t * XFADE_RATIO;
  const parts: string[] = [];
  const maps: string[] = [];
  if (hasVideo) {
    parts.push(
      `[0:v]split=3[va][vb][vc]`,
      `[va]trim=start=${sec(t)}:end=${sec(d - t)},setpts=PTS-STARTPTS[vbody]`,
      `[vb]trim=start=${sec(d - t)}:end=${sec(d)},setpts=PTS-STARTPTS[vtail]`,
      `[vc]trim=start=0:end=${sec(t)},setpts=PTS-STARTPTS[vhead]`,
      `[vtail][vhead]xfade=transition=fade:duration=${sec(x)}:offset=0[vx]`,
      `[vbody][vx]concat=n=2:v=1:a=0[vout]`
    );
    maps.push('-map', '[vout]');
  }
  if (hasAudio) {
    parts.push(
      `[0:a]asplit=3[aa][ab][ac]`,
      `[aa]atrim=start=${sec(t)}:end=${sec(d - t)},asetpts=PTS-STARTPTS[abody]`,
      `[ab]atrim=start=${sec(d - t)}:end=${sec(d)},asetpts=PTS-STARTPTS[atail]`,
      `[ac]atrim=start=0:end=${sec(t)},asetpts=PTS-STARTPTS[ahead]`,
      `[atail][ahead]acrossfade=d=${sec(x)}[ax]`,
      `[abody][ax]concat=n=2:v=0:a=1[aout]`
    );
    maps.push('-map', '[aout]');
  }
  return { graph: parts.join(';'), maps };
}

/**
 * Builds the loop steps. Plain repetition is a single stream-copy pass; fade/crossfade first
 * render one seamless "loop unit" and then repeat it by stream copy, so the cost does not grow
 * with the number of repetitions.
 */
export function buildLoopSteps(info: MediaInfo, o: LoopOptions, workDir: string, enc: LoopEncoding): {
  steps: BuiltStep[];
  output: string;
  plan: LoopPlan;
} {
  const plan = planLoop(info.durationSec, o);
  const hasVideo = enc.videoArgs !== null && info.video !== null;
  const hasAudio = enc.audioArgs !== null && info.audio !== null;
  const output = joinPath(workDir, `output.${enc.ext}`);
  const trim = plan.trimTo !== null ? ['-t', sec(plan.trimTo)] : [];
  const maps = [...(hasVideo ? ['-map', '0:v:0'] : []), ...(hasAudio ? ['-map', '0:a:0'] : [])];
  const encode = [...(hasVideo ? (enc.videoArgs as string[]) : ['-vn']), ...(hasAudio ? (enc.audioArgs as string[]) : ['-an'])];

  const repeat = (input: string, copy: boolean): BuiltStep => ({
    args: [...HEAD, '-stream_loop', String(plan.repeats - 1), '-i', input, ...maps, ...trim, ...(copy ? ['-c', 'copy'] : encode), ...tail(enc.muxer, output)],
    durationSec: plan.totalSec,
    label: 'Repetindo'
  });

  if (o.transition === 'none' || o.transition === 'cut') {
    return { steps: [repeat(info.path, enc.copyOk)], output, plan };
  }

  const unit = joinPath(workDir, `unit.${enc.ext}`);
  const d = info.durationSec;
  const t = o.transitionSec;
  let filterArgs: string[];
  if (o.transition === 'fade') {
    filterArgs = [
      ...maps,
      ...(hasVideo ? ['-vf', `fade=t=in:st=0:d=${sec(t)},fade=t=out:st=${sec(d - t)}:d=${sec(t)}`] : []),
      ...(hasAudio ? ['-af', `afade=t=in:st=0:d=${sec(t)},afade=t=out:st=${sec(d - t)}:d=${sec(t)}`] : [])
    ];
  } else {
    const g = crossfadeGraph(d, t, hasVideo, hasAudio);
    filterArgs = ['-filter_complex', g.graph, ...g.maps];
  }
  const unitStep: BuiltStep = {
    args: [...HEAD, '-i', info.path, ...filterArgs, ...encode, ...tail(enc.muxer, unit)],
    durationSec: plan.unitSec,
    label: 'Preparando unidade de loop'
  };
  return { steps: [unitStep, repeat(unit, true)], output, plan };
}
