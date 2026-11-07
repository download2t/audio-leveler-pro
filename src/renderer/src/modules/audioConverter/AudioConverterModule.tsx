import { useMemo, useState } from 'react';
import { AUDIO_FORMATS, resolveAudioCodec } from '../../../../core/commands/audioConvert';
import type { AudioConvertOptions, AudioFormat, OperationRequest } from '../../../../shared/media';
import { DEFAULT_AUDIO_CONVERT } from '../../../../shared/presets';
import { CommandPreview } from '../../components/media/CommandPreview';
import { OutputDirField } from '../../components/media/Fields';
import { MediaFileList } from '../../components/media/MediaFileList';
import { PresetBar } from '../../components/media/PresetBar';
import { Field, Section } from '../../components/ui/Field';
import { Segmented, Select, Toggle } from '../../components/ui/Inputs';
import { useMediaFiles } from '../../hooks/useMediaFiles';
import { useOperation } from '../../hooks/useOperation';
import { ModuleHeader, SplitModule, useModuleFiles } from '../../shell/ModuleLayout';
import { useApp } from '../../state/AppContext';

const BITRATES = [64, 96, 128, 160, 192, 224, 256, 320, 384, 512];
const FORMAT_KEYS = Object.keys(AUDIO_FORMATS) as AudioFormat[];

export function AudioConverterModule({ active }: { active: boolean }) {
  const { settingsApi } = useApp();
  const files = useMediaFiles('audio');
  const io = useModuleFiles(files, 'audio', active);
  const [o, setO] = useState<AudioConvertOptions>(DEFAULT_AUDIO_CONVERT);
  const set = (patch: Partial<AudioConvertOptions>): void => setO((prev) => ({ ...prev, ...patch }));
  const codec = resolveAudioCodec(o.format, o.codec);
  const outputDir = settingsApi.settings?.media.outputDir ?? '';

  const request = useMemo<OperationRequest | null>(
    () => (files.ready.length ? { module: 'audio-convert', files: files.ready.map((f) => f.path), outputDir, options: o } : null),
    [files.ready, outputDir, o]
  );
  const op = useOperation(request);

  const changeFormat = (format: AudioFormat): void => {
    const first = AUDIO_FORMATS[format].codecs[0];
    set({ format, codec: first?.id ?? '', bitrateKbps: Math.min(o.bitrateKbps, first?.maxBitrate || o.bitrateKbps) || o.bitrateKbps });
  };

  return (
    <SplitModule
      header={<ModuleHeader icon="music" title="Conversor de Áudio" subtitle="MP3, WAV, FLAC, AAC, M4A, OGG, OPUS e WMA, individual ou em lote" />}
      main={
        <>
          <MediaFileList api={files} kind="audio" onAdd={() => void io.pickFiles()} onAddFolder={() => void io.pickFolder()} hint="Converta centenas de faixas de uma vez, mantendo artista, álbum e capa." />
          {io.overlay}
        </>
      }
      side={
        <>
          <Section title="Preset">
            <PresetBar module="audio-convert" current={o} onApply={setO} />
          </Section>
          <Section title="Formato de saída">
            <div className="format-grid">
              {FORMAT_KEYS.map((f) => (
                <button key={f} type="button" className={`preset ${o.format === f ? 'is-active' : ''}`} onClick={() => changeFormat(f)}>
                  <strong>{AUDIO_FORMATS[f].label.split(' ')[0]}</strong>
                  <span>{AUDIO_FORMATS[f].codecs.every((c) => c.lossless) ? 'sem perda' : 'compactado'}</span>
                </button>
              ))}
            </div>
            <div className="field-row">
              <Field label="Codec">
                <Select value={codec.id} options={AUDIO_FORMATS[o.format].codecs.map((c) => ({ value: c.id, label: c.label }))} onChange={(id) => set({ codec: id })} />
              </Field>
              <Field label="Bitrate">
                <Select
                  value={codec.lossless ? 0 : o.bitrateKbps}
                  disabled={codec.lossless}
                  options={codec.lossless ? [{ value: 0, label: 'Sem perda' }] : BITRATES.filter((b) => b <= codec.maxBitrate).map((b) => ({ value: b, label: `${b} kbps` }))}
                  onChange={(bitrateKbps) => set({ bitrateKbps })}
                />
              </Field>
            </div>
            <Field label="Frequência">
              <Segmented
                value={o.sampleRate}
                onChange={(sampleRate) => set({ sampleRate })}
                options={[
                  { value: 'original', label: 'Original' },
                  { value: 44100, label: '44,1 kHz' },
                  { value: 48000, label: '48 kHz' },
                  { value: 96000, label: '96 kHz' }
                ]}
              />
            </Field>
            <Field label="Canais">
              <Segmented
                value={o.channels}
                onChange={(channels) => set({ channels })}
                options={[
                  { value: 'original', label: 'Original' },
                  { value: 1, label: 'Mono' },
                  { value: 2, label: 'Estéreo' }
                ]}
              />
            </Field>
            <Toggle
              label="Manter metadados"
              hint={AUDIO_FORMATS[o.format].cover ? 'Artista, álbum, faixa, ano, gênero e capa.' : 'Este formato não guarda capa.'}
              checked={o.keepMetadata}
              onChange={(keepMetadata) => set({ keepMetadata })}
            />
          </Section>
          <Section title="Saída">
            <OutputDirField />
            <CommandPreview preview={op.preview} error={op.error} busy={op.busy} disabled={!request} onEnqueue={() => void op.enqueue()} onOpenQueue={op.openQueue} />
          </Section>
        </>
      }
    />
  );
}
