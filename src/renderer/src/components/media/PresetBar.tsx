import { useState } from 'react';
import type { AudioConvertOptions, Preset, VideoConvertOptions } from '../../../../shared/media';
import { errorText } from '../../lib/labels';
import { useApp } from '../../state/AppContext';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';
import { Modal } from '../ui/Modal';

type PresetBarProps =
  | { module: 'audio-convert'; current: AudioConvertOptions; onApply: (o: AudioConvertOptions) => void }
  | { module: 'video-convert'; current: VideoConvertOptions; onApply: (o: VideoConvertOptions) => void };

export function PresetBar(props: PresetBarProps) {
  const { presets, notify } = useApp();
  const list = presets.presets.filter((p) => p.module === props.module);
  const [selected, setSelected] = useState('');
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const current = list.find((p) => p.id === selected);

  const apply = (id: string): void => {
    setSelected(id);
    const preset = list.find((p) => p.id === id);
    if (!preset) return;
    if (preset.module === 'audio-convert' && props.module === 'audio-convert') props.onApply(preset.options);
    if (preset.module === 'video-convert' && props.module === 'video-convert') props.onApply(preset.options);
  };

  const save = async (): Promise<void> => {
    try {
      const preset = { id: '', name, module: props.module, builtin: false, options: props.current } as Preset;
      await presets.save(preset);
      notify(`Preset "${name.trim()}" salvo.`, 'success');
      setNaming(false);
      setName('');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  };

  return (
    <div className="preset-bar">
      <select className="input" value={selected} onChange={(e) => apply(e.target.value)}>
        <option value="">Presets…</option>
        <optgroup label="Prontos">
          {list.filter((p) => p.builtin).map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </optgroup>
        {list.some((p) => !p.builtin) && (
          <optgroup label="Meus presets">
            {list.filter((p) => !p.builtin).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </optgroup>
        )}
      </select>
      <Button icon="star" size="sm" onClick={() => setNaming(true)} title="Salvar as opções atuais como preset">
        Salvar
      </Button>
      {current && !current.builtin && (
        <Button
          icon="trash"
          size="sm"
          variant="ghost"
          aria-label="Excluir preset"
          onClick={() => void presets.remove(current.id).then(() => setSelected(''))}
        />
      )}
      {naming && (
        <Modal
          title="Salvar preset"
          onClose={() => setNaming(false)}
          footer={
            <>
              <Button onClick={() => setNaming(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => void save()} disabled={!name.trim()}>
                Salvar preset
              </Button>
            </>
          }
        >
          <Field label="Nome do preset">
            <input className="input" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && name.trim() && void save()} placeholder="Ex.: Meu canal 1080p" />
          </Field>
        </Modal>
      )}
    </div>
  );
}
