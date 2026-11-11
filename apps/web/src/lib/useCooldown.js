import { useCallback, useEffect, useRef, useState } from 'react';
/**
 * Evita cliques repetidos que só gerariam mais pedidos ao servidor (ex.: "Atualizar").
 * Depois de rodar, fica `active` por `ms` e ignora novos cliques, sem avisar nada.
 */
export function useCooldown(ms) {
    const [active, setActive] = useState(false);
    const timer = useRef(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const run = useCallback((fn) => {
        if (timer.current !== undefined)
            return;
        fn();
        setActive(true);
        timer.current = window.setTimeout(() => {
            timer.current = undefined;
            setActive(false);
        }, ms);
    }, [ms]);
    return { active, run };
}
