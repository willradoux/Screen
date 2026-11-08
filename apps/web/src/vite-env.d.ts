/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base da API REST, ex.: https://api.exemplo.com/api/v1 */
  readonly VITE_API_URL?: string;
  /** Origem do Socket.IO, ex.: https://api.exemplo.com */
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
