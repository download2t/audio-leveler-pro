import { useMemo, useState } from 'react';
import { AUDIO_FORMATS } from '../../../../core/commands/audioConvert';
import type { AudioEditOp, AudioEditTool, AudioFormat, EditOutputOptions, OperationRequest } from '../../../../shared/media';
import { CommandPreview } from '../../components/media/CommandPreview';
import { LoopForm, OutputDirField, SplitForm, TimeField } from '../../components/media/Fields';
import { MediaFileList } from '../../components/media/MediaFileList';
import { ToolPicker, type ToolDef } from '../../components/media/ToolPicker';
import { Field, Section } from '../../components/ui/Field';
import { NumberField, Segmented, Select, Toggle } from '../../components/ui/Inputs';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useOperation } from '../../hooks/useOperation';
import { ModuleHeader, SplitModule, useModuleFiles } from '../../shell/ModuleLayout';
import { useApp } from '../../state/AppContext';

export const AUDIO_TOOLS: ReadonlyArray<ToolDef<AudioEditTool>> = [
  { id: 'join', label: 'Juntar', icon: 'merge', description: 'Une as músicas na ordem da lista, com crossfade opcional' },
  { id: 'split', label: 'Dividir', icon: 'split', description: 'Divide por duração, número de partes ou pontos' },
  { id: 'trim', label: 'Cortar', icon: 'scissors', description: 'Mantém apenas o trecho escolhido' },
  { id: 'remove-silence', label: 'Silêncio', icon: 'silence', description: 'Remove silêncios do início e do meio' },
  { id: 'fade-in', label: 'Fade in', icon: 'fade', description: 'Entrada gradual do volume' },
  { id: 'fade-out', label: 'Fade out', icon: 'fade', description: 'Saída gradual do volume' },
  { id: 'volume', label: 'Volume', icon: 'volume', description: 'Aumenta ou diminui o volume em dB' },
  { id: 'speed', label: 'Velocidade', icon: 'speed', description: 'Acelera ou desacelera, mantendo o tom se quiser' },
  { id: 'channels', label: 'Mono/Estéreo', icon: 'sliders', description: 'Converte entre mono e estéreo' },
  { id: 'loop', label: 'Loop / Estender', icon: 'repeat', description: 'Repete N vezes ou até uma duração' }
];

const DEFAULT_OPS: { [K in AudioEditTool]: Extract<AudioEditOp, { tool: K }> } = {
  join: { tool: 'join', crossfadeSec: 0 },
  split: { tool: 'split', split: { mode: 'segments', segmentSec: 60 } },
  trim: { tool: 'trim', startSec: 0, endSec: 30 },
  'remove-silence': { tool: 'remove-silence', thresholdDb: -50, minSilenceSec: 1 },
  'fade-in': { tool: 'fade-in', durationSec: 3 },
  'fade-out': { tool: 'fade-out', durationSec: 3 },
  volume: { tool: 'volume', gainDb: 3 },
  speed: { tool: 'speed', factor: 1.25, keepPitch: true },
  channels: { tool: 'channels', channels: 1 },
  loop: { tool: 'loop', loop: { mode: 'duration', times: 2, targetSec: 600, transition: 'cut', transitionSec: 2 } }
};

const OUTPUT_FORMATS = [{ value: 'original', label: 'Mesmo do original' }, ...(Object.keys(AUDIO_FORMATS) as AudioFormat[]).map((f) => ({ value: f, label: AUDIO_FORMATS[f].label }))];

export function AudioEditorModule({ active }: { active: boolean }) {
  const { settingsApi } = useApp();
  const files = useMediaFiles('audio');
  const io = useModuleFiles(files, 'audio', active);
  const [tool, setTool] = useState<AudioEditTool>('trim');
  const [ops, setOps] = useState(DEFAULT_OPS);
  const [format, setFormat] = useState<EditOutputOptions['format']>('original');
  const op = ops[tool] as AudioEditOp;
  const update = <K extends AudioEditTool>(k: K, patch: Partial<Extract<AudioEditOp, { tool: K }>>): void =>
    setOps((prev) => ({ ...prev, [k]: { ...prev[k], ...patch } }));
  const outputDir = settingsApi.settings?.media.outputDir ?? '';

  const request = useMemo<OperationRequest | null>(
    () => (files.ready.length ? { module: 'audio-edit', files: files.ready.map((f) => f.path), outputDir, op, output: { format } } : null),
    [files.ready, outputDir, op, format]
  );
  const operation = useOperation(request);

  return (
    <SplitModule
      header={<ModuleHeader icon="scissors" title="Editor de Áudio" subtitle="Juntar, dividir, cortar, fades, volume, velocidade e loop, também em lote" />}
      main={
        <>
          <MediaFileList
            api={files}
            kind="audio"
            reorderable={tool === 'join'}
            onAdd={() => void io.pickFiles()}
            onAddFolder={() => void io.pickFolder()}
            hint="Cada ferramenta é aplicada a todos os arquivos da lista. Em Juntar, a ordem da lista define a sequência."
          />
          {io.overlay}
        </>
      }
      side={
        <>
          <Section title="Ferramenta">
            <ToolPicker tools={AUDIO_TOOLS} value={tool} onChange={setTool} />
            <p className="field-hint">{AUDIO_TOOLS.find((t) => t.id === tool)?.description}</p>
          </Section>
          <Section title="Opções">
            {op.tool === 'join' && (
              <Field label="Crossfade entre faixas" hint="0 = emenda direta">
                <NumberField value={op.crossfadeSec} min={0} max={20} step={0.5} suffix="s" onChange={(crossfadeSec) => update('join', { crossfadeSec })} />
              </Field>
            )}
            {op.tool === 'split' && <SplitForm value={op.split} onChange={(split) => update('split', { split })} />}
            {op.tool === 'trim' && (
              <div className="field-row">
                <TimeField label="Início" value={op.startSec} onChange={(startSec) => update('trim', { startSec })} />
                <TimeField label="Fim" value={op.endSec} onChange={(endSec) => update('trim', { endSec })} />
              </div>
            )}
            {op.tool === 'remove-silence' && (
              <div className="field-row">
                <Field label="Limiar de silêncio">
                  <NumberField value={op.thresholdDb} min={-90} max={-10} step={1} suffix="dB" onChange={(thresholdDb) => update('remove-silence', { thresholdDb })} />
                </Field>
                <Field label="Silêncio mínimo">
                  <NumberField value={op.minSilenceSec} min={0.1} max={30} step={0.1} suffix="s" onChange={(minSilenceSec) => update('remove-silence', { minSilenceSec })} />
                </Field>
              </div>
            )}
            {(op.tool === 'fade-in' || op.tool === 'fade-out') && (
              <Field label="Duração do fade">
                <NumberField value={op.durationSec} min={0.1} max={60} step={0.5} suffix="s" onChange={(durationSec) => update(op.tool, { durationSec })} />
              </Field>
            )}
            {op.tool === 'volume' && (
              <Field label="Ganho" hint="Valores positivos aumentam; negativos diminuem.">
                <NumberField value={op.gainDb} min={-40} max={40} step={0.5} suffix="dB" onChange={(gainDb) => update('volume', { gainDb })} />
              </Field>
            )}
            {op.tool === 'speed' && (
              <>
                <Field label="Velocidade" hint="0,25× a 4×">
                  <NumberField value={op.factor} min={0.25} max={4} step={0.05} suffix="×" onChange={(factor) => update('speed', { factor })} />
                </Field>
                <Toggle label="Manter o tom" hint="Desligado: muda o tom junto (efeito de disco)." checked={op.keepPitch} onChange={(keepPitch) => update('speed', { keepPitch })} />
              </>
            )}
            {op.tool === 'channels' && (
              <Field label="Converter para">
                <Segmented value={op.channels} onChange={(channels) => update('channels', { channels })} options={[{ value: 1, label: 'Mono' }, { value: 2, label: 'Estéreo' }]} />
              </Field>
            )}
            {op.tool === 'loop' && <LoopForm value={op.loop} onChange={(loop) => update('loop', { loop })} />}
            <Field label="Formato de saída">
              <Select value={format} options={OUTPUT_FORMATS} onChange={(f) => setFormat(f as EditOutputOptions['format'])} />
            </Field>
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
