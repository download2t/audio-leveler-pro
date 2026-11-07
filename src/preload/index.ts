import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { IPC, type AudioLevelerApi } from '../shared/ipc';
import type { HistoryEntry, QueueSnapshot } from '../shared/media';
import type { BatchEvent } from '../shared/types';

function subscribe<T>(channel: string, listener: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T): void => listener(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: AudioLevelerApi = {
  getPathForFile: (file) => webUtils.getPathForFile(file),
  pickFiles: () => ipcRenderer.invoke(IPC.pickFiles),
  pickFolders: () => ipcRenderer.invoke(IPC.pickFolders),
  pickOutputDir: (current) => ipcRenderer.invoke(IPC.pickOutputDir, current),
  confirm: (message, detail) => ipcRenderer.invoke(IPC.confirm, message, detail),
  scanPaths: (paths) => ipcRenderer.invoke(IPC.scanPaths, paths),
  startBatch: (request) => ipcRenderer.invoke(IPC.startBatch, request),
  cancelBatch: () => ipcRenderer.invoke(IPC.cancelBatch),
  onBatchEvent: (listener) => subscribe<BatchEvent>(IPC.batchEvent, listener),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (settings) => ipcRenderer.invoke(IPC.saveSettings, settings),
  openPath: (path) => ipcRenderer.invoke(IPC.openPath, path),
  showItemInFolder: (path) => ipcRenderer.invoke(IPC.showItem, path),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
  saveReport: (content, defaultName) => ipcRenderer.invoke(IPC.saveReport, content, defaultName),
  getEnvironment: () => ipcRenderer.invoke(IPC.getEnvironment),
  pickMedia: (kind) => ipcRenderer.invoke(IPC.pickMedia, kind),
  pickAuxFile: (kind) => ipcRenderer.invoke(IPC.pickAuxFile, kind),
  scanMedia: (paths, kind) => ipcRenderer.invoke(IPC.scanMedia, paths, kind),
  probeMedia: (path) => ipcRenderer.invoke(IPC.probeMedia, path),
  previewOperation: (request) => ipcRenderer.invoke(IPC.previewOperation, request),
  enqueueOperation: (request) => ipcRenderer.invoke(IPC.enqueueOperation, request),
  getQueue: () => ipcRenderer.invoke(IPC.getQueue),
  queueAction: (action) => ipcRenderer.invoke(IPC.queueAction, action),
  onQueueEvent: (listener) => subscribe<QueueSnapshot>(IPC.queueEvent, listener),
  listPresets: () => ipcRenderer.invoke(IPC.listPresets),
  savePreset: (preset) => ipcRenderer.invoke(IPC.savePreset, preset),
  deletePreset: (id) => ipcRenderer.invoke(IPC.deletePreset, id),
  listHistory: () => ipcRenderer.invoke(IPC.listHistory),
  clearHistory: () => ipcRenderer.invoke(IPC.clearHistory),
  onHistoryEvent: (listener) => subscribe<HistoryEntry[]>(IPC.historyEvent, listener)
};

contextBridge.exposeInMainWorld('api', api);
