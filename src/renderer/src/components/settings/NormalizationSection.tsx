import { LUFS_PRESETS } from '../../../../shared/defaults';
import type { NormalizationSettings, PeakProtection } from '../../../../shared/types';
import { LUFS_PRESET_HINTS } from '../../lib/labels';
import { Field, Section } from '../ui/Field';
import { NumberField, Segmented, Select, Toggle } from '../ui/Inputs';

const PROTECTION_OPTIONS: Array<{ value: PeakProtection; label: string }> = [
  { value: 'limiter', label: 'Limitador (mantém o alvo)' },
  { value: 'reduce', label: 'Reduzir ganho (sem limitador)' },
  { value: 'none', label: 'Nenhuma' }
];

export function NormalizationSection({
  s,
  onChange,
  disabled
}: {
  s: NormalizationSettings;
  onChange: (patch: Partial<NormalizationSettings>) => void;
  disabled: boolean;
}) {
  const isPreset = (LUFS_PRESETS as readonly number[]).includes(s.lufsTarget);

  return (
    <Section title="Normalização">
      <Segmented
        value={s.mode}
        disabled={disabled}
        onChange={(mode) => onChange({ mode })}
        options={[
          { value: 'lufs', label: 'LUFS', badge: 'Recomendado' },
          { value: 'replaygain', label: 'ReplayGain' },
          { value: 'peak', label: 'Pico' },
          { value: 'rms', label: 'RMS' }
        ]}
      />

      {s.mode === 'lufs' && (
        <>
          <Field label="Alvo de loudness integrado" hint="Medido com o filtro loudnorm (EBU R128).">
            <div className="preset-grid">
              {LUFS_PRESETS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`preset ${s.lufsTarget === v ? 'is-active' : ''}`}
                  disabled={disabled}
                  onClick={() => onChange({ lufsTarget: v })}
                >
                  <strong>{v}</strong>
                  <span>{LUFS_PRESET_HINTS[v]}</span>
                </button>
              ))}
            </div>
          </Field>
          <Field label={isPreset ? 'Valor personalizado' : 'Valor personalizado (ativo)'}>
            <NumberField
              value={s.lufsTarget}
              min={-40}
              max={-5}
              step={0.5}
              suffix="LUFS"
              disabled={disabled}
              onChange={(lufsTarget) => onChange({ lufsTarget })}
            />
          </Field>
        </>
      )}

      {s.mode === 'replaygain' && (
        <>
          <Field label="Tipo de ganho">
            <Segmented
              value={s.replayGainType}
              disabled={disabled}
              onChange={(replayGainType) => onChange({ replayGainType })}
              options={[
                { value: 'track', label: 'Track Gain' },
                { value: 'album', label: 'Album Gain' }
              ]}
            />
          </Field>
          {s.replayGainType === 'album' && (
            <Field label="Agrupar álbuns por" hint="Todas as faixas do álbum recebem o mesmo ganho.">
              <Select
                value={s.albumGrouping}
                disabled={disabled}
                onChange={(albumGrouping) => onChange({ albumGrouping })}
                options={[
                  { value: 'tag', label: 'Tag de álbum (fallback: pasta)' },
                  { value: 'folder', label: 'Pasta' }
                ]}
              />
            </Field>
          )}
          <Field label="Referência" hint="ReplayGain 2.0 usa −18 LUFS.">
            <NumberField
              value={s.replayGainReference}
              min={-30}
              max={-10}
              suffix="LUFS"
              disabled={disabled}
              onChange={(replayGainReference) => onChange({ replayGainReference })}
            />
          </Field>
          <Toggle
            label="Usar tags ReplayGain existentes"
            hint="Quando o arquivo já tiver REPLAYGAIN_*_GAIN."
            checked={s.useExistingReplayGainTags}
            disabled={disabled}
            onChange={(useExistingReplayGainTags) => onChange({ useExistingReplayGainTags })}
          />
        </>
      )}

      {s.mode === 'peak' && (
        <Field label="Pico alvo" hint="O maior pico (sample peak) de cada faixa vai para este valor.">
          <NumberField
            value={s.peakTarget}
            min={-30}
            max={0}
            step={0.1}
            suffix="dBFS"
            disabled={disabled}
            onChange={(peakTarget) => onChange({ peakTarget })}
          />
        </Field>
      )}

      {s.mode === 'rms' && (
        <Field label="RMS alvo" hint="Nível RMS médio da faixa inteira.">
          <NumberField
            value={s.rmsTarget}
            min={-40}
            max={-3}
            step={0.5}
            suffix="dBFS"
            disabled={disabled}
            onChange={(rmsTarget) => onChange({ rmsTarget })}
          />
        </Field>
      )}

      {s.mode !== 'peak' && (
        <div className="field-row">
          <Field label="Proteção de pico">
            <Select
              value={s.peakProtection}
              options={PROTECTION_OPTIONS}
              disabled={disabled}
              onChange={(peakProtection) => onChange({ peakProtection })}
            />
          </Field>
          <Field label="Teto (true peak)">
            <NumberField
              value={s.truePeakCeiling}
              min={-9}
              max={0}
              step={0.1}
              suffix="dBTP"
              disabled={disabled || s.peakProtection === 'none'}
              onChange={(truePeakCeiling) => onChange({ truePeakCeiling })}
            />
          </Field>
        </div>
      )}

      <Field label="Ganho máximo" hint="Evita amplificar demais faixas muito baixas.">
        <NumberField
          value={s.maxGain}
          min={0}
          max={40}
          step={1}
          suffix="dB"
          disabled={disabled}
          onChange={(maxGain) => onChange({ maxGain })}
        />
      </Field>
    </Section>
  );
}
