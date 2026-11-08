/**
 * Endereços do backend. Em produção vêm do ambiente de build da Vercel
 * (VITE_API_URL e VITE_SOCKET_URL); em desenvolvimento apontam para localhost.
 */
const trim = (url: string) => url.replace(/\/+$/, '');

export const API_URL = trim(import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1');
export const SOCKET_URL = trim(import.meta.env.VITE_SOCKET_URL ?? 'http://localhost:3000');
