import { existsSync } from 'node:fs';
import { buildVideoEdit } from '../../core/commands/videoEdit';
import type { BuildContext, BuildResult } from '../../core/commands/common';
import type { MediaInfo } from '../../shared/media';
import { OperationService } from './OperationService';
import { jobNames, type Req } from './serviceHelpers';

const VIDEO_TOOL_LABEL: Record<Req<'video-edit'>['op']['tool'], string> = {
  join: 'Juntar', trim: 'Cortar', split: 'Dividir', remove: 'Remover trechos', resize: 'Redimensionar', rotate: 'Rotacionar',
  flip: 'Espelhar', 'extract-audio': 'Extrair áudio', 'replace-audio': 'Substituir áudio', subtitle: 'Legenda',
  watermark: "Marca d'água", gif: 'GIF', loop: 'Loop / Estender'
};

export class VideoEditorService extends OperationService<Req<'video-edit'>> {
  protected override groups(req: Req<'video-edit'>): string[][] {
    return req.op.tool === 'join' ? [req.files] : super.groups(req);
  }
  protected override validate(req: Req<'video-edit'>): void {
    super.validate(req);
    const op = req.op;
    const external = op.tool === 'replace-audio' ? op.audioPath : op.tool === 'subtitle' ? op.subtitlePath : op.tool === 'watermark' && op.kind === 'image' ? op.imagePath : null;
    if (external !== null && (!external || !existsSync(external))) throw new Error('O arquivo auxiliar escolhido não foi encontrado.');
  }
  protected build(ctx: BuildContext, req: Req<'video-edit'>): BuildResult {
    return buildVideoEdit(ctx, req.op, req.output);
  }
  protected title(req: Req<'video-edit'>, inputs: MediaInfo[]): string {
    return `${VIDEO_TOOL_LABEL[req.op.tool]}: ${jobNames(inputs)}`;
  }
}
