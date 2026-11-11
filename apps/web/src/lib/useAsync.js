import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * Carrega dados assíncronos ao montar (e quando `reload` é chamado).
 * Ignora respostas de chamadas antigas e não atualiza depois de desmontar.
 */
export function useAsync(load, deps = []) {
    const [state, setState] = useState({ status: 'loading' });
    const run = useRef(0);
    const loader = useRef(load);
    loader.current = load;
    const reload = useCallback(async (opts = {}) => {
        const id = ++run.current;
        if (!opts.silent)
            setState({ status: 'loading' });
        try {
            const data = await loader.current();
            if (id === run.current)
                setState({ status: 'ready', data });
        }
        catch (error) {
            if (id === run.current)
                setState({ status: 'error', error });
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
