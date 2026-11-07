import { useEffect, useState } from 'react';
import type { AuxFileKind, LoopOptions, SplitOptions } from '../../../../shared/media';
import { formatTime, parseTime } from '../../../../core/time';
import { useApp } from '../../state/AppContext';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { NumberField, Segmented } from '../ui/Inputs';

/** Accepts "90", "1:30" or "1:02:03.5". */
export function TimeField({ label, value, onChange, hint }: { label: string; value: number; onChange: (sec: number) => void; hint?: string }) {
  const [text, setText] = useState(formatTime(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => setText(formatTime(value)), [value]);
  const commit = (): void => {
    const parsed = parseTime(text);
    if (parsed === null) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setText(formatTime(parsed));
    if (parsed !== value) onChange(parsed);
  };
  return (
    <Field label={label} hint={invalid ? 'Use segundos ou mm:ss (ex.: 1:30)' : hint}>
      <input
        className={`input mono ${invalid ? 'is-invalid' : ''}`}
        value={text}
        placeholder="0:00"
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Field>
  );
}

export function OutputDirField() {
  const { settingsApi } = useApp();
  const dir = settingsApi.settings?.media.outputDir ?? '';
  const pick = async (): Promise<void> => {
    const chosen = await window.api.pickOutputDir(dir);
    if (chosen) settingsApi.update((s) => ({ ...s, media: { ...s.media, outputDir: chosen } }));
  };
  return (
    <Field label="Pasta de saída" hint="Os originais nunca são alterados; nomes repetidos ganham (1), (2)…">
      <div className="path-picker">
        <span className={`path-value ${dir ? '' : 'muted'}`} title={dir}>
          {dir || 'Nenhuma pasta selecionada'}
        </span>
        <Button size="sm" icon="folder" onClick={() => void pick()}>
          Escolher
        </Button>
        {dir && <Button size="sm" variant="ghost" icon="external" aria-label="Abrir pasta" onClick={() => void window.api.openPath(dir)} />}
      </div>
    </Field>
  );
}

export function AuxFileField({ label, kind, value, onChange }: { label: string; kind: AuxFileKind; value: string; onChange: (path: string) => void }) {
  const pick = async (): Promise<void> => {
    const file = await window.api.pickAuxFile(kind);
    if (file) onChange(file);
  };
  return (
    <Field label={label}>
      <div className="path-picker">
        <span className={`path-value ${value ? '' : 'muted'}`} title={value}>
          {value ? value.split(/[\\/]/).pop() : 'Nenhum arquivo'}
        </span>
        <Button size="sm" icon="file" onClick={() => void pick()}>
          Escolher
        </Button>
      </div>
    </Field>
  );
}

export function SplitForm({ value, onChange }: { value: SplitOptions; onChange: (v: SplitOptions) => void }) {
  const [pointsText, setPointsText] = useState(value.mode === 'points' ? value.points.map(formatTime).join(', ') : '');
  return (
    <>
      <Field label="Dividir por">
        <Segmented
          value={value.mode}
          onChange={(mode) =>
            onChange(mode === 'segments' ? { mode, segmentSec: 60 } : mode === 'parts' ? { mode, parts: 2 } : { mode, points: [] })
          }
          options={[
            { value: 'segments', label: 'Duração' },
            { value: 'parts', label: 'Nº de partes' },
            { value: 'points', label: 'Pontos' }
          ]}
        />
      </Field>
      {value.mode === 'segments' && <TimeField label="Duração de cada parte" value={value.segmentSec} onChange={(segmentSec) => onChange({ mode: 'segments', segmentSec })} />}
      {value.mode === 'parts' && (
        <Field label="Quantidade de partes iguais">
          <NumberField value={value.parts} min={2} max={500} step={1} onChange={(parts) => onChange({ mode: 'parts', parts: Math.round(parts) })} />
        </Field>
      )}
      {value.mode === 'points' && (
        <Field label="Pontos de divisão" hint="Separe por espaço: 0:30 1:45 3:00">
          <input
            className="input mono"
            value={pointsText}
            onChange={(e) => setPointsText(e.target.value)}
            onBlur={() => onChange({ mode: 'points', points: pointsText.split(/[\s;]+|,(?=\s)/).map((t) => parseTime(t.replace(/,$/, ''))).filter((n): n is number => n !== null) })}
          />
        </Field>
      )}
    </>
  );
}

export function LoopForm({ value, onChange }: { value: LoopOptions; onChange: (v: LoopOptions) => void }) {
  const set = (patch: Partial<LoopOptions>): void => onChange({ ...value, ...patch });
  return (
    <>
      <Field label="Modo">
        <Segmented
          value={value.mode}
          onChange={(mode) => set({ mode })}
          options={[
            { value: 'duration', label: 'Até a duração' },
            { value: 'times', label: 'Repetir N vezes' }
          ]}
        />
      </Field>
      {value.mode === 'duration' ? (
        <TimeField label="Duração desejada" value={value.targetSec} onChange={(targetSec) => set({ targetSec })} hint="Ex.: 10:00 para 10 minutos" />
      ) : (
        <Field label="Repetições">
          <NumberField value={value.times} min={1} max={10000} step={1} onChange={(times) => set({ times: Math.round(times) })} />
        </Field>
      )}
      <Field label="Transição entre repetições">
        <Segmented
          value={value.transition}
          onChange={(transition) => set({ transition })}
          options={[
            { value: 'cut', label: 'Corte exato' },
            { value: 'crossfade', label: 'Crossfade' },
            { value: 'fade', label: 'Fade' },
            { value: 'none', label: 'Nenhuma' }
          ]}
        />
      </Field>
      {(value.transition === 'crossfade' || value.transition === 'fade') && (
        <Field label="Duração da transição">
          <NumberField value={value.transitionSec} min={0.1} max={30} step={0.1} suffix="s" onChange={(transitionSec) => set({ transitionSec })} />
        </Field>
      )}
      <p className="field-hint">
        {value.transition === 'none'
          ? 'Repete o arquivo inteiro sem cortar (a duração final é um múltiplo do original).'
          : value.transition === 'cut'
            ? 'Repete sem transição e corta exatamente na duração desejada.'
            : value.transition === 'crossfade'
              ? 'Cria um loop contínuo: o final se mistura ao início a cada repetição.'
              : 'Cada repetição começa com fade in e termina com fade out.'}
      </p>
    </>
  );
}
