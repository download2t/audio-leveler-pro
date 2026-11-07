import { BITRATE_OPTIONS_KBPS } from '../../../../shared/defaults';
import type { ExportSettings, OutputFormat } from '../../../../shared/types';
import { FORMAT_LABELS } from '../../lib/labels';
import { Button } from '../ui/Button';
import { Field, Section } from '../ui/Field';
import { Segmented, Select, Toggle } from '../ui/Inputs';

const FORMAT_OPTIONS = (Object.keys(FORMAT_LABELS) as OutputFormat[]).map((value) => ({
  value,
  label: FORMAT_LABELS[value]
}));
const BITRATE_OPTIONS = BITRATE_OPTIONS_KBPS.map((v) => ({ value: v, label: `${v} kbps` }));

export function ExportSection({
  s,
  onChange,
  disabled
}: {
  s: ExportSettings;
  onChange: (patch: Partial<ExportSettings>) => void;
  disabled: boolean;
}) {
  const pickDir = async (): Promise<void> => {
    const dir = await window.api.pickOutputDir(s.outputDir);
    if (dir) onChange({ outputDir: dir });
  };

  const toggleOverwrite = async (checked: boolean): Promise<void> => {
    if (checked) {
      const ok = await window.api.confirm(
        'Sobrescrever os arquivos originais?',
        'Os arquivos originais serão substituídos pelas versões normalizadas. Esta ação não pode ser desfeita. Recomendamos manter uma cópia de segurança.'
      );
      if (!ok) return;
    }
    onChange({ overwriteOriginals: checked });
  };

  return (
    <Section title="Exportação">
      <Field label="Pasta de saída">
        <div className="path-picker">
          <span className={`path-value ${s.outputDir ? '' : 'muted'}`} title={s.outputDir}>
            {s.overwriteOriginals ? 'Os originais serão substituídos' : s.outputDir || 'Nenhuma pasta selecionada'}
          </span>
          <Button size="sm" icon="folder" onClick={pickDir} disabled={disabled || s.overwriteOriginals}>
            Escolher
          </Button>
          {s.outputDir && !s.overwriteOriginals && (
            <Button
              size="sm"
              variant="ghost"
              icon="external"
              aria-label="Abrir pasta de saída"
              title="Abrir pasta de saída"
              onClick={() => void window.api.openPath(s.outputDir)}
            />
          )}
        </div>
      </Field>

      <Toggle
        label="Manter estrutura de pastas"
        hint="Recria as subpastas importadas dentro da saída."
        checked={s.preserveFolderStructure}
        disabled={disabled || s.overwriteOriginals}
        onChange={(preserveFolderStructure) => onChange({ preserveFolderStructure })}
      />

      <div className="field-row">
        <Field label="Sufixo do nome">
          <input
            className="input"
            placeholder="ex.: _normalizado"
            value={s.fileSuffix}
            maxLength={40}
            disabled={disabled || s.overwriteOriginals}
            onChange={(e) => onChange({ fileSuffix: e.target.value.replace(/[<>:"/\\|?*]/g, '') })}
          />
        </Field>
        <Field label="Formato">
          <Select
            value={s.overwriteOriginals ? 'original' : s.outputFormat}
            options={FORMAT_OPTIONS}
            disabled={disabled || s.overwriteOriginals}
            onChange={(outputFormat) => onChange({ outputFormat })}
          />
        </Field>
      </div>

      <Field label="Bitrate (formatos com perda)" hint="Formatos sem perda (FLAC, WAV, ALAC) mantêm a resolução original.">
        <div className="field-row">
          <Segmented
            value={s.bitrateMode}
            disabled={disabled}
            onChange={(bitrateMode) => onChange({ bitrateMode })}
            options={[
              { value: 'original', label: 'Original' },
              { value: 'custom', label: 'Personalizado' }
            ]}
          />
          <Select
            value={s.customBitrateKbps}
            options={BITRATE_OPTIONS}
            disabled={disabled || s.bitrateMode !== 'custom'}
            onChange={(customBitrateKbps) => onChange({ customBitrateKbps })}
          />
        </div>
      </Field>

      <Toggle
        label="Manter metadados"
        hint="Artista, álbum, faixa, ano, gênero…"
        checked={s.keepMetadata}
        disabled={disabled}
        onChange={(keepMetadata) => onChange({ keepMetadata })}
      />
      <Toggle
        label="Manter capa"
        hint="MP3, FLAC e M4A."
        checked={s.keepCover}
        disabled={disabled}
        onChange={(keepCover) => onChange({ keepCover })}
      />
      <Toggle
        label="Sobrescrever arquivos originais"
        hint="Desativado por padrão. Use com cuidado."
        checked={s.overwriteOriginals}
        disabled={disabled}
        onChange={(checked) => void toggleOverwrite(checked)}
      />
    </Section>
  );
}
