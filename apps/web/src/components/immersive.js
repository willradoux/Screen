import { createContext, useContext, useEffect } from 'react';
/**
 * "Modo chamada": quando a pessoa está dentro da sala, a tela é só a chamada (moldura com a
 * barra embaixo) e o topo do site some. O Layout fornece o controle; a sala liga e desliga.
 * Fora do Layout (testes, por exemplo) não faz nada.
 */
export const ImmersiveContext = createContext(() => undefined);
export function useImmersive(on) {
    const set = useContext(ImmersiveContext);
    useEffect(() => {
        set(on);
        return () => set(false);
    }, [on, set]);
}
