import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, } from 'react';
import { api, ApiError } from '../lib/api';
const AuthContext = createContext(null);
const DENIED_CODES = new Set(['NOT_IN_GUILD', 'ACCOUNT_BLOCKED']);
export function AuthProvider({ children }) {
    const [state, setState] = useState({ status: 'loading' });
    const refresh = useCallback(async () => {
        try {
            const user = await api.auth.me();
            setState({ status: 'authenticated', user });
        }
        catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 401)
                    return setState({ status: 'anonymous' });
                if (DENIED_CODES.has(err.code))
                    return setState({ status: 'denied', code: err.code });
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
        }
        catch {
            // Se a sessão já tinha acabado, o resultado é o mesmo.
        }
        setState({ status: 'anonymous' });
    }, []);
    const value = useMemo(() => ({ state, user: state.status === 'authenticated' ? state.user : null, refresh, logout }), [state, refresh, logout]);
    return _jsx(AuthContext.Provider, { value: value, children: children });
}
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx)
        throw new Error('useAuth precisa estar dentro de <AuthProvider>');
    return ctx;
}
/** Como `useAuth`, mas devolve `null` fora do provedor (componentes que só enriquecem a tela). */
export function useOptionalAuth() {
    return useContext(AuthContext);
}
