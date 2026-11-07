import { cpus } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import { IPC } from '../shared/ipc';
import { resolveBinaries } from './ffmpeg/locator';
import { registerIpc } from './ipc';
import { registerMediaIpc } from './ipcMedia';
import { logger } from './logger';
import { MediaProbe } from './media/probe';
import { AudioConverterService } from './services/AudioConverterService';
import { AudioEditorService } from './services/AudioEditorService';
import { BatchProcessingService } from './services/BatchProcessingService';
import { findSystemFont } from './services/fonts';
import { VideoConverterService } from './services/VideoConverterService';
import { VideoEditorService } from './services/VideoEditorService';
import { SettingsStore } from './settingsStore';
import { HistoryStore } from './stores/historyStore';
import { PresetStore } from './stores/presetStore';

const log = logger.scope('main');

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 1040,
    minHeight: 640,
    show: false,
    title: 'Audio Leveler Pro',
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1115' : '#f6f7f9',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.once('ready-to-show', () => win.show());

  // Never navigate away from the app (e.g. a file dropped outside the drop handler).
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
  return win;
}

process.on('uncaughtException', (err) => log.error('Exceção não tratada', err));
process.on('unhandledRejection', (reason) => log.error('Promise rejeitada sem tratamento', reason));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  void app.whenReady().then(() => {
    logger.init(app.getPath('logs'));
    log.info(`Audio Leveler Pro ${app.getVersion()} iniciado`, { platform: process.platform, arch: process.arch });

    const defaultConcurrency = Math.max(1, Math.min(8, cpus().length - 1));
    const store = new SettingsStore(join(app.getPath('userData'), 'settings.json'), defaultConcurrency, logger.scope('settings'));
    if (!store.get().export.outputDir) {
      const current = store.get();
      store.save({ ...current, export: { ...current.export, outputDir: join(app.getPath('music'), 'Audio Leveler Pro') } });
    }

    if (!store.get().media.outputDir) {
      const current = store.get();
      store.save({ ...current, media: { ...current.media, outputDir: join(app.getPath('music'), 'Audio Leveler Pro', 'Convertidos') } });
    }

    const userData = app.getPath('userData');
    const history = new HistoryStore(join(userData, 'history.json'), logger.scope('history'));
    const presets = new PresetStore(join(userData, 'presets.json'), logger.scope('presets'));
    const binaries = (): ReturnType<typeof resolveBinaries> => resolveBinaries(store.get());
    const probe = new MediaProbe(() => binaries().ffprobe);
    const queue = new BatchProcessingService({
      binaries,
      concurrency: () => store.get().media.concurrency,
      log: logger.scope('queue'),
      onFinished: (entry) => history.add(entry),
      emit: (snapshot) => {
        for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(IPC.queueEvent, snapshot);
      }
    });
    const font = findSystemFont();
    const deps = { probe, queue, cpuCount: cpus().length, fontPath: () => font };

    registerIpc(store, (entry) => history.add(entry));
    registerMediaIpc({
      probe,
      queue,
      presets,
      history,
      audioConverter: new AudioConverterService(deps),
      videoConverter: new VideoConverterService(deps),
      audioEditor: new AudioEditorService(deps),
      videoEditor: new VideoEditorService(deps)
    });
    app.on('before-quit', () => queue.cancelAll());
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => logger.close());
}
