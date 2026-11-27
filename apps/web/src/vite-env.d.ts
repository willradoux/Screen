/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base da API REST, ex.: https://api.exemplo.com/api/v1 */
  readonly VITE_API_URL?: string;
  /** Origem do Socket.IO, ex.: https://api.exemplo.com */
  readonly VITE_SOCKET_URL?: string;
  /** Endereço da LP separada, ex.: https://conheca.exemplo.com (vazio: LP em /sobre no app). */
  readonly VITE_LANDING_URL?: string;
  /** Na LP separada: endereço do app, ex.: https://screen.exemplo.com */
  readonly VITE_APP_URL?: string;
  /** 'true' no build da LP separada (landing.html). */
  readonly VITE_LP_STANDALONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
