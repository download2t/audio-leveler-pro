import { buildAudioConvert } from '../../core/commands/audioConvert';
import type { BuildContext, BuildResult } from '../../core/commands/common';
import type { MediaInfo } from '../../shared/media';
import { OperationService } from './OperationService';
import { jobNames, type Req } from './serviceHelpers';

export class AudioConverterService extends OperationService<Req<'audio-convert'>> {
  protected build(ctx: BuildContext, req: Req<'audio-convert'>): BuildResult {
    return buildAudioConvert(ctx, req.options);
  }
  protected title(req: Req<'audio-convert'>, inputs: MediaInfo[]): string {
    return `${jobNames(inputs)} → ${req.options.format.toUpperCase()}`;
  }
}
