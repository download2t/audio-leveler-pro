import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { computeBatchGains, type GainInput } from '../../../../core/gain';
import { computeBatchStats, itemsToCsv } from '../../../../core/stats';
import type { BatchMode, FileItem } from '../../../../shared/types';
import { ActionBar } from '../../components/ActionBar';
import { FileTable } from '../../components/FileTable';
import { DropOverlay, EmptyState } from '../../components/Overlays';
import { ReportModal } from '../../components/ReportModal';
import { SettingsPanel } from '../../components/settings/SettingsPanel';
import { StatsBar } from '../../components/StatsBar';
import { Toolbar } from '../../components/Toolbar';
import { Button } from '../../components/ui/Button';
import { useBatch } from '../../hooks/useBatch';
import { useFileDrop } from '../../hooks/useFileDrop';
import { filterItems, sortItems, type SortKey, type SortState, type StatusFilter } from '../../lib/fileView';
import { errorText } from '../../lib/labels';
import { ModuleHeader } from '../../shell/ModuleLayout';
import { useApp } from '../../state/AppContext';
import { filesReducer, initialFilesState, pathKey } from '../../state/filesReducer';

/** Loudness normalization module (the original Audio Leveler Pro screen). */
export function NormalizerModule({ active }: { active: boolean }) {
  const { settingsApi, env, notify } = useApp();
  const { settings } = settingsApi;
  const [files, dispatch] = useReducer(filesReducer, initialFilesState);
  const batch = useBatch(dispatch);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sort, setSort] = useState<SortState>({ key: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const lastClicked = useRef<string | null>(null);

  const items = files.items;
  const busy = batch.running || importing;

  // Gains are recomputed live from cached analyses, so changing the target updates the table instantly.
  const previews = useMemo(() => {
    if (!settings) return new Map();
    const inputs: GainInput[] = [];
    for (const i of items) {
      if (i.analysis && i.probe) {
        inputs.push({ id: i.id, path: i.path, durationSec: i.probe.durationSec, analysis: i.analysis, tags: i.probe.tags });
      }
    }
    return computeBatchGains(inputs, settings.normalization);
  }, [items, settings]);

  const visible = useMemo(
    () => sortItems(filterItems(items, query, statusFilter), sort, previews),
    [items, query, statusFilter, sort, previews]
  );
  const stats = useMemo(() => computeBatchStats(items, previews), [items, previews]);

  // Drop selection entries for files that no longer exist.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(items.map((i) => i.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const addPaths = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      setImporting(true);
      try {
        const result = await window.api.scanPaths(paths);
        const known = new Set(items.map((i) => pathKey(i.path)));
        const fresh = result.files.filter((f) => !known.has(pathKey(f.path)));
        dispatch({ type: 'add', entries: fresh });
        const parts = [`${fresh.length} arquivo(s) adicionado(s)`];
        if (result.files.length - fresh.length > 0) parts.push(`${result.files.length - fresh.length} já na lista`);
        if (result.ignored > 0) parts.push(`${result.ignored} ignorado(s) (formato não suportado)`);
        notify(parts.join(' · '), fresh.length > 0 ? 'success' : 'info');
        if (result.errors.length > 0) notify(`${result.errors.length} caminho(s) não puderam ser lidos. Veja os logs.`, 'error');
      } catch (err) {
        notify(errorText(err), 'error');
      } finally {
        setImporting(false);
      }
    },
    [items, notify]
  );

  const dragging = useFileDrop((paths) => void addPaths(paths), active && !busy);

  const pickFiles = useCallback(async () => addPaths(await window.api.pickFiles()), [addPaths]);
  const pickFolders = useCallback(async () => addPaths(await window.api.pickFolders()), [addPaths]);

  const removeSelected = useCallback(() => {
    dispatch({ type: 'remove', ids: selected });
    setSelected(new Set());
  }, [selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName) && target.getAttribute('type') !== 'checkbox') return;
      if (e.key === 'Delete' && active && !busy && selected.size > 0) removeSelected();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, busy, selected, removeSelected]);

  const toggle = useCallback(
    (id: string, shiftKey: boolean) => {
      setSelected((prev) => {
        const next = new Set(prev);
        const anchor = lastClicked.current;
        if (shiftKey && anchor) {
          const a = visible.findIndex((i) => i.id === anchor);
          const b = visible.findIndex((i) => i.id === id);
          if (a >= 0 && b >= 0) {
            for (const item of visible.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(item.id);
            return next;
          }
        }
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      lastClicked.current = id;
    },
    [visible]
  );

  const toggleAll = useCallback(
    (checked: boolean) => setSelected(checked ? new Set(visible.map((i) => i.id)) : new Set()),
    [visible]
  );

  const changeSort = useCallback(
    (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })),
    []
  );

  const targets: FileItem[] = useMemo(
    () => (selected.size > 0 ? items.filter((i) => selected.has(i.id)) : items),
    [items, selected]
  );

  const run = useCallback(
    async (mode: BatchMode) => {
      if (!settings || targets.length === 0) return;
      let reanalyze = false;
      let list = targets;
      if (mode === 'analyze') {
        const pending = targets.filter((t) => !t.analysis);
        // Everything already analyzed: measure again.
        if (pending.length === 0) reanalyze = true;
        else list = pending;
      } else if (settings.export.overwriteOriginals) {
        const ok = await window.api.confirm(
          `Substituir ${targets.length} arquivo(s) original(is)?`,
          'Os arquivos originais serão sobrescritos pelas versões normalizadas.'
        );
        if (!ok) return;
      } else if (!settings.export.outputDir) {
        notify('Escolha uma pasta de saída antes de normalizar.', 'error');
        return;
      }
      const error = await batch.start(mode, list, settings, reanalyze);
      if (error) notify(error, 'error');
    },
    [batch, notify, settings, targets]
  );

  const saveCsv = useCallback(async () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    try {
      const saved = await window.api.saveReport(itemsToCsv(items), `audio-leveler-relatorio-${stamp}.csv`);
      if (saved) notify(`Relatório salvo em ${saved}`, 'success');
    } catch (err) {
      notify(errorText(err), 'error');
    }
  }, [items, notify]);

  if (!settings) return null;

  return (
    <div className="module">
      <ModuleHeader
        icon="wave"
        title="Normalizador de Áudio"
        subtitle="Nivela o volume de centenas de músicas por LUFS, ReplayGain, Pico ou RMS"
        actions={
          <Button variant="ghost" icon="log" onClick={() => void window.api.openLogs()}>
            Logs
          </Button>
        }
      />
      <div className="normalizer-body">
        <SettingsPanel settings={settings} api={settingsApi} env={env} disabled={batch.running} />
        <main className="main">
          <Toolbar
            query={query}
            onQuery={setQuery}
            filter={statusFilter}
            onFilter={setStatusFilter}
            selectedCount={selected.size}
            visibleCount={visible.length}
            totalCount={items.length}
            disabled={busy}
            onAddFiles={() => void pickFiles()}
            onAddFolder={() => void pickFolders()}
            onRemoveSelected={removeSelected}
            onClear={() => dispatch({ type: 'clear' })}
          />
          <StatsBar stats={stats} />
          <FileTable
            items={visible}
            previews={previews}
            selected={selected}
            sort={sort}
            onSort={changeSort}
            onToggle={toggle}
            onToggleAll={toggleAll}
            onReveal={(p) => void window.api.showItemInFolder(p)}
            emptyState={
              items.length === 0 ? (
                <EmptyState onAddFiles={() => void pickFiles()} onAddFolder={() => void pickFolders()} />
              ) : (
                <div className="empty-filter">Nenhum arquivo corresponde ao filtro.</div>
              )
            }
          />
        </main>
      </div>
      <ActionBar
        running={batch.running}
        progress={batch.progress}
        targetCount={targets.length}
        selectionActive={selected.size > 0}
        canAnalyze={!busy && targets.length > 0}
        canNormalize={!busy && targets.length > 0 && env?.ffmpegVersion != null}
        onAnalyze={() => void run('analyze')}
        onNormalize={() => void run('normalize')}
        onCancel={batch.cancel}
      />
      {dragging && <DropOverlay />}
      {importing && <div className="importing">Importando arquivos…</div>}
      {batch.report && (
        <ReportModal
          report={batch.report}
          onClose={batch.dismissReport}
          onOpenOutput={(dir) => void window.api.openPath(dir)}
          onSaveCsv={() => void saveCsv()}
        />
      )}
    </div>
  );
}
