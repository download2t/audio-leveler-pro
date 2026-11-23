import { useMemo, useState } from 'react';
import { IMAGE_FORMATS } from '../../../../core/commands/imageConvert';
import type { ImageConvertOptions, ImageFormat, OperationRequest } from '../../../../shared/media';
import { DEFAULT_IMAGE_CONVERT } from '../../../../shared/presets';
import { CommandPreview } from '../../components/media/CommandPreview';
import { OutputDirField } from '../../components/media/Fields';
import { MediaFileList } from '../../components/media/MediaFileList';
import { PresetBar } from '../../components/media/PresetBar';
import { Field, Section } from '../../components/ui/Field';
import { NumberField, Segmented, Select, Toggle } from '../../components/ui/Inputs';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useOperation } from '../../hooks/useOperation';
import { ModuleHeader, SplitModule, useModuleFiles } from '../../shell/ModuleLayout';
import { useApp } from '../../state/AppContext';

const FORMATS: Array<{ value: ImageConvertOptions['format']; label: string; hint: string }> = [
  { value: 'original', label: 'Original', hint: 'mesmo formato' },
  ...(Object.keys(IMAGE_FORMATS) as ImageFormat[]).map((f) => ({
    value: f,
    label: IMAGE_FORMATS[f].label,
    hint: f === 'jpeg' ? 'fotos' : f === 'png' ? 'sem perda' : f === 'webp' ? 'web' : f === 'avif' ? 'menor' : f === 'tiff' ? 'impressão' : 'animação'
  }))
];

export function ImageConverterModule({ active }: { active: boolean }) {
  const { settingsApi } = useApp();
  const files = useMediaFiles('image');
  const io = useModuleFiles(files, 'image', active);
  const [o, setO] = useState<ImageConvertOptions>(DEFAULT_IMAGE_CONVERT);
  const set = (patch: Partial<ImageConvertOptions>): void => setO((prev) => ({ ...prev, ...patch }));
  const setResize = (patch: Partial<ImageConvertOptions['resize']>): void => setO((prev) => ({ ...prev, resize: { ...prev.resize, ...patch } }));
  const outputDir = settingsApi.settings?.media.outputDir ?? '';
  const r = o.resize;
  const paletteRelevant = o.format === 'png' || o.format === 'original';

  const request = useMemo<OperationRequest | null>(
    () => (files.ready.length ? { module: 'image-convert', files: files.ready.map((f) => f.path), outputDir, options: o } : null),
    [files.ready, outputDir, o]
  );
  const op = useOperation(request);

  return (
    <SplitModule
      header={<ModuleHeader icon="image" title="Conversor de Imagens" subtitle="Comprima, redimensione e converta fotos (JPEG, PNG, WebP, AVIF, TIFF e GIF) em lote" />}
      main={
        <>
          <MediaFileList
            api={files}
            kind="image"
            onAdd={() => void io.pickFiles()}
            onAddFolder={() => void io.pickFolder()}
            hint="Reduza o tamanho de centenas de fotos de uma vez. As fotos são endireitadas pela orientação da câmera e os originais nunca são alterados."
          />
          {io.overlay}
        </>
      }
      side={
        <>
          <Section title="Preset">
            <PresetBar module="image-convert" current={o} onApply={setO} />
          </Section>
          <Section title="Formato de saída">
            <div className="format-grid">
              {FORMATS.map((f) => (
                <button key={f.value} type="button" className={`preset ${o.format === f.value ? 'is-active' : ''}`} onClick={() => set({ format: f.value })}>
                  <strong>{f.label}</strong>
                  <span>{f.hint}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Compressão">
            <Segmented
              value={o.compression}
              onChange={(compression) => set({ compression })}
              options={[
                { value: 'quality', label: 'Qualidade' },
                { value: 'target-size', label: 'Tamanho máximo' },
                { value: 'lossless', label: 'Sem perda' }
              ]}
            />
            {o.compression === 'quality' && (
              <Field label="Qualidade" hint="80 é um bom equilíbrio; abaixo de 60 os artefatos começam a aparecer.">
                <div className="range-field">
                  <input type="range" min={10} max={100} step={1} value={o.quality} onChange={(e) => set({ quality: Number(e.target.value) })} />
                  <span className="mono">{o.quality}</span>
                </div>
              </Field>
            )}
            {o.compression === 'target-size' && (
              <Field label="Tamanho máximo por foto" hint="O app escolhe a maior qualidade que cabe nesse limite (JPEG, WebP e AVIF).">
                <NumberField value={o.targetKb} min={10} max={50000} step={50} suffix="KB" onChange={(targetKb) => set({ targetKb: Math.round(targetKb) })} />
              </Field>
            )}
            {o.compression === 'lossless' && <p className="field-hint">Nenhum pixel é alterado. Ideal para PNG/WebP sem perda ou para converter para um formato editável (descomprimir).</p>}
            {paletteRelevant && o.compression !== 'lossless' && (
              <Toggle
                label="PNG: reduzir cores (paleta)"
                hint="Reduz PNGs em 60–80% com pouca diferença visual (como o pngquant)."
                checked={o.palette}
                onChange={(palette) => set({ palette })}
              />
            )}
          </Section>
          <Section title="Redimensionar">
            <Select
              value={r.mode}
              onChange={(mode) => setResize({ mode })}
              options={[
                { value: 'none', label: 'Manter tamanho original' },
                { value: 'fit', label: 'Caber em largura/altura máxima' },
                { value: 'percent', label: 'Porcentagem' },
                { value: 'exact', label: 'Tamanho exato' }
              ]}
            />
            {(r.mode === 'fit' || r.mode === 'exact') && (
              <div className="field-row">
                <Field label={r.mode === 'fit' ? 'Largura máx.' : 'Largura'} hint={r.mode === 'fit' ? '0 = sem limite' : undefined}>
                  <NumberField value={r.width} min={0} max={20000} step={10} suffix="px" onChange={(width) => setResize({ width: Math.round(width) })} />
                </Field>
                <Field label={r.mode === 'fit' ? 'Altura máx.' : 'Altura'} hint={r.mode === 'fit' ? '0 = sem limite' : undefined}>
                  <NumberField value={r.height} min={0} max={20000} step={10} suffix="px" onChange={(height) => setResize({ height: Math.round(height) })} />
                </Field>
              </div>
            )}
            {r.mode === 'fit' && (
              <div className="chip-row">
                {[3840, 2560, 1920, 1600, 1280, 1080, 800].map((px) => (
                  <button key={px} type="button" className={`chip-button ${r.width === px && r.height === px ? 'is-active' : ''}`} onClick={() => setResize({ width: px, height: px })}>
                    {px}px
                  </button>
                ))}
              </div>
            )}
            {r.mode === 'percent' && (
              <Field label="Porcentagem do tamanho original">
                <NumberField value={r.percent} min={1} max={400} step={5} suffix="%" onChange={(percent) => setResize({ percent: Math.round(percent) })} />
              </Field>
            )}
            {r.mode === 'exact' && (
              <Field label="Ajuste">
                <Segmented value={r.fit} onChange={(fit) => setResize({ fit })} options={[{ value: 'cover', label: 'Cortar' }, { value: 'contain', label: 'Bordas' }, { value: 'fill', label: 'Esticar' }]} />
              </Field>
            )}
            {r.mode !== 'none' && r.mode !== 'exact' && (
              <Toggle label="Permitir ampliar" hint="Desligado: fotos menores que o limite ficam como estão." checked={r.enlarge} onChange={(enlarge) => setResize({ enlarge })} />
            )}
          </Section>
          <Section title="Metadados">
            <Toggle
              label="Manter EXIF"
              hint={o.keepMetadata ? 'Mantém câmera, data e localização GPS.' : 'Remove câmera, data e localização GPS (recomendado para compartilhar).'}
              checked={o.keepMetadata}
              onChange={(keepMetadata) => set({ keepMetadata })}
            />
          </Section>
          <Section title="Saída">
            <OutputDirField />
            <CommandPreview
              preview={op.preview}
              error={op.error}
              busy={op.busy}
              disabled={!request}
              onEnqueue={() => void op.enqueue()}
              onOpenQueue={op.openQueue}
              commandLabel="Prévia do primeiro arquivo"
            />
          </Section>
        </>
      }
    />
  );
}
