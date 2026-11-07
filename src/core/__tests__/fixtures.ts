import type { AudioProbe, LoudnessAnalysis } from '../../shared/types';

/** Tail of real ffmpeg 6.0 stderr for `astats,loudnorm=print_format=json`. */
export const ANALYSIS_STDERR = `
[Parsed_astats_0 @ 000001c7121bd480] Channel: 2
[Parsed_astats_0 @ 000001c7121bd480] Peak level dB: -30.000000
[Parsed_astats_0 @ 000001c7121bd480] RMS level dB: -31.000000
[Parsed_astats_0 @ 000001c7121bd480] Overall
[Parsed_astats_0 @ 000001c7121bd480] DC offset: 0.000000
[Parsed_astats_0 @ 000001c7121bd480] Peak level dB: -33.327735
[Parsed_astats_0 @ 000001c7121bd480] RMS level dB: -36.348605
[Parsed_astats_0 @ 000001c7121bd480] RMS peak dB: -36.332553
[Parsed_astats_0 @ 000001c7121bd480] Number of samples: 132300
[Parsed_loudnorm_1 @ 000001c7121bc8c0]
{
	"input_i" : "-34.05",
	"input_tp" : "-33.33",
	"input_lra" : "0.00",
	"input_thresh" : "-44.05",
	"output_i" : "-22.95",
	"output_tp" : "-22.27",
	"output_lra" : "0.00",
	"output_thresh" : "-32.95",
	"normalization_type" : "dynamic",
	"target_offset" : "-0.05"
}
`;

export function makeProbe(overrides: Partial<AudioProbe> = {}): AudioProbe {
  return {
    durationSec: 180,
    codec: 'mp3',
    formatName: 'mp3',
    bitRate: 192_000,
    sampleRate: 44_100,
    channels: 2,
    sampleFmt: 'fltp',
    bitsPerSample: null,
    hasCover: false,
    tags: {},
    ...overrides
  };
}

export function makeAnalysis(overrides: Partial<LoudnessAnalysis> = {}): LoudnessAnalysis {
  return {
    integratedLufs: -20,
    truePeakDb: -6,
    lra: 6,
    threshold: -30,
    samplePeakDb: -6.5,
    rmsDb: -22,
    ...overrides
  };
}
