import { beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.resetModules();
});

describe('preferências do microfone', () => {
  it('redução de ruído vem ligada e filtro de barulho desligado', async () => {
    const { micPrefs } = await import('./micEffects');
    expect(micPrefs()).toEqual({ suppression: true, gate: 'off', voice: 'none' });
  });

  it('guarda redução de ruído e filtro; o efeito de voz não fica salvo', async () => {
    const first = await import('./micEffects');
    first.saveMicPrefs({ suppression: false, gate: 'forte', voice: 'robot' });
    vi.resetModules();
    const again = await import('./micEffects');
    expect(again.micPrefs()).toEqual({ suppression: false, gate: 'forte', voice: 'none' });
  });
});
