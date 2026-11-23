import type { FerramentasKitApi } from '../../shared/ipc';

declare global {
  interface Window {
    api: FerramentasKitApi;
  }
}

export {};
