import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { formatBytes } from '../../core/format';
import { IMAGE_FORMATS, describeImagePlan, imageWarnings, resolveImageFormat } from '../../core/commands/imageConvert';
import { baseNameNoExt, extOf } from '../../core/commands/common';
import type { MediaInfo, OperationPreview } from '../../shared/media';
import { convertImageFile, probeImage, renderImage } from '../media/imageTools';
import type { BatchProcessingService } from './BatchProcessingService';
import type { JobPlan } from './jobPlan';
import type { Req } from './serviceHelpers';

const pct = (from: number, to: number): string => (from > 0 ? `${to <= from ? '−' : '+'}${Math.abs(Math.round((1 - to / from) * 100))}%` : '');

/** Photo conversion/compression with sharp (libvips), executed by the shared queue. */
export class ImageConverterService {
  constructor(private readonly deps: { queue: BatchProcessingService; concurrency: () => number }) {}

  private validate(req: Req<'image-convert'>): void {
    if (req.files.length === 0) throw new Error('Adicione pelo menos uma imagem.');
    if (!req.outputDir.trim()) throw new Error('Escolha uma pasta de saída.');
  }

  /** Really encodes the first photo, so sizes shown are measured, not guessed. */
  async preview(req: Req<'image-convert'>): Promise<OperationPreview> {
    this.validate(req);
    const infos = await Promise.all(req.files.map((f) => probeImage(f)));
    const first = infos[0] as MediaInfo;
    const format = resolveImageFormat(extOf(first.path), req.options.format);
    const warnings = new Set(imageWarnings(format, req.options, first.image?.hasAlpha ?? false));
    const started = Date.now();
    const result = await renderImage(first.path, first, format, req.options);
    const elapsed = (Date.now() - started) / 1000;
    if (!result.fitsTarget) warnings.add(`Nem com qualidade mínima a imagem ficou abaixo de ${req.options.targetKb} KB; reduza também a resolução.`);
    const inputBytes = infos.reduce((s, m) => s + m.sizeBytes, 0);
    const ratio = first.sizeBytes > 0 ? result.data.length / first.sizeBytes : 1;
    const image = first.image;
    const name = first.path.split(/[\\/]/).pop();
    const command = [
      `${name}: ${formatBytes(first.sizeBytes)} ${image?.width}×${image?.height} → ${formatBytes(result.data.length)} ${result.width}×${result.height} (${pct(first.sizeBytes, result.data.length)})`,
      describeImagePlan(format, req.options) + (req.options.compression === 'target-size' && IMAGE_FORMATS[format].supportsTargetSize ? ` · qualidade escolhida: ${result.quality}` : '')
    ].join('\n');
    return {
      jobs: req.files.length,
      command,
      stepCount: 1,
      inputBytes,
      estimatedBytes: req.files.length === 1 ? result.data.length : inputBytes * ratio,
      estimatedSeconds: (elapsed * req.files.length) / Math.max(1, this.deps.concurrency()),
      warnings: [...warnings]
    };
  }

  async enqueue(req: Req<'image-convert'>): Promise<number> {
    this.validate(req);
    const plans: JobPlan[] = [];
    for (const file of req.files) {
      const info = await probeImage(file);
      const format = resolveImageFormat(extOf(file), req.options.format);
      const ext = IMAGE_FORMATS[format].ext;
      const workDir = join(req.outputDir, `.alp-work-${randomBytes(5).toString('hex')}`);
      const output = join(workDir, `output.${ext}`);
      const options = req.options;
      plans.push({
        module: 'image-convert',
        title: `${file.split(/[\\/]/).pop()} → ${IMAGE_FORMATS[format].label}`,
        inputs: [file],
        outputDir: req.outputDir,
        workDir,
        prepare: [],
        steps: [
          {
            args: [],
            durationSec: 1,
            label: 'Convertendo imagem',
            run: async ({ signal }) => {
              await convertImageFile(file, output, info, format, options, signal);
            }
          }
        ],
        deliver: [{ from: output, name: `${baseNameNoExt(file)}.${ext}` }],
        command: describeImagePlan(format, options)
      });
    }
    this.deps.queue.enqueue(plans);
    return plans.length;
  }
}
