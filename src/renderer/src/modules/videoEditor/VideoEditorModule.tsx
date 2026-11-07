import { useMemo, useState } from 'react';
import { AUDIO_FORMATS } from '../../../../core/commands/audioConvert';
import { VIDEO_FORMATS } from '../../../../core/commands/videoConvert';
import type { AudioFormat, EditOutputOptions, OperationRequest, VideoEditOp, VideoEditTool, VideoFormat, WatermarkPosition } from '../../../../shared/media';
import { CommandPreview } from '../../components/media/CommandPreview';
import { AuxFileField, LoopForm, OutputDirField, SplitForm, TimeField } from '../../components/media/Fields';
import { MediaFileList } from '../../components/media/MediaFileList';
import { ToolPicker, type ToolDef } from '../../components/media/ToolPicker';
import { Button } from '../../components/ui/Button';
import { Field, Section } from '../../components/ui/Field';
import { NumberField, Segmented, Select, Toggle } from '../../components/ui/Inputs';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useOperation } from '../../hooks/useOperation';
import { ModuleHeader, SplitModule, useModuleFiles } from '../../shell/ModuleLayout';
import { useApp } from '../../state/AppContext';

export const VIDEO_TOOLS: ReadonlyArray<ToolDef<VideoEditTool>> = [
  { id: 'join', label: 'Juntar', icon: 'merge', description: 'Une os vídeos na ordem da lista (a resolução segue o primeiro)' },
  { id: 'trim', label: 'Cortar', icon: 'scissors', description: 'Mantém apenas o trecho escolhido' },
  { id: 'split', label: 'Dividir', icon: 'split', description: 'Divide por duração, número de partes ou pontos' },
  { id: 'remove', label: 'Remover trechos', icon: 'minus', description: 'Apaga um ou mais intervalos do vídeo' },
  { id: 'resize', label: 'Redimensionar', icon: 'image', description: 'Altera a resolução (com barras, esticado ou cortado)' },
  { id: 'rotate', label: 'Rotacionar', icon: 'rotate', description: 'Gira 90°, 180° ou 270°' },
  { id: 'flip', label: 'Espelhar', icon: 'flip', description: 'Espelha na horizontal ou vertical' },
  { id: 'extract-audio', label: 'Extrair áudio', icon: 'music', description: 'Salva só a trilha de áudio' },
  { id: 'replace-audio', label: 'Trocar áudio', icon: 'volume', description: 'Substitui a trilha por outro arquivo' },
  { id: 'subtitle', label: 'Legenda', icon: 'type', description: 'Grava a legenda na imagem ou adiciona como faixa' },
  { id: 'watermark', label: "Marca d'água", icon: 'star', description: 'Logo ou texto sobre o vídeo' },
  { id: 'gif', label: 'Gerar GIF', icon: 'image', description: 'Cria um GIF animado de um trecho' },
  { id: 'loop', label: 'Loop / Estender', icon: 'repeat', description: 'Repete N vezes ou até uma duração (ex.: 30 s → 10 min)' }
];

const DEFAULT_OPS: { [K in VideoEditTool]: Extract<VideoEditOp, { tool: K }> } = {
  join: { tool: 'join' },
  trim: { tool: 'trim', startSec: 0, endSec: 30, precise: true },
  split: { tool: 'split', precise: true, split: { mode: 'segments', segmentSec: 60 } },
  remove: { tool: 'remove', ranges: [{ startSec: 0, endSec: 5 }] },
  resize: { tool: 'resize', width: 1280, height: 720, fit: 'pad' },
  rotate: { tool: 'rotate', angle: 90 },
  flip: { tool: 'flip', direction: 'horizontal' },
  'extract-audio': { tool: 'extract-audio', format: 'mp3' },
  'replace-audio': { tool: 'replace-audio', audioPath: '', loopAudio: false },
  subtitle: { tool: 'subtitle', subtitlePath: '', mode: 'burn' },
  watermark: { tool: 'watermark', kind: 'text', imagePath: '', text: '', position: 'bottom-right', opacity: 0.8, sizePct: 15 },
  gif: { tool: 'gif', startSec: 0, durationSec: 5, fps: 12, width: 480 },
  loop: { tool: 'loop', loop: { mode: 'duration', times: 2, targetSec: 600, transition: 'cut', transitionSec: 1 } }
};

const OUTPUT_FORMATS = [{ value: 'original', label: 'Mesmo do original' }, ...(Object.keys(VIDEO_FORMATS) as VideoFormat[]).map((f) => ({ value: f, label: VIDEO_FORMATS[f].label }))];
const POSITIONS: Array<{ value: WatermarkPosition; label: string }> = [
  { value: 'top-left', label: 'Superior esquerdo' },
  { value: 'top-right', label: 'Superior direito' },
  { value: 'bottom-left', label: 'Inferior esquerdo' },
  { value: 'bottom-right', label: 'Inferior direito' },
  { value: 'center', label: 'Centro' }
];
const SIZE_PRESETS = [
  { label: '1080p', w: 1920, h: 1080 },
  { label: '720p', w: 1280, h: 720 },
  { label: 'Vertical', w: 1080, h: 1920 },
  { label: 'Quadrado', w: 1080, h: 1080 }
];

export function VideoEditorModule({ active }: { active: boolean }) {
  const { settingsApi } = useApp();
  const files = useMediaFiles('video');
  const io = useModuleFiles(files, 'video', active);
  const [tool, setTool] = useState<VideoEditTool>('trim');
  const [ops, setOps] = useState(DEFAULT_OPS);
  const [format, setFormat] = useState<EditOutputOptions['format']>('original');
  const op = ops[tool] as VideoEditOp;
  const update = <K extends VideoEditTool>(k: K, patch: Partial<Extract<VideoEditOp, { tool: K }>>): void =>
    setOps((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  const outputDir = settingsApi.settings?.media.outputDir ?? '';
  const hasFormat = op.tool !== 'extract-audio' && op.tool !== 'gif';

  const request = useMemo<OperationRequest | null>(
    () => (files.ready.length ? { module: 'video-edit', files: files.ready.map((f) => f.path), outputDir, op, output: { format: hasFormat ? format : 'original' } } : null),
    [files.ready, outputDir, op, format, hasFormat]
  );
  const operation = useOperation(request);

  return (
    <SplitModule
      header={<ModuleHeader icon="film" title="Editor de Vídeo" subtitle="Cortar, juntar, legendas, marca d'água, GIF e Loop / Estender" />}
      main={
        <>
          <MediaFileList
            api={files}
            kind="video"
            reorderable={tool === 'join'}
            onAdd={() => void io.pickFiles()}
            onAddFolder={() => void io.pickFolder()}
            hint="A ferramenta é aplicada a cada vídeo da lista (modo em lote). Em Juntar, a ordem da lista define a sequência."
          />
          {io.overlay}
        </>
      }
      side={
        <>
          <Section title="Ferramenta">
            <ToolPicker tools={VIDEO_TOOLS} value={tool} onChange={setTool} />
            <p className="field-hint">{VIDEO_TOOLS.find((t) => t.id === tool)?.description}</p>
          </Section>
          <Section title="Opções">
            {op.tool === 'join' && <p className="field-hint">Vídeos com tamanhos diferentes são enquadrados com barras pretas; vídeos sem áudio ganham silêncio.</p>}
            {op.tool === 'trim' && (
              <>
                <div className="field-row">
                  <TimeField label="Início" value={op.startSec} onChange={(startSec) => update('trim', { startSec })} />
                  <TimeField label="Fim" value={op.endSec} onChange={(endSec) => update('trim', { endSec })} />
                </div>
                <Toggle label="Corte preciso" hint="Desligado: corte instantâneo sem recodificar (ajusta ao keyframe mais próximo)." checked={op.precise} onChange={(precise) => update('trim', { precise })} />
              </>
            )}
            {op.tool === 'split' && (
              <>
                <SplitForm value={op.split} onChange={(split) => update('split', { split })} />
                <Toggle label="Divisão precisa" hint="Desligado: rápido, sem recodificar, divide nos keyframes." checked={op.precise} onChange={(precise) => update('split', { precise })} />
              </>
            )}
            {op.tool === 'remove' && (
              <>
                {op.ranges.map((r, i) => (
                  <div key={i} className="range-row">
                    <TimeField label={`Trecho ${i + 1}: de`} value={r.startSec} onChange={(startSec) => update('remove', { ranges: op.ranges.map((x, j) => (j === i ? { ...x, startSec } : x)) })} />
                    <TimeField label="até" value={r.endSec} onChange={(endSec) => update('remove', { ranges: op.ranges.map((x, j) => (j === i ? { ...x, endSec } : x)) })} />
                    <Button variant="ghost" size="sm" icon="x" aria-label="Remover trecho" disabled={op.ranges.length === 1} onClick={() => update('remove', { ranges: op.ranges.filter((_, j) => j !== i) })} />
                  </div>
                ))}
                <Button size="sm" icon="plus" onClick={() => update('remove', { ranges: [...op.ranges, { startSec: 0, endSec: 5 }] })}>
                  Adicionar trecho
                </Button>
              </>
            )}
            {op.tool === 'resize' && (
              <>
                <div className="chip-row">
                  {SIZE_PRESETS.map((p) => (
                    <button key={p.label} type="button" className={`chip-button ${op.width === p.w && op.height === p.h ? 'is-active' : ''}`} onClick={() => update('resize', { width: p.w, height: p.h })}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="field-row">
                  <Field label="Largura">
                    <NumberField value={op.width} min={16} max={7680} step={2} suffix="px" onChange={(width) => update('resize', { width })} />
                  </Field>
                  <Field label="Altura">
                    <NumberField value={op.height} min={16} max={4320} step={2} suffix="px" onChange={(height) => update('resize', { height })} />
                  </Field>
                </div>
                <Field label="Ajuste">
                  <Segmented value={op.fit} onChange={(fit) => update('resize', { fit })} options={[{ value: 'pad', label: 'Barras' }, { value: 'crop', label: 'Cortar' }, { value: 'stretch', label: 'Esticar' }]} />
                </Field>
              </>
            )}
            {op.tool === 'rotate' && (
              <Field label="Ângulo (sentido horário)">
                <Segmented value={op.angle} onChange={(angle) => update('rotate', { angle })} options={[{ value: 90, label: '90°' }, { value: 180, label: '180°' }, { value: 270, label: '270°' }]} />
              </Field>
            )}
            {op.tool === 'flip' && (
              <Field label="Direção">
                <Segmented value={op.direction} onChange={(direction) => update('flip', { direction })} options={[{ value: 'horizontal', label: 'Horizontal' }, { value: 'vertical', label: 'Vertical' }]} />
              </Field>
            )}
            {op.tool === 'extract-audio' && (
              <Field label="Formato do áudio">
                <Select value={op.format} options={(Object.keys(AUDIO_FORMATS) as AudioFormat[]).map((f) => ({ value: f, label: AUDIO_FORMATS[f].label }))} onChange={(f) => update('extract-audio', { format: f })} />
              </Field>
            )}
            {op.tool === 'replace-audio' && (
              <>
                <AuxFileField label="Novo áudio" kind="audio" value={op.audioPath} onChange={(audioPath) => update('replace-audio', { audioPath })} />
                <Toggle label="Repetir o áudio se for mais curto" checked={op.loopAudio} onChange={(loopAudio) => update('replace-audio', { loopAudio })} />
              </>
            )}
            {op.tool === 'subtitle' && (
              <>
                <AuxFileField label="Arquivo de legenda (SRT, ASS, VTT)" kind="subtitle" value={op.subtitlePath} onChange={(subtitlePath) => update('subtitle', { subtitlePath })} />
                <Field label="Modo" hint={op.mode === 'soft' ? 'Faixa selecionável: MP4, MKV, MOV ou WEBM.' : 'Gravada na imagem: aparece em qualquer player.'}>
                  <Segmented value={op.mode} onChange={(mode) => update('subtitle', { mode })} options={[{ value: 'burn', label: 'Gravar na imagem' }, { value: 'soft', label: 'Faixa de legenda' }]} />
                </Field>
              </>
            )}
            {op.tool === 'watermark' && (
              <>
                <Field label="Tipo">
                  <Segmented value={op.kind} onChange={(kind) => update('watermark', { kind })} options={[{ value: 'text', label: 'Texto' }, { value: 'image', label: 'Imagem / logo' }]} />
                </Field>
                {op.kind === 'image' ? (
                  <AuxFileField label="Imagem (PNG com transparência recomendado)" kind="image" value={op.imagePath} onChange={(imagePath) => update('watermark', { imagePath })} />
                ) : (
                  <Field label="Texto">
                    <input className="input" value={op.text} placeholder="© Seu canal" onChange={(e) => update('watermark', { text: e.target.value })} />
                  </Field>
                )}
                <Field label="Posição">
                  <Select value={op.position} options={POSITIONS} onChange={(position) => update('watermark', { position })} />
                </Field>
                <div className="field-row">
                  <Field label="Opacidade">
                    <NumberField value={Math.round(op.opacity * 100)} min={5} max={100} step={5} suffix="%" onChange={(v) => update('watermark', { opacity: v / 100 })} />
                  </Field>
                  <Field label={op.kind === 'image' ? 'Largura' : 'Tamanho do texto'} hint={op.kind === 'image' ? '% da largura do vídeo' : '% da altura do vídeo'}>
                    <NumberField value={op.sizePct} min={1} max={100} step={1} suffix="%" onChange={(sizePct) => update('watermark', { sizePct })} />
                  </Field>
                </div>
              </>
            )}
            {op.tool === 'gif' && (
              <>
                <div className="field-row">
                  <TimeField label="Início" value={op.startSec} onChange={(startSec) => update('gif', { startSec })} />
                  <TimeField label="Duração" value={op.durationSec} onChange={(durationSec) => update('gif', { durationSec })} />
                </div>
                <div className="field-row">
                  <Field label="FPS">
                    <NumberField value={op.fps} min={1} max={30} step={1} onChange={(fps) => update('gif', { fps: Math.round(fps) })} />
                  </Field>
                  <Field label="Largura">
                    <NumberField value={op.width} min={64} max={1920} step={16} suffix="px" onChange={(width) => update('gif', { width: Math.round(width) })} />
                  </Field>
                </div>
              </>
            )}
            {op.tool === 'loop' && <LoopForm value={op.loop} onChange={(loop) => update('loop', { loop })} />}
            {hasFormat && (
              <Field label="Formato de saída">
                <Select value={format} options={OUTPUT_FORMATS} onChange={(f) => setFormat(f as EditOutputOptions['format'])} />
              </Field>
            )}
          </Section>
          <Section title="Saída">
            <OutputDirField />
            <CommandPreview preview={operation.preview} error={operation.error} busy={operation.busy} disabled={!request} onEnqueue={() => void operation.enqueue()} onOpenQueue={operation.openQueue} />
          </Section>
        </>
      }
    />
  );
}
