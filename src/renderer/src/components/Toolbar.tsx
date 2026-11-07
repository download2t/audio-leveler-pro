import type { StatusFilter } from '../lib/fileView';
import { Button } from './ui/Button';
import { Icon } from './ui/Icon';
import { Select } from './ui/Inputs';

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Todos os status' },
  { value: 'pending', label: 'Pendentes' },
  { value: 'analyzed', label: 'Analisados' },
  { value: 'done', label: 'Concluídos' },
  { value: 'error', label: 'Com erro' },
  { value: 'skipped', label: 'Ignorados' }
];

export function Toolbar({
  query,
  onQuery,
  filter,
  onFilter,
  selectedCount,
  visibleCount,
  totalCount,
  disabled,
  onAddFiles,
  onAddFolder,
  onRemoveSelected,
  onClear
}: {
  query: string;
  onQuery: (q: string) => void;
  filter: StatusFilter;
  onFilter: (f: StatusFilter) => void;
  selectedCount: number;
  visibleCount: number;
  totalCount: number;
  disabled: boolean;
  onAddFiles: () => void;
  onAddFolder: () => void;
  onRemoveSelected: () => void;
  onClear: () => void;
}) {
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <Button variant="primary" icon="plus" onClick={onAddFiles} disabled={disabled}>
          Arquivos
        </Button>
        <Button icon="folder" onClick={onAddFolder} disabled={disabled}>
          Pasta
        </Button>
        <span className="toolbar-sep" />
        <Button icon="trash" onClick={onRemoveSelected} disabled={disabled || selectedCount === 0}>
          Remover{selectedCount > 0 ? ` (${selectedCount})` : ''}
        </Button>
        <Button variant="ghost" onClick={onClear} disabled={disabled || totalCount === 0}>
          Limpar lista
        </Button>
      </div>
      <div className="toolbar-group">
        <div className="search">
          <Icon name="search" size={14} />
          <input
            className="input"
            placeholder="Buscar por nome, artista, álbum…"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
          {query && (
            <button type="button" className="search-clear" aria-label="Limpar busca" onClick={() => onQuery('')}>
              <Icon name="x" size={12} />
            </button>
          )}
        </div>
        <Select value={filter} options={FILTERS} onChange={onFilter} />
        <span className="toolbar-count">
          {visibleCount === totalCount ? `${totalCount} arquivos` : `${visibleCount} de ${totalCount}`}
        </span>
      </div>
    </div>
  );
}
