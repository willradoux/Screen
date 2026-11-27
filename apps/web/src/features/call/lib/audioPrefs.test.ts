import { beforeEach, describe, expect, it } from 'vitest';
import {
  effectiveVolume,
  resetAudioPrefsCache,
  setDeafened,
  setMutedForMe,
  setVolume,
  useAudioPrefs,
  volumeKey,
} from './audioPrefs';
import { renderHook } from '@testing-library/react';

beforeEach(() => {
  localStorage.clear();
  resetAudioPrefsCache();
});

const prefs = () => renderHook(() => useAudioPrefs()).result.current;

describe('como você ouve a sala (só no seu navegador)', () => {
  it('volume por pessoa de 0 a 200%, salvo; 100% não ocupa espaço', () => {
    setVolume('a', 1.5);
    setVolume('b', 5);
    setVolume('c', 1);
    expect(prefs().volumes).toEqual({ a: 1.5, b: 2 });
    resetAudioPrefsCache();
    expect(prefs().volumes).toEqual({ a: 1.5, b: 2 }); // voltou do localStorage
  });

  it('silenciar só para mim e desligar o som da sala zeram o volume', () => {
    setVolume('a', 1.5);
    expect(effectiveVolume(prefs(), 'a')).toBe(1.5);
    setMutedForMe('a', true);
    expect(effectiveVolume(prefs(), 'a')).toBe(0);
    setMutedForMe('a', false);
    setDeafened(true);
    expect(effectiveVolume(prefs(), 'a')).toBe(0);
    expect(effectiveVolume(prefs(), 'z')).toBe(0);
    setDeafened(false);
    expect(effectiveVolume(prefs(), 'z')).toBe(1);
  });

  it('voz e transmissão (som da tela) têm volumes separados; mutar cala as duas', () => {
    setVolume(volumeKey('a', 'voz'), 0.5);
    setVolume(volumeKey('a', 'tela'), 1.8);
    expect(effectiveVolume(prefs(), 'a', 'voz')).toBe(0.5);
    expect(effectiveVolume(prefs(), 'a', 'tela')).toBe(1.8);
    setMutedForMe('a', true);
    expect(effectiveVolume(prefs(), 'a', 'tela')).toBe(0);
  });

  it('o som da sala desligado não fica salvo (volta ligado na próxima visita)', () => {
    setDeafened(true);
    resetAudioPrefsCache();
    expect(prefs().deafened).toBe(false);
  });
});
