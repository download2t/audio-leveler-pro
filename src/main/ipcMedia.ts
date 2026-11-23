import { BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { IPC } from '../shared/ipc';
import {
  AUDIO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  PHOTO_EXTENSIONS,
  SUBTITLE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  type AuxFileKind,
  type MediaKind,
  type OperationRequest,
  type Preset,
  type QueueAction
} from '../shared/media';
import { scanPaths } from './lib/fileScanner';
import { extensionOf } from '../core/pathUtils';
import { probeImage } from './media/imageTools';
import type { MediaProbe } from './media/probe';
import type { AudioConverterService } from './services/AudioConverterService';
import type { AudioEditorService } from './services/AudioEditorService';
import type { BatchProcessingService } from './services/BatchProcessingService';
import type { ImageConverterService } from './services/ImageConverterService';
import type { VideoConverterService } from './services/VideoConverterService';
import type { VideoEditorService } from './services/VideoEditorService';
import type { HistoryStore } from './stores/historyStore';
import type { PresetStore } from './stores/presetStore';

export interface MediaIpcContext {
  probe: MediaProbe;
  queue: BatchProcessingService;
  presets: PresetStore;
  history: HistoryStore;
  audioConverter: AudioConverterService;
  videoConverter: VideoConverterService;
  audioEditor: AudioEditorService;
  videoEditor: VideoEditorService;
  imageConverter: ImageConverterService;
}

const extensionsFor = (kind: MediaKind): string[] => {
  switch (kind) {
    case 'audio': return AUDIO_EXTENSIONS;
    case 'video': return VIDEO_EXTENSIONS;
    case 'image': return PHOTO_EXTENSIONS;
    case 'media': return [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];
    case 'all': return [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS, ...PHOTO_EXTENSIONS];
  }
};
const PHOTO_SET = new Set(PHOTO_EXTENSIONS);
const KIND_FILTER_NAME: Record<MediaKind, string> = { audio: 'Áudio', video: 'Vídeo', image: 'Imagens', media: 'Mídia', all: 'Mídia e imagens' };

const AUX_FILTERS: Record<AuxFileKind, Electron.FileFilter[]> = {
  audio: [{ name: 'Áudio', extensions: AUDIO_EXTENSIONS }],
  image: [{ name: 'Imagem', extensions: IMAGE_EXTENSIONS }],
  subtitle: [{ name: 'Legenda', extensions: SUBTITLE_EXTENSIONS }],
  executable: process.platform === 'win32' ? [{ name: 'Executável', extensions: ['exe'] }] : []
};

async function openDialog(event: IpcMainInvokeEvent, options: Electron.OpenDialogOptions): Promise<string[]> {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  return result.canceled ? [] : result.filePaths;
}

function isOperationRequest(value: unknown): value is OperationRequest {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    ['audio-convert', 'video-convert', 'audio-edit', 'video-edit', 'image-convert'].includes(r['module'] as string) &&
    Array.isArray(r['files']) &&
    (r['files'] as unknown[]).every((f) => typeof f === 'string') &&
    typeof r['outputDir'] === 'string'
  );
}

export function registerMediaIpc(ctx: MediaIpcContext): void {
  const broadcast = (channel: string, payload: unknown): void => {
    for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload);
  };
  ctx.history.subscribe((entries) => broadcast(IPC.historyEvent, entries));

  const serviceFor = (req: OperationRequest) => {
    switch (req.module) {
      case 'audio-convert':
        return { preview: () => ctx.audioConverter.preview(req), enqueue: () => ctx.audioConverter.enqueue(req) };
      case 'video-convert':
        return { preview: () => ctx.videoConverter.preview(req), enqueue: () => ctx.videoConverter.enqueue(req) };
      case 'audio-edit':
        return { preview: () => ctx.audioEditor.preview(req), enqueue: () => ctx.audioEditor.enqueue(req) };
      case 'image-convert':
        return { preview: () => ctx.imageConverter.preview(req), enqueue: () => ctx.imageConverter.enqueue(req) };
      case 'video-edit':
        return { preview: () => ctx.videoEditor.preview(req), enqueue: () => ctx.videoEditor.enqueue(req) };
    }
  };

  ipcMain.handle(IPC.pickMedia, (event, kind: MediaKind) =>
    openDialog(event, {
      title: 'Adicionar arquivos',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: KIND_FILTER_NAME[kind] ?? 'Mídia', extensions: extensionsFor(kind) }]
    })
  );

  ipcMain.handle(IPC.pickAuxFile, async (event, kind: AuxFileKind) => {
    const files = await openDialog(event, { title: 'Escolher arquivo', properties: ['openFile'], filters: AUX_FILTERS[kind] ?? [] });
    return files[0] ?? null;
  });

  ipcMain.handle(IPC.scanMedia, (_event, paths: unknown, kind: MediaKind) =>
    scanPaths(Array.isArray(paths) ? paths.filter((p): p is string => typeof p === 'string') : [], extensionsFor(kind))
  );

  ipcMain.handle(IPC.probeMedia, (_event, path: unknown) => {
    if (typeof path !== 'string') throw new Error('Caminho inválido');
    // Photos are read with sharp (EXIF orientation, AVIF); audio/video with ffprobe.
    return PHOTO_SET.has(extensionOf(path)) ? probeImage(path) : ctx.probe.probe(path);
  });

  ipcMain.handle(IPC.previewOperation, (_event, req: unknown) => {
    if (!isOperationRequest(req)) throw new Error('Requisição inválida');
    return serviceFor(req).preview();
  });

  ipcMain.handle(IPC.enqueueOperation, (_event, req: unknown) => {
    if (!isOperationRequest(req)) throw new Error('Requisição inválida');
    return serviceFor(req).enqueue();
  });

  ipcMain.handle(IPC.getQueue, () => ctx.queue.snapshot());

  ipcMain.handle(IPC.queueAction, (_event, action: QueueAction) => {
    switch (action?.type) {
      case 'pause': return ctx.queue.pause();
      case 'resume': return ctx.queue.resume();
      case 'cancelAll': return ctx.queue.cancelAll();
      case 'clearFinished': return ctx.queue.clearFinished();
      case 'cancel': return ctx.queue.cancel(action.id);
      case 'retry': return ctx.queue.retry(action.id);
      case 'remove': return ctx.queue.remove(action.id);
      case 'move': return ctx.queue.move(action.id, action.direction);
    }
  });

  ipcMain.handle(IPC.listPresets, () => ctx.presets.list());
  ipcMain.handle(IPC.savePreset, (_event, preset: Preset) => ctx.presets.save(preset));
  ipcMain.handle(IPC.deletePreset, (_event, id: unknown) => ctx.presets.delete(String(id)));
  ipcMain.handle(IPC.listHistory, () => ctx.history.list());
  ipcMain.handle(IPC.clearHistory, () => ctx.history.clear());
}
