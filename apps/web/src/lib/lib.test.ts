import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { describeError, errorCode, messageFor } from './errors';
import {
  formatDateTime,
  formatDuration,
  formatReminder,
  initials,
  isoToLocalInput,
  localInputToIso,
  safeRedirect,
  timeUntil,
} from './format';
import { canShareScreen, mediaErrorMessage } from './media';
import { banOptions, canModerateTarget, isAdmin, isStaff } from './moderation-rules';

describe('errors', () => {
  it('traduz códigos conhecidos e usa o reserva nos desconhecidos', () => {
    expect(messageFor('NOT_IN_GUILD')).toContain('servidor Acelera DEV');
    expect(messageFor('CODIGO_NOVO', 'texto do servidor')).toBe('texto do servidor');
    expect(messageFor('CODIGO_NOVO')).toBe('Algo deu errado. Tente novamente.');
    expect(messageFor(null)).toBe('Algo deu errado. Tente novamente.');
  });

  it('todo código de erro de login que o backend envia tem texto próprio', () => {
    for (const code of [
      'NOT_IN_GUILD',
      'ACCOUNT_BLOCKED',
      'ACCESS_DENIED',
      'INVALID_STATE',
      'DISCORD_OAUTH_FAILED',
      'DISCORD_UNAVAILABLE',
    ]) {
      expect(messageFor(code), code).not.toBe('Algo deu errado. Tente novamente.');
    }
  });

  it('describeError e errorCode', () => {
    const err = new ApiError(403, 'ROOM_FULL', 'x');
    expect(describeError(err)).toBe('A sala está lotada.');
    expect(errorCode(err)).toBe('ROOM_FULL');
    expect(describeError(new Error('boom'))).toBe('Algo deu errado. Tente novamente.');
    expect(errorCode(new Error('boom'))).toBeNull();
  });
});

describe('format', () => {
  it('formatDuration', () => {
    expect(formatDuration(45_000)).toBe('45 s');
    expect(formatDuration(12 * 60_000)).toBe('12 min');
    expect(formatDuration(2 * 3_600_000 + 5 * 60_000)).toBe('2 h 05 min');
    expect(formatDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe('3 d 4 h');
    expect(formatDuration(-5000)).toBe('0 s');
  });

  it('timeUntil: futuro devolve a diferença, passado ou inválido devolve null', () => {
    const now = Date.parse('2026-12-05T20:00:00Z');
    expect(timeUntil('2026-12-05T20:10:00Z', now)).toBe(600_000);
    expect(timeUntil('2026-12-05T19:00:00Z', now)).toBeNull();
    expect(timeUntil(null, now)).toBeNull();
    expect(timeUntil('lixo', now)).toBeNull();
  });

  it('formatDateTime lida com vazio e inválido', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('lixo')).toBe('—');
    expect(formatDateTime('2026-12-05T23:00:00Z')).toMatch(/\d{2}\/\d{2}\/2026/);
  });

  it('datetime-local <-> ISO (relógio do navegador)', () => {
    const iso = localInputToIso('2026-12-05T20:00');
    expect(iso).toBe(new Date(2026, 11, 5, 20, 0).toISOString());
    expect(isoToLocalInput(iso)).toBe('2026-12-05T20:00');
  });

  it('localInputToIso rejeita formatos inválidos', () => {
    for (const v of ['', '05/12/2026 20:00', '2026-12-05', '2026-13-45T10:00', 'lixo']) {
      expect(localInputToIso(v), v).toBeNull();
    }
    expect(isoToLocalInput(null)).toBe('');
    expect(isoToLocalInput('lixo')).toBe('');
  });

  it('formatReminder', () => {
    expect(formatReminder(1440)).toBe('1 d');
    expect(formatReminder(60)).toBe('1 h');
    expect(formatReminder(120)).toBe('2 h');
    expect(formatReminder(5)).toBe('5 min');
    expect(formatReminder(90)).toBe('90 min');
  });

  it.each([
    ['/r/abc', '/r/abc'],
    ['/r/abc?x=1#y', '/r/abc?x=1#y'],
    [null, '/'],
    ['', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/ok\nSet-Cookie: x', '/'],
  ])('safeRedirect(%j) -> %j', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected);
  });

  it('initials', () => {
    expect(initials('Maria da Silva')).toBe('MS');
    expect(initials('fulano')).toBe('F');
    expect(initials('   ')).toBe('?');
  });
});

describe('moderation-rules', () => {
  const m = (id: string, role: 'MEMBER' | 'MOD' | 'ADMIN') => ({ id, role });

  it('hierarquia: só age sobre papel inferior, e nunca sobre si', () => {
    expect(canModerateTarget(m('a', 'MOD'), m('b', 'MEMBER'))).toBe(true);
    expect(canModerateTarget(m('a', 'ADMIN'), m('b', 'MOD'))).toBe(true);
    expect(canModerateTarget(m('a', 'ADMIN'), m('b', 'MEMBER'))).toBe(true);
    expect(canModerateTarget(m('a', 'MOD'), m('b', 'MOD'))).toBe(false);
    expect(canModerateTarget(m('a', 'MOD'), m('b', 'ADMIN'))).toBe(false);
    expect(canModerateTarget(m('a', 'ADMIN'), m('b', 'ADMIN'))).toBe(false);
    expect(canModerateTarget(m('a', 'MEMBER'), m('b', 'MEMBER'))).toBe(false);
    expect(canModerateTarget(m('a', 'ADMIN'), m('a', 'MEMBER'))).toBe(false);
  });

  it('isStaff e isAdmin', () => {
    expect([isStaff('MEMBER'), isStaff('MOD'), isStaff('ADMIN')]).toEqual([false, true, true]);
    expect([isAdmin('MEMBER'), isAdmin('MOD'), isAdmin('ADMIN')]).toEqual([false, false, true]);
  });

  it('banir até o fim da sala só aparece para ADMIN', () => {
    expect(banOptions('MOD').map((o) => o.minutes)).toEqual([15, 60, 1440]);
    expect(banOptions('ADMIN').map((o) => o.minutes)).toEqual([15, 60, 1440, 0]);
  });
});

describe('media', () => {
  const named = (name: string) => Object.assign(new Error(name), { name });

  it('mensagens por tipo de erro e dispositivo', () => {
    expect(mediaErrorMessage(named('NotAllowedError'), 'camera')).toContain('bloqueou a câmera');
    expect(mediaErrorMessage(named('NotFoundError'), 'microphone')).toContain(
      'Não encontrei o microfone',
    );
    expect(mediaErrorMessage(named('NotReadableError'), 'camera')).toContain('outro programa');
    expect(mediaErrorMessage(named('Qualquer'), 'microphone')).toBe(
      'Não foi possível ligar o microfone.',
    );
    expect(mediaErrorMessage('texto', 'camera')).toBe('Não foi possível ligar a câmera.');
  });

  it('fechar o seletor de tela não é erro', () => {
    expect(mediaErrorMessage(named('NotAllowedError'), 'screen')).toBeNull();
    expect(mediaErrorMessage(named('AbortError'), 'screen')).toBeNull();
    expect(mediaErrorMessage(named('NotFoundError'), 'screen')).toContain('a tela');
  });

  it('canShareScreen depende do navegador', () => {
    // jsdom não implementa mediaDevices
    expect(canShareScreen()).toBe(false);
  });
});
