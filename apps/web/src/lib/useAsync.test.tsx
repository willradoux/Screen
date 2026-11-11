import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync } from './useAsync';

describe('useAsync: atualização silenciosa', () => {
  it('troca os dados sem passar por "carregando"; se falhar, mantém o que já estava', async () => {
    const load = vi
      .fn<() => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockRejectedValueOnce(new Error('rede'));
    const { result } = renderHook(() => useAsync(load));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'ready', data: 1 }));

    await act(() => result.current.reload({ silent: true }));
    expect(result.current.state).toEqual({ status: 'ready', data: 2 });

    await act(() => result.current.reload({ silent: true }));
    expect(result.current.state).toEqual({ status: 'ready', data: 2 });
  });
});
