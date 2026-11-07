import { useMemo, useState } from 'react';
import { VIDEO_CODEC_LABELS, VIDEO_FORMATS } from '../../../../core/commands/videoConvert';
import type { OperationRequest, VideoAudioCodec, VideoCodec, VideoConvertOptions, VideoFormat } from '../../../../shared/media';
import { DEFAULT_VIDEO_CONVERT } from '../../../../shared/presets';
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

const FORMAT_KEYS = Object.keys(VIDEO_FORMATS) as VideoFormat[];
const CODECS: VideoCodec[] = ['h264', 'h265', 'av1', 'vp9'];
const AUDIO_LABELS: Record<VideoAudioCodec, string> = { aac: 'AAC', mp3: 'MP3', opus: 'Opus', vorbis: 'Vorbis', flac: 'FLAC', copy: 'Copiar original', none: 'Sem áudio' };

export function VideoConverterModule({ active }: { active: boolean }) {
  const { settingsApi } = useApp();
  const files = useMediaFiles('video');
  const io = useModuleFiles(files, 'video', active);
  const [o, setO] = useState<VideoConvertOptions>(DEFAULT_VIDEO_CONVERT);
  const set = (patch: Partial<VideoConvertOptions>): void => setO((prev) => ({ ...prev, ...patch }));
  const outputDir = settingsApi.settings?.media.outputDir ?? '';
  const spec = VIDEO_FORMATS[o.format];

  const request = useMemo<OperationRequest | null>(
    () => (files.ready.length ? { module: 'video-convert', files: files.ready.map((f) => f.path), outputDir, options: o } : null),
    [files.ready, outputDir, o]
  );
  const op = useOperation(request);

  const changeFormat = (format: VideoFormat): void => {
    const s = VIDEO_FORMATS[format];
    const videoCodec = (s.videoCodecs as readonly string[]).includes(o.videoCodec) ? o.videoCodec : ((s.videoCodecs.find((c) => c !== 'mpeg2') as VideoCodec | undefined) ?? o.videoCodec);
    const audioOk = o.audioCodec === 'copy' || o.audioCodec === 'none' || (s.audioCodecs as readonly string[]).includes(o.audioCodec);
    set({ format, videoCodec, audioCodec: audioOk ? o.audioCodec : ((s.audioCodecs[0] as VideoAudioCodec | undefined) ?? 'aac') });
  };

  const audioOptions = [...spec.audioCodecs.filter((c): c is Exclude<VideoAudioCodec, 'copy' | 'none'> => c !== 'mp2'), 'copy' as const, 'none' as const].map((c) => ({ value: c, label: AUDIO_LABELS[c] }));

  return (
    <SplitModule
      header={<ModuleHeader icon="film" title="Conversor de Vídeo" subtitle="MP4, MKV, AVI, MOV, WEBM, MPEG e FLV com H.264, H.265, AV1 ou VP9" />}
      main={
        <>
          <MediaFileList api={files} kind="video" onAdd={() => void io.pickFiles()} onAddFolder={() => void io.pickFolder()} hint="Converta vídeos individualmente ou em lote e acompanhe tudo na fila." />
          {io.overlay}
        </>
      }
      side={
        <>
          <Section title="Preset">
            <PresetBar module="video-convert" current={o} onApply={setO} />
          </Section>
          <Section title="Contêiner e vídeo">
            <div className="format-grid">
              {FORMAT_KEYS.map((f) => (
                <button key={f} type="button" className={`preset ${o.format === f ? 'is-active' : ''}`} onClick={() => changeFormat(f)}>
                  <strong>{VIDEO_FORMATS[f].label}</strong>
                </button>
              ))}
            </div>
            <Field label="Codec de vídeo" hint={o.format === 'mpeg' ? 'O formato MPEG usa sempre MPEG-2 com áudio MP2.' : undefined}>
              <div className="segmented">
                {CODECS.map((c) => {
                  const allowed = (spec.videoCodecs as readonly string[]).includes(c);
                  return (
                    <button key={c} type="button" className={o.videoCodec === c && allowed ? 'is-active' : ''} disabled={!allowed} title={allowed ? '' : `Não suportado em ${spec.label}`} onClick={() => set({ videoCodec: c })}>
                      {VIDEO_CODEC_LABELS[c].split(' ')[0]}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Resolução" hint="As predefinições se referem ao lado menor, então vídeos verticais continuam verticais.">
              <Select
                value={o.resolution}
                onChange={(resolution) => set({ resolution })}
                options={[
                  { value: 'original', label: 'Original' },
                  { value: '2160', label: '4K (2160p)' },
                  { value: '1440', label: '1440p' },
                  { value: '1080', label: '1080p' },
                  { value: '720', label: '720p' },
                  { value: '480', label: '480p' },
                  { value: 'custom', label: 'Personalizada' }
                ]}
              />
            </Field>
            {o.resolution === 'custom' && (
              <div className="field-row">
                <Field label="Largura" hint="0 = proporcional">
                  <NumberField value={o.customWidth} min={0} max={7680} step={2} suffix="px" onChange={(customWidth) => set({ customWidth })} />
                </Field>
                <Field label="Altura" hint="0 = proporcional">
                  <NumberField value={o.customHeight} min={0} max={4320} step={2} suffix="px" onChange={(customHeight) => set({ customHeight })} />
                </Field>
              </div>
            )}
            <Field label="Qualidade">
              <Segmented
                value={o.quality}
                onChange={(quality) => set({ quality })}
                options={[
                  { value: 'very-high', label: 'Muito alta' },
                  { value: 'high', label: 'Alta' },
                  { value: 'medium', label: 'Média' },
                  { value: 'low', label: 'Baixa' }
                ]}
              />
            </Field>
            <Field label="FPS">
              <Segmented
                value={o.fps}
                onChange={(fps) => set({ fps })}
                options={[
                  { value: 'original', label: 'Original' },
                  { value: 24, label: '24' },
                  { value: 30, label: '30' },
                  { value: 60, label: '60' }
                ]}
              />
            </Field>
          </Section>
          <Section title="Áudio">
            <div className="field-row">
              <Field label="Codec">
                <Select value={o.audioCodec} options={audioOptions} onChange={(audioCodec) => set({ audioCodec })} disabled={o.format === 'mpeg'} />
              </Field>
              <Field label="Bitrate">
                <Select
                  value={o.audioBitrateKbps}
                  disabled={o.audioCodec === 'copy' || o.audioCodec === 'none' || o.audioCodec === 'flac'}
                  options={[64, 96, 128, 160, 192, 256, 320].map((b) => ({ value: b, label: `${b} kbps` }))}
                  onChange={(audioBitrateKbps) => set({ audioBitrateKbps })}
                />
              </Field>
            </div>
            <Field label="Canais">
              <Segmented
                value={o.audioChannels}
                disabled={o.audioCodec === 'copy' || o.audioCodec === 'none'}
                onChange={(audioChannels) => set({ audioChannels })}
                options={[
                  { value: 'original', label: 'Original' },
                  { value: 1, label: 'Mono' },
                  { value: 2, label: 'Estéreo' }
                ]}
              />
            </Field>
            <Toggle label="Manter metadados" checked={o.keepMetadata} onChange={(keepMetadata) => set({ keepMetadata })} />
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
