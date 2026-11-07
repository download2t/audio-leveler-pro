import type { IconName } from '../ui/Icon';
import { Icon } from '../ui/Icon';

export interface ToolDef<T extends string> {
  id: T;
  label: string;
  icon: IconName;
  description: string;
}

export function ToolPicker<T extends string>({ tools, value, onChange }: { tools: ReadonlyArray<ToolDef<T>>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tool-grid" role="radiogroup">
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          role="radio"
          aria-checked={t.id === value}
          className={`tool ${t.id === value ? 'is-active' : ''}`}
          title={t.description}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={18} />
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
