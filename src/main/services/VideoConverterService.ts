import { buildVideoConvert } from '../../core/commands/videoConvert';
import type { BuildContext, BuildResult } from '../../core/commands/common';
import type { MediaInfo } from '../../shared/media';
import { OperationService } from './OperationService';
import { jobNames, type Req } from './serviceHelpers';

export class VideoConverterService extends OperationService<Req<'video-convert'>> {
  protected build(ctx: BuildContext, req: Req<'video-convert'>): BuildResult {
    return buildVideoConvert(ctx, req.options);
  }
  protected title(req: Req<'video-convert'>, inputs: MediaInfo[]): string {
    return `${jobNames(inputs)} → ${req.options.format.toUpperCase()} ${req.options.videoCodec.toUpperCase()}`;
  }
}
