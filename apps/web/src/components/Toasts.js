import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
import { playSound } from '../lib/sounds';
import { Icon } from './Icon';
/**
 * Avisos curtos que somem sozinhos. O mesmo aviso não aparece duas vezes: se chegar de novo,
 * o que já está na tela ganha mais tempo. Cada aviso novo toca um som curto (se ligados).
 */
export function useToasts(ttlMs = 6000) {
    const [toasts, setToasts] = useState([]);
    const next = useRef(1);
    const timers = useRef(new Map());
    useEffect(() => {
        const all = timers.current;
        return () => all.forEach(clearTimeout);
    }, []);
    const schedule = useCallback((id) => {
        clearTimeout(timers.current.get(id));
        timers.current.set(id, setTimeout(() => {
            timers.current.delete(id);
            setToasts((list) => list.filter((t) => t.id !== id));
        }, ttlMs));
    }, [ttlMs]);
    // Lista atual fora do estado: a decisão (repetido ou novo, tocar som) roda uma vez só.
    const current = useRef([]);
    current.current = toasts;
    const push = useCallback((tone, text) => {
        const same = current.current.find((t) => t.tone === tone && t.text === text);
        if (same) {
            schedule(same.id);
            return;
        }
        const id = next.current++;
        schedule(id);
        playSound(tone === 'error' ? 'error' : 'notify');
        const toast = { id, tone, text };
        current.current = [...current.current.slice(-3), toast];
        setToasts((list) => [...list.slice(-3), toast]);
    }, [schedule]);
    return {
        toasts,
        info: useCallback((text) => push('info', text), [push]),
        error: useCallback((text) => push('error', text), [push]),
        dismiss: useCallback((id) => {
            clearTimeout(timers.current.get(id));
            timers.current.delete(id);
            setToasts((list) => list.filter((t) => t.id !== id));
        }, []),
    };
}
export function ToastViewport({ toasts, onDismiss, }) {
    return (_jsx("div", { "aria-live": "polite", className: "toast-viewport", children: toasts.map((t) => (_jsxs("div", { role: t.tone === 'error' ? 'alert' : 'status', className: "toast", children: [_jsx("span", { className: "toast-icon", "data-tone": t.tone, "aria-hidden": "true", children: _jsx(Icon, { name: t.tone === 'error' ? 'error' : 'info', size: "1.05rem" }) }), _jsx("p", { className: "min-w-0 flex-1 pt-0.5 text-[13px] font-medium leading-snug text-zinc-100", children: t.text }), _jsx("button", { type: "button", "aria-label": "Fechar aviso", onClick: () => onDismiss(t.id), className: "icon-button -my-1 -mr-1 h-8 w-8", children: _jsx(Icon, { name: "close", size: "1rem" }) })] }, t.id))) }));
}
