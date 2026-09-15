/// <reference types="vite/client" />

interface Window {
  __TAURI__?: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
  __TAURI_INTERNALS__?: {
    invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
  };
}
