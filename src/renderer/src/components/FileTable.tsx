import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDuration, formatGain, formatLevel } from '../../../core/format';
import type { FileItem, GainResult } from '../../../shared/types';
import { gainFor, type SortKey, type SortState } from '../lib/fileView';
import { NOTE_LABELS, STATUS_LABELS } from '../lib/labels';
import { Button } from './ui/Button';
import { ProgressBar } from './ui/ProgressBar';

const ROW_HEIGHT = 44;
const OVERSCAN = 10;

interface FileTableProps {
  items: readonly FileItem[];
  previews: ReadonlyMap<string, GainResult>;
  selected: ReadonlySet<string>;
  sort: SortState;
  emptyState: ReactNode;
  onSort: (key: SortKey) => void;
  onToggle: (id: string, shiftKey: boolean) => void;
  onToggleAll: (checked: boolean) => void;
  onReveal: (path: string) => void;
}

const COLUMNS: Array<{ key: SortKey; label: string; align?: 'right'; title?: string }> = [
  { key: 'name', label: 'Arquivo' },
  { key: 'duration', label: 'Duração', align: 'right' },
  { key: 'current', label: 'Volume atual', align: 'right' },
  { key: 'final', label: 'Volume final', align: 'right', title: 'Estimado a partir da análise' },
  { key: 'gain', label: 'Ganho', align: 'right' },
  { key: 'status', label: 'Status' }
];

/** Virtualized table: only visible rows are rendered, so thousands of files stay fast. */
export function FileTable(props: FileTableProps) {
  const { items, previews, selected, sort, onSort, onToggleAll } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(items.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  return (
    <div className="table" role="table" aria-rowcount={items.length}>
      <div className="table-scroll" ref={scrollRef} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
        <div className="table-row table-head" role="row">
          <div className="cell cell-check">
            <input
              type="checkbox"
              aria-label="Selecionar todos"
              checked={allSelected}
              disabled={items.length === 0}
              onChange={(e) => onToggleAll(e.target.checked)}
            />
          </div>
          {COLUMNS.map((c) => (
            <button
              key={c.key}
              type="button"
              className={`cell head-cell ${c.align === 'right' ? 'align-right' : ''} ${sort.key === c.key ? 'is-sorted' : ''}`}
              title={c.title}
              onClick={() => onSort(c.key)}
            >
              {c.label}
              {sort.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
            </button>
          ))}
        </div>

        {items.length === 0 ? (
          props.emptyState
        ) : (
          <div className="table-body" style={{ height: items.length * ROW_HEIGHT }}>
            {items.slice(start, end).map((item, offset) => (
              <FileRow
                key={item.id}
                item={item}
                gain={gainFor(item, previews)}
                top={(start + offset) * ROW_HEIGHT}
                selected={selected.has(item.id)}
                onToggle={props.onToggle}
                onReveal={props.onReveal}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  item: FileItem;
  gain: GainResult | undefined;
  top: number;
  selected: boolean;
  onToggle: (id: string, shiftKey: boolean) => void;
  onReveal: (path: string) => void;
}

const FileRow = memo(function FileRow({ item, gain, top, selected, onToggle, onReveal }: RowProps) {
  const p = item.probe;
  const meta = p
    ? [
        p.codec.toUpperCase(),
        p.bitRate ? `${Math.round(p.bitRate / 1000)} kbps` : null,
        p.sampleRate ? `${(p.sampleRate / 1000).toFixed(1)} kHz` : null,
        p.tags.artist
      ]
        .filter(Boolean)
        .join(' · ')
    : item.ext.toUpperCase();

  const unit = gain?.unit ?? 'LUFS';
  const current = gain?.currentLevel ?? item.analysis?.integratedLufs ?? null;
  const notes = gain?.notes.map((n) => NOTE_LABELS[n]).join('\n');
  const busy = item.status === 'analyzing' || item.status === 'processing';

  return (
    <div className={`table-row ${selected ? 'is-selected' : ''}`} role="row" style={{ transform: `translateY(${top}px)` }}>
      <div className="cell cell-check">
        <input
          type="checkbox"
          aria-label={`Selecionar ${item.name}`}
          checked={selected}
          onChange={() => undefined}
          onClick={(e) => onToggle(item.id, e.shiftKey)}
        />
      </div>
      <div className="cell cell-name" title={item.path}>
        <span className="file-name">{item.name}</span>
        <span className="file-meta">{meta}</span>
      </div>
      <div className="cell align-right mono">{formatDuration(p?.durationSec)}</div>
      <div className="cell align-right mono">{formatLevel(current, unit)}</div>
      <div className="cell align-right mono">{gain && !gain.skip ? formatLevel(gain.finalLevel, unit) : '—'}</div>
      <div className="cell align-right mono gain-cell" title={notes || undefined}>
        {gain && !gain.skip ? (
          <>
            {gain.useLimiter && <span className="chip chip-warn">LIM</span>}
            {gain.notes.includes('clipping-risk') && <span className="chip chip-danger">CLIP</span>}
            {gain.notes.includes('max-gain') && <span className="chip">MAX</span>}
            <span className={gain.gainDb > 0 ? 'gain-up' : gain.gainDb < 0 ? 'gain-down' : ''}>{formatGain(gain.gainDb)}</span>
          </>
        ) : (
          '—'
        )}
      </div>
      <div className="cell cell-status" title={item.error}>
        {busy ? (
          <div className="status-progress">
            <span className="status-label">{STATUS_LABELS[item.status]}</span>
            <ProgressBar value={item.progress} size="xs" />
          </div>
        ) : (
          <span className={`badge badge-${item.status}`}>{STATUS_LABELS[item.status]}</span>
        )}
        {item.status === 'done' && item.outputPath && (
          <Button
            variant="ghost"
            size="sm"
            icon="external"
            aria-label="Mostrar arquivo gerado"
            title="Mostrar arquivo gerado"
            onClick={() => onReveal(item.outputPath as string)}
          />
        )}
      </div>
    </div>
  );
});
