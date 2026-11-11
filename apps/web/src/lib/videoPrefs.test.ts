import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, parsePrefs } from './videoPrefs';

describe('preferências de vídeo: minha câmera', () => {
  it('por padrão a própria câmera aparece como os outros veem (sem espelhar)', () => {
    expect(DEFAULT_PREFS.selfie).toBe('normal');
    expect(parsePrefs(JSON.stringify({ fit: 'contain' })).selfie).toBe('normal');
  });

  it('guarda a escolha de espelhar e ignora valor inválido', () => {
    expect(parsePrefs(JSON.stringify({ selfie: 'mirror' })).selfie).toBe('mirror');
    expect(parsePrefs(JSON.stringify({ selfie: 'xyz' })).selfie).toBe('normal');
  });
});
