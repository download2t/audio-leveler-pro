import type { AudioLevelerApi } from '../../shared/ipc';

declare global {
  interface Window {
    api: AudioLevelerApi;
  }
}

export {};
