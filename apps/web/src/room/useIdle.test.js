import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useIdle } from './useIdle';
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
describe('useIdle (barra e pílula somem com o mouse parado)', () => {
    it('fica ocioso depois do tempo e volta no primeiro movimento', () => {
        const { result } = renderHook(() => useIdle(3000));
        expect(result.current).toBe(false);
        act(() => void vi.advanceTimersByTime(2999));
        expect(result.current).toBe(false);
        act(() => void vi.advanceTimersByTime(1));
        expect(result.current).toBe(true);
        act(() => void window.dispatchEvent(new Event('pointermove')));
        expect(result.current).toBe(false);
        // o relógio recomeça do zero depois do movimento
        act(() => void vi.advanceTimersByTime(3000));
        expect(result.current).toBe(true);
    });
    it('com o ponteiro ou o foco nos controles (hold), nunca some', () => {
        const { result, rerender } = renderHook(({ hold }) => useIdle(3000, { hold }), {
            initialProps: { hold: true },
        });
        act(() => void vi.advanceTimersByTime(10_000));
        expect(result.current).toBe(false);
        rerender({ hold: false });
        act(() => void vi.advanceTimersByTime(3000));
        expect(result.current).toBe(true);
    });
    it('teclado: uma tecla mostra tudo e não some sozinho até o mouse voltar', () => {
        const { result } = renderHook(() => useIdle(3000));
        act(() => void vi.advanceTimersByTime(3000));
        expect(result.current).toBe(true);
        act(() => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })));
        expect(result.current).toBe(false);
        act(() => void vi.advanceTimersByTime(60_000));
        expect(result.current).toBe(false);
    });
    it('desligado (enabled: false) nunca fica ocioso', () => {
        const { result } = renderHook(() => useIdle(3000, { enabled: false }));
        act(() => void vi.advanceTimersByTime(10_000));
        expect(result.current).toBe(false);
    });
});
