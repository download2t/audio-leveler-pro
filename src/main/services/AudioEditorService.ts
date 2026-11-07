import { buildAudioEdit } from '../../core/commands/audioEdit';
import type { BuildContext, BuildResult } from '../../core/commands/common';
import type { MediaInfo } from '../../shared/media';
import { OperationService } from './OperationService';
import { jobNames, type Req } from './serviceHelpers';

const AUDIO_TOOL_LABEL: Record<Req<'audio-edit'>['op']['tool'], string> = {
  join: 'Juntar', split: 'Dividir', trim: 'Cortar', 'remove-silence': 'Remover silêncio', 'fade-in': 'Fade in',
  'fade-out': 'Fade out', volume: 'Volume', speed: 'Velocidade', channels: 'Canais', loop: 'Loop / Estender'
};

export class AudioEditorService extends OperationService<Req<'audio-edit'>> {
  protected override groups(req: Req<'audio-edit'>): string[][] {
    return req.op.tool === 'join' ? [req.files] : super.groups(req);
  }
  protected build(ctx: BuildContext, req: Req<'audio-edit'>): BuildResult {
    return buildAudioEdit(ctx, req.op, req.output);
  }
  protected title(req: Req<'audio-edit'>, inputs: MediaInfo[]): string {
    return `${AUDIO_TOOL_LABEL[req.op.tool]}: ${jobNames(inputs)}`;
  }
}
