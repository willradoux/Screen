import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, ApiError } from '../lib/api';
import type { User } from '../lib/types';

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  /** Logou no Discord mas não pode usar (fora do servidor, conta bloqueada). */
  | { status: 'denied'; code: string }
  | { status: 'error'; code: string; message: string };

interface AuthContextValue {
  state: AuthState;
  /** Usuário logado, ou `null`. */
  user: User | null;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const DENIED_CODES = new Set(['NOT_IN_GUILD', 'ACCOUNT_BLOCKED']);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    try {
      const user = await api.auth.me();
      setState({ status: 'authenticated', user });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) return setState({ status: 'anonymous' });
        if (DENIED_CODES.has(err.code)) return setState({ status: 'denied', code: err.code });
        return setState({ status: 'error', code: err.code, message: err.message });
      }
      setState({ status: 'error', code: 'UNKNOWN_ERROR', message: 'Algo deu errado.' });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch {
      // Se a sessão já tinha acabado, o resultado é o mesmo.
    }
    setState({ status: 'anonymous' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ state, user: state.status === 'authenticated' ? state.user : null, refresh, logout }),
    [state, refresh, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
