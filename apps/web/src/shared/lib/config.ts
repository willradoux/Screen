/**
 * Endereços do backend. Em produção vêm do ambiente de build da Vercel
 * (VITE_API_URL e VITE_SOCKET_URL); em desenvolvimento apontam para localhost.
 */
const trim = (url: string) => url.replace(/\/+$/, '');

export const API_URL = trim(import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1');
export const SOCKET_URL = trim(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000');

/**
 * LP separada (outro subdomínio, outro container). No app: para onde vai quem chega deslogado no
 * endereço principal; vazio (dev) = a LP fica dentro do app, em /sobre.
 */
export const LANDING_URL = trim(import.meta.env.VITE_LANDING_URL ?? '');
/** Na LP separada: o endereço do app (os botões "Salas", "Recursos"... levam para lá). */
export const APP_URL = trim(import.meta.env.VITE_APP_URL ?? '');
/** Este build é a LP separada (sem o roteador nem o login do app). */
export const LP_STANDALONE = import.meta.env.VITE_LP_STANDALONE === 'true';
