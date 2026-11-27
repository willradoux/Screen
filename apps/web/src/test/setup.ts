import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// O jsdom não tem ResizeObserver (as pílulas da Fluid medem as opções com ele).
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Com a máquina ocupada (todos os arquivos de teste em paralelo), 1 s de espera pelos findBy às
// vezes não basta e o teste falha ao acaso.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => cleanup());
