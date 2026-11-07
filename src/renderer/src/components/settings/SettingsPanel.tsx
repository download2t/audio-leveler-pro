import { MAX_CONCURRENCY } from '../../../../shared/defaults';
import type { AppSettings, EnvironmentInfo } from '../../../../shared/types';
import type { SettingsApi } from '../../hooks/useSettings';
import { Field, Section } from '../ui/Field';
import { NumberField } from '../ui/Inputs';
import { ExportSection } from './ExportSection';
import { NormalizationSection } from './NormalizationSection';

export function SettingsPanel({
  settings,
  api,
  env,
  disabled
}: {
  settings: AppSettings;
  api: SettingsApi;
  env: EnvironmentInfo | null;
  disabled: boolean;
}) {
  return (
    <aside className="settings-panel">
      <NormalizationSection s={settings.normalization} onChange={api.updateNormalization} disabled={disabled} />
      <ExportSection s={settings.export} onChange={api.updateExport} disabled={disabled} />
      <Section title="Desempenho">
        <Field
          label="Arquivos em paralelo"
          hint={env ? `Este computador tem ${env.cpuCount} núcleos lógicos.` : undefined}
        >
          <NumberField
            value={settings.concurrency}
            min={1}
            max={MAX_CONCURRENCY}
            step={1}
            disabled={disabled}
            onChange={(concurrency) => api.update((s) => ({ ...s, concurrency: Math.round(concurrency) }))}
          />
        </Field>
      </Section>
    </aside>
  );
}
