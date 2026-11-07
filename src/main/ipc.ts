import { cpus } from 'node:os';
import { writeFile } from 'node:fs/promises';
import { app, BrowserWindow, dialog, ipcMain, powerSaveBlocker, shell, type IpcMainInvokeEvent } from 'electron';
import { SUPPORTED_EXTENSIONS } from '../shared/defaults';
import { IPC } from '../shared/ipc';
import type { BatchRequest, EnvironmentInfo } from '../shared/types';
import { getFfmpegVersion, resolveBinaries } from './ffmpeg/locator';
import { scanPaths } from './lib/fileScanner';
import { logger } from './logger';
import type { HistoryEntry } from '../shared/media';
import { NormalizerService } from './services/NormalizerService';
import type { SettingsStore } from './settingsStore';

const log = logger.scope('ipc');

const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];

const windowOf = (event: IpcMainInvokeEvent): BrowserWindow | undefined =>
  BrowserWindow.fromWebContents(event.sender) ?? undefined;

const AUDIO_FILTER = { name: 'Áudio', extensions: [...SUPPORTED_EXTENSIONS] };

export function registerIpc(store: SettingsStore, onHistory: (entry: HistoryEntry) => void): void {
  let batchSender: Electron.WebContents | null = null;
  const processor = new NormalizerService(
    {
      log: logger.scope('batch'),
      emit: (event) => {
        if (batchSender && !batchSender.isDestroyed()) batchSender.send(IPC.batchEvent, event);
      }
    },
    onHistory
  );

  ipcMain.handle(IPC.pickFiles, async (event) => {
    const win = windowOf(event);
    const options: Electron.OpenDialogOptions = {
      title: 'Adicionar arquivos de áudio',
      properties: ['openFile', 'multiSelections'],
      filters: [AUDIO_FILTER]
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC.pickFolders, async (event) => {
    const win = windowOf(event);
    const options: Electron.OpenDialogOptions = {
      title: 'Adicionar pastas',
      properties: ['openDirectory', 'multiSelections']
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle(IPC.pickOutputDir, async (event, current: unknown) => {
    const win = windowOf(event);
    const options: Electron.OpenDialogOptions = {
      title: 'Pasta de saída',
      defaultPath: typeof current === 'string' && current ? current : undefined,
      properties: ['openDirectory', 'createDirectory']
    };
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
    return result.canceled ? null : (result.filePaths[0] ?? null);
  });

  ipcMain.handle(IPC.confirm, async (event, message: unknown, detail: unknown) => {
    const win = windowOf(event);
    const options: Electron.MessageBoxOptions = {
      type: 'warning',
      buttons: ['Cancelar', 'Confirmar'],
      defaultId: 0,
      cancelId: 0,
      message: String(message),
      detail: typeof detail === 'string' ? detail : undefined
    };
    const result = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
    return result.response === 1;
  });

  ipcMain.handle(IPC.scanPaths, async (_event, paths: unknown) => {
    const list = stringArray(paths);
    const result = await scanPaths(list);
    log.info(`Importação: ${result.files.length} arquivo(s), ${result.ignored} ignorado(s)`, {
      inputs: list.length,
      errors: result.errors.length
    });
    return result;
  });

  ipcMain.handle(IPC.startBatch, async (event, request: BatchRequest) => {
    batchSender = event.sender;
    const settings = store.get();
    const binaries = resolveBinaries(settings);
    const blocker = powerSaveBlocker.start('prevent-app-suspension');
    try {
      return await processor.run(request, binaries);
    } finally {
      powerSaveBlocker.stop(blocker);
    }
  });

  ipcMain.handle(IPC.cancelBatch, () => {
    processor.cancel();
  });

  ipcMain.handle(IPC.getSettings, () => store.get());
  ipcMain.handle(IPC.saveSettings, (_event, settings: unknown) => store.save(settings));

  ipcMain.handle(IPC.openPath, async (_event, target: unknown) => {
    if (typeof target !== 'string' || !target) return;
    const error = await shell.openPath(target);
    if (error) log.warn(`Não foi possível abrir ${target}: ${error}`);
  });

  ipcMain.handle(IPC.showItem, (_event, target: unknown) => {
    if (typeof target === 'string' && target) shell.showItemInFolder(target);
  });

  ipcMain.handle(IPC.openLogs, async () => {
    if (logger.file) shell.showItemInFolder(logger.file);
  });

  ipcMain.handle(IPC.saveReport, async (event, content: unknown, defaultName: unknown) => {
    const win = windowOf(event);
    const options: Electron.SaveDialogOptions = {
      title: 'Salvar relatório',
      defaultPath: typeof defaultName === 'string' ? defaultName : 'relatorio.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    // BOM so Excel detects UTF-8 accents.
    await writeFile(result.filePath, `﻿${String(content)}`, 'utf8');
    return result.filePath;
  });

  ipcMain.handle(IPC.getEnvironment, async (): Promise<EnvironmentInfo> => {
    const binaries = resolveBinaries(store.get());
    return {
      appVersion: app.getVersion(),
      ffmpegPath: binaries.ffmpeg,
      ffprobePath: binaries.ffprobe,
      ffmpegVersion: await getFfmpegVersion(binaries.ffmpeg),
      platform: process.platform,
      cpuCount: cpus().length,
      logFile: logger.file
    };
  });
}
