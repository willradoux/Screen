import { useCallback, useEffect, useRef, useState } from 'react';

export type AsyncState<T> =
  { status: 'loading' } | { status: 'ready'; data: T } | { status: 'error'; error: unknown };

/**
 * Carrega dados assíncronos ao montar (e quando `reload` é chamado).
 * Ignora respostas de chamadas antigas e não atualiza depois de desmontar.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const run = useRef(0);
  const loader = useRef(load);
  loader.current = load;

  const reload = useCallback(async (opts: { silent?: boolean } = {}) => {
    const id = ++run.current;
    if (!opts.silent) setState({ status: 'loading' });
    try {
      const data = await loader.current();
      if (id === run.current) setState({ status: 'ready', data });
    } catch (error) {
      if (id === run.current) setState({ status: 'error', error });
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      run.current++; // invalida qualquer resposta pendente
    };
  }, deps);

  return { state, reload };
}
