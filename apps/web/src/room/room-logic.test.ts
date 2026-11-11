import { describe, expect, it } from 'vitest';
import type { AccessResult } from '../lib/types';
import { publishRestriction, canUseSource, liveSources } from './publish-rules';
import {
  initialSessionState,
  pollIntervalMs,
  secondsLeft,
  sessionReducer,
  type SessionAction,
  type SessionState,
} from './sessionReducer';
import { parseMetadata } from './useParticipants';

const ok: AccessResult = { canJoin: true, reason: null, hint: null };
const blocked = (over: Partial<AccessResult>): AccessResult => ({
  canJoin: false,
  reason: 'NOT_IN_VOICE',
  hint: 'dica',
  ...over,
});

/** Aplica ações em sequência a partir do estado inicial. */
const run = (...actions: SessionAction[]): SessionState =>
  actions.reduce(sessionReducer, initialSessionState);

const connected = () =>
  run(
    { type: 'ACCESS_RESULT', access: ok, lectureMode: false },
    { type: 'JOIN_STARTED' },
    { type: 'CONNECTED', lectureMode: false },
  );

describe('sessionReducer: entrada na sala', () => {
  it('começa verificando o acesso', () => {
    expect(initialSessionState.phase.kind).toBe('checking');
  });

  it('acesso liberado -> pronto; bloqueado -> bloqueado com o motivo', () => {
    expect(run({ type: 'ACCESS_RESULT', access: ok, lectureMode: false }).phase.kind).toBe('ready');
    const b = run({ type: 'ACCESS_RESULT', access: blocked({}), lectureMode: false });
    expect(b.phase).toMatchObject({ kind: 'blocked', access: { reason: 'NOT_IN_VOICE' } });
  });

  it('bloqueado que passa a poder entrar vira pronto (o aviso some sozinho)', () => {
    const s = run(
      { type: 'ACCESS_RESULT', access: blocked({}), lectureMode: false },
      { type: 'ACCESS_RESULT', access: ok, lectureMode: false },
    );
    expect(s.phase.kind).toBe('ready');
  });

  it('o modo palestra da sala é guardado', () => {
    expect(run({ type: 'ACCESS_RESULT', access: ok, lectureMode: true }).lectureMode).toBe(true);
  });

  it('fluxo feliz: pronto -> entrando -> conectado', () => {
    expect(connected().phase.kind).toBe('connected');
  });

  it('CONNECTED só vale depois de JOIN_STARTED', () => {
    expect(run({ type: 'CONNECTED', lectureMode: false }).phase.kind).toBe('checking');
  });

  it('uma checagem de acesso atrasada não derruba quem já está dentro', () => {
    const s = sessionReducer(connected(), {
      type: 'ACCESS_RESULT',
      access: blocked({ reason: 'ROOM_FULL' }),
      lectureMode: false,
    });
    expect(s.phase.kind).toBe('connected');
  });

  it('falha ao entrar leva a erro; tentar de novo volta a verificar', () => {
    const s = run(
      { type: 'ACCESS_RESULT', access: ok, lectureMode: false },
      { type: 'JOIN_STARTED' },
      { type: 'FAILED', code: 'LIVEKIT_UNAVAILABLE', message: 'fora do ar' },
    );
    expect(s.phase).toEqual({ kind: 'error', code: 'LIVEKIT_UNAVAILABLE', message: 'fora do ar' });
    expect(sessionReducer(s, { type: 'RETRY' }).phase.kind).toBe('checking');
    // RETRY só existe a partir do erro
    expect(sessionReducer(connected(), { type: 'RETRY' }).phase.kind).toBe('connected');
  });
});

describe('sessionReducer: durante a sala', () => {
  it('queda de conexão -> desconectado, e dá para entrar de novo', () => {
    const s = sessionReducer(connected(), { type: 'DISCONNECTED' });
    expect(s.phase.kind).toBe('disconnected');
    const again = run(
      { type: 'ACCESS_RESULT', access: ok, lectureMode: false },
      { type: 'JOIN_STARTED' },
      { type: 'CONNECTED', lectureMode: false },
      { type: 'DISCONNECTED' },
      { type: 'JOIN_STARTED' },
      { type: 'CONNECTED', lectureMode: false },
    );
    expect(again.phase.kind).toBe('connected');
  });

  it('DISCONNECTED fora da sala não muda nada (ex.: ao sair por conta própria)', () => {
    const s = run({ type: 'ACCESS_RESULT', access: ok, lectureMode: false });
    expect(sessionReducer(s, { type: 'DISCONNECTED' })).toBe(s);
  });

  it('sala encerrada leva ao estado final, com o motivo', () => {
    const s = sessionReducer(connected(), { type: 'ENDED', reason: 'ENDED_BY_MOD' });
    expect(s.phase).toEqual({ kind: 'ended', reason: 'ENDED_BY_MOD' });
  });

  it('expulso/banido: guarda motivo e prazo; ações posteriores não desfazem', () => {
    const s = sessionReducer(connected(), {
      type: 'REMOVED',
      action: 'BANNED',
      reason: 'spam',
      expiresAt: '2026-12-05T23:00:00Z',
    });
    expect(s.phase).toEqual({
      kind: 'removed',
      action: 'BANNED',
      reason: 'spam',
      expiresAt: '2026-12-05T23:00:00Z',
    });
    for (const a of [
      { type: 'DISCONNECTED' },
      { type: 'FAILED', code: 'X', message: 'y' },
      { type: 'JOIN_STARTED' },
      { type: 'ENDED', reason: 'VOICE_EMPTY' },
      { type: 'ACCESS_RESULT', access: ok, lectureMode: false },
    ] as SessionAction[]) {
      expect(sessionReducer(s, a).phase.kind, a.type).toBe('removed');
    }
  });

  it('remoção que chega depois da queda da conexão ainda aparece (a queda vem primeiro)', () => {
    const s = run(
      { type: 'ACCESS_RESULT', access: ok, lectureMode: false },
      { type: 'JOIN_STARTED' },
      { type: 'CONNECTED', lectureMode: false },
      { type: 'DISCONNECTED' },
      { type: 'REMOVED', action: 'KICKED', reason: null },
    );
    expect(s.phase).toMatchObject({ kind: 'removed', action: 'KICKED', expiresAt: null });
  });

  it('sala encerrada é final: erros e remoções depois dela não mudam o motivo', () => {
    const s = run(
      { type: 'ACCESS_RESULT', access: ok, lectureMode: false },
      { type: 'JOIN_STARTED' },
      { type: 'CONNECTED', lectureMode: false },
      { type: 'ENDED', reason: 'VOICE_EMPTY' },
    );
    expect(sessionReducer(s, { type: 'FAILED', code: 'X', message: 'y' }).phase.kind).toBe('ended');
    expect(sessionReducer(s, { type: 'REMOVED', action: 'KICKED', reason: null }).phase.kind).toBe(
      'ended',
    );
  });

  it('aviso de saída da call: só durante a sala; voltar à call limpa', () => {
    expect(run({ type: 'VOICE_WARNING', secondsLeft: 30, at: 0 }).voiceWarning).toBeNull();
    const s = sessionReducer(connected(), { type: 'VOICE_WARNING', secondsLeft: 30, at: 1000 });
    expect(s.voiceWarning).toEqual({ secondsLeft: 30, receivedAt: 1000 });
    expect(sessionReducer(s, { type: 'VOICE_RESTORED' }).voiceWarning).toBeNull();
    // o aviso não sobrevive ao fim da sala
    expect(sessionReducer(s, { type: 'ENDED', reason: 'VOICE_EMPTY' }).voiceWarning).toBeNull();
  });

  it('modo palestra e mudanças na minha situação', () => {
    let s = sessionReducer(connected(), { type: 'ROOM_UPDATED', lectureMode: true });
    expect(s.lectureMode).toBe(true);
    s = sessionReducer(s, { type: 'ROOM_UPDATED' }); // sem mudança de modo palestra
    expect(s.lectureMode).toBe(true);
    s = sessionReducer(s, { type: 'SELF_UPDATED', isSpeaker: true, mutedByModeration: false });
    expect(s).toMatchObject({ isSpeaker: true, mutedByModeration: false });
    // mesma situação: o estado nem é recriado
    expect(
      sessionReducer(s, { type: 'SELF_UPDATED', isSpeaker: true, mutedByModeration: false }),
    ).toBe(s);
  });
});

describe('secondsLeft e pollIntervalMs', () => {
  it('conta os segundos que restam a partir de quando o aviso chegou', () => {
    const w = { secondsLeft: 30, receivedAt: 10_000 };
    expect(secondsLeft(w, 10_000)).toBe(30);
    expect(secondsLeft(w, 22_500)).toBe(18);
    expect(secondsLeft(w, 99_000)).toBe(0);
    expect(secondsLeft(null, 0)).toBe(0);
  });

  it('só continua perguntando quando o bloqueio pode passar sozinho', () => {
    expect(pollIntervalMs(blocked({ reason: 'NOT_IN_VOICE' }))).toBe(5000);
    expect(pollIntervalMs(blocked({ reason: 'ROOM_FULL' }))).toBe(10_000);
    expect(pollIntervalMs(blocked({ reason: 'ROOM_NOT_OPEN', status: 'SCHEDULED' }))).toBe(10_000);
    expect(pollIntervalMs(blocked({ reason: 'ROOM_NOT_OPEN', status: 'ENDED' }))).toBeNull();
    expect(pollIntervalMs(blocked({ reason: 'ROOM_NOT_OPEN', status: 'CANCELED' }))).toBeNull();
    expect(pollIntervalMs(blocked({ reason: 'BANNED_FROM_ROOM' }))).toBeNull();
    expect(pollIntervalMs(blocked({ reason: 'ROLE_NOT_ALLOWED' }))).toBeNull();
  });
});

describe('publishRestriction', () => {
  const free = { lectureMode: false, isSpeaker: false, mutedByModeration: false };

  it('membro sem restrições pode publicar', () => {
    expect(publishRestriction(free, 'MEMBER', ['microphone', 'camera'])).toBeNull();
    expect(publishRestriction(free, 'MEMBER', undefined)).toBeNull();
  });

  it('silenciado pela moderação', () => {
    expect(publishRestriction({ ...free, mutedByModeration: true }, 'MEMBER', [])).toMatch(
      /silenciou/,
    );
  });

  it('modo palestra: só palestrante transmite', () => {
    expect(publishRestriction({ ...free, lectureMode: true }, 'MEMBER', [])).toMatch(/palco/);
    expect(
      publishRestriction({ ...free, lectureMode: true, isSpeaker: true }, 'MEMBER', ['camera']),
    ).toBeNull();
  });

  it('sem nenhuma fonte permitida', () => {
    expect(publishRestriction(free, 'MEMBER', [])).toMatch(/permissão/);
  });

  it('moderação e admin nunca são restringidos', () => {
    const worst = { lectureMode: false, isSpeaker: false, mutedByModeration: true };
    expect(publishRestriction(worst, 'MOD', [])).toBeNull();
    expect(publishRestriction(worst, 'ADMIN', [])).toBeNull();
  });

  it('palco ligado: nem moderação nem admin transmitem até subirem ao palco', () => {
    const stage = { lectureMode: true, isSpeaker: false, mutedByModeration: false };
    expect(publishRestriction(stage, 'MOD', [])).toMatch(/palco/);
    expect(publishRestriction(stage, 'ADMIN', [])).toMatch(/suba você mesmo/);
    expect(publishRestriction({ ...stage, isSpeaker: true }, 'ADMIN', [])).toBeNull();
  });

  it('canUseSource', () => {
    expect(canUseSource(['camera'], 'camera')).toBe(true);
    expect(canUseSource(['camera'], 'microphone')).toBe(false);
    expect(canUseSource(undefined, 'screen_share')).toBe(true);
  });
});

describe('parseMetadata', () => {
  it('lê papel e avatar do token', () => {
    expect(parseMetadata(JSON.stringify({ role: 'MOD', avatarUrl: 'https://x/a.png' }))).toEqual({
      role: 'MOD',
      avatarUrl: 'https://x/a.png',
    });
  });

  it('lixo vira MEMBER sem avatar (nunca eleva)', () => {
    for (const m of [undefined, '', 'não é json', '{"role":"SUPERUSER"}', '{"role":1}', 'null']) {
      expect(parseMetadata(m as string), String(m)).toEqual({ role: 'MEMBER', avatarUrl: null });
    }
  });
});

describe('liveSources', () => {
  it('sem permissões do LiveKit ainda, vale o que veio do join', () => {
    expect(liveSources(undefined, ['camera'])).toEqual(['camera']);
    expect(liveSources(undefined, undefined)).toBeUndefined();
  });

  it('tela travada: o LiveKit tira a tela e o botão acompanha', () => {
    expect(liveSources({ canPublish: true, canPublishSources: [1, 2] }, undefined)).toEqual([
      'camera',
      'microphone',
    ]);
    expect(liveSources({ canPublish: true, canPublishSources: [1, 2, 3, 4] }, undefined)).toContain(
      'screen_share',
    );
  });

  it('sem poder publicar nada, não sobra fonte; lista vazia com permissão significa tudo', () => {
    expect(liveSources({ canPublish: false, canPublishSources: [1] }, undefined)).toEqual([]);
    expect(liveSources({ canPublish: true, canPublishSources: [] }, ['camera'])).toBeUndefined();
  });
});
