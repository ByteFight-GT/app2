import type { ElectronAPI } from '../common/electron-api';

export {};

declare global {
  interface Window {
    electron: ElectronAPI;
  }

  type ValueType<T> = T[keyof T];
}
