import type {
  AuxFileKind,
  HistoryEntry,
  MediaInfo,
  MediaKind,
  OperationPreview,
  OperationRequest,
  Preset,
  QueueAction,
  QueueSnapshot
} from './media';
import type {
  AppSettings,
  BatchEvent,
  BatchReport,
  BatchRequest,
  EnvironmentInfo,
  ScanResult
} from './types';

export const IPC = {
  pickFiles: 'dialog:pick-files',
  pickFolders: 'dialog:pick-folders',
  pickOutputDir: 'dialog:pick-output-dir',
  confirm: 'dialog:confirm',
  scanPaths: 'files:scan',
  startBatch: 'batch:start',
  cancelBatch: 'batch:cancel',
  batchEvent: 'batch:event',
  getSettings: 'settings:get',
  saveSettings: 'settings:save',
  openPath: 'shell:open-path',
  showItem: 'shell:show-item',
  openLogs: 'app:open-logs',
  saveReport: 'report:save',
  getEnvironment: 'app:environment',
  pickMedia: 'dialog:pick-media',
  pickAuxFile: 'dialog:pick-aux-file',
  scanMedia: 'media:scan',
  probeMedia: 'media:probe',
  previewOperation: 'ops:preview',
  enqueueOperation: 'ops:enqueue',
  getQueue: 'queue:get',
  queueAction: 'queue:action',
  queueEvent: 'queue:event',
  listPresets: 'presets:list',
  savePreset: 'presets:save',
  deletePreset: 'presets:delete',
  listHistory: 'history:list',
  clearHistory: 'history:clear',
  historyEvent: 'history:event'
} as const;

/** API exposed to the renderer as `window.api` by the preload script. */
export interface AudioLevelerApi {
  getPathForFile(file: File): string;
  pickFiles(): Promise<string[]>;
  pickFolders(): Promise<string[]>;
  pickOutputDir(current?: string): Promise<string | null>;
  confirm(message: string, detail?: string): Promise<boolean>;
  scanPaths(paths: string[]): Promise<ScanResult>;
  startBatch(request: BatchRequest): Promise<BatchReport>;
  cancelBatch(): Promise<void>;
  onBatchEvent(listener: (event: BatchEvent) => void): () => void;
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  openPath(path: string): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
  openLogs(): Promise<void>;
  saveReport(content: string, defaultName: string): Promise<string | null>;
  getEnvironment(): Promise<EnvironmentInfo>;

  // Media suite
  pickMedia(kind: MediaKind): Promise<string[]>;
  pickAuxFile(kind: AuxFileKind): Promise<string | null>;
  scanMedia(paths: string[], kind: MediaKind): Promise<ScanResult>;
  probeMedia(path: string): Promise<MediaInfo>;
  previewOperation(request: OperationRequest): Promise<OperationPreview>;
  enqueueOperation(request: OperationRequest): Promise<number>;
  getQueue(): Promise<QueueSnapshot>;
  queueAction(action: QueueAction): Promise<void>;
  onQueueEvent(listener: (snapshot: QueueSnapshot) => void): () => void;
  listPresets(): Promise<Preset[]>;
  savePreset(preset: Preset): Promise<Preset[]>;
  deletePreset(id: string): Promise<Preset[]>;
  listHistory(): Promise<HistoryEntry[]>;
  clearHistory(): Promise<void>;
  onHistoryEvent(listener: (entries: HistoryEntry[]) => void): () => void;
}
