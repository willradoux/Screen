import type { Role } from '@screem/shared';
import { describe, expect, it } from 'vitest';
import { computePermissions } from '../../src/modules/rooms/access.js';
import {
  CAPABILITY_MIN_ROLE,
  assertCan,
  can,
  type Capability,
} from '../../src/modules/permissions/capabilities.js';
import { ALL_SOURCES } from '../../src/modules/livekit/livekit.gateway.js';

/**
 * Matriz de docs/backend/permissoes.md, escrita à mão (não derivada do código) para
 * que mudar uma capacidade sem mudar a documentação quebre este teste.
 */
const MATRIX: Record<Capability, { MEMBER: boolean; MOD: boolean; ADMIN: boolean }> = {
  'panel.access': { MEMBER: false, MOD: true, ADMIN: true },
  'recording.manage': { MEMBER: false, MOD: false, ADMIN: true },
  'panel.users': { MEMBER: false, MOD: false, ADMIN: true },
  'room.end': { MEMBER: false, MOD: true, ADMIN: true },
  'room.lecture': { MEMBER: false, MOD: true, ADMIN: true },
  'room.edit': { MEMBER: false, MOD: false, ADMIN: true },
  'moderation.mute': { MEMBER: false, MOD: true, ADMIN: true },
  'moderation.kick': { MEMBER: false, MOD: true, ADMIN: true },
  'moderation.ban': { MEMBER: false, MOD: true, ADMIN: true },
  'moderation.speaker': { MEMBER: false, MOD: false, ADMIN: true },
  'meeting.manage': { MEMBER: false, MOD: false, ADMIN: true },
  'settings.manage': { MEMBER: false, MOD: false, ADMIN: true },
  'audit.read': { MEMBER: false, MOD: false, ADMIN: true },
};

describe('matriz de capacidades', () => {
  const roles: Role[] = ['MEMBER', 'MOD', 'ADMIN'];
  const caps = Object.keys(MATRIX) as Capability[];

  it('cobre todas as capacidades definidas no código (e só elas)', () => {
    expect(caps.sort()).toEqual(Object.keys(CAPABILITY_MIN_ROLE).sort());
  });

  it.each(caps.flatMap((c) => roles.map((r) => [c, r] as const)))('%s para %s', (cap, role) => {
    expect(can(role, cap)).toBe(MATRIX[cap][role]);
    if (MATRIX[cap][role]) expect(() => assertCan(role, cap)).not.toThrow();
    else expect(() => assertCan(role, cap)).toThrow(/permissão/);
  });

  it('um papel mais alto nunca perde uma capacidade que um mais baixo tem', () => {
    for (const cap of caps) {
      if (can('MEMBER', cap)) expect(can('MOD', cap)).toBe(true);
      if (can('MOD', cap)) expect(can('ADMIN', cap)).toBe(true);
    }
  });
});

describe('computePermissions', () => {
  const base = { userId: '1', mutedSources: [], lectureMode: false, speakerIds: [] as string[] };

  it('membro comum publica tudo', () => {
    expect(computePermissions({ ...base, role: 'MEMBER' })).toEqual({
      canPublish: true,
      canPublishSources: ALL_SOURCES,
      canModerate: false,
    });
  });

  it('silenciar uma fonte tira só ela', () => {
    const p = computePermissions({ ...base, role: 'MEMBER', mutedSources: ['microphone'] });
    expect(p.canPublish).toBe(true);
    expect(p.canPublishSources).toEqual(['camera', 'screen_share', 'screen_share_audio']);
  });

  it('silenciar todas as fontes tira a permissão de publicar', () => {
    expect(computePermissions({ ...base, role: 'MEMBER', mutedSources: ALL_SOURCES })).toEqual({
      canPublish: false,
      canPublishSources: [],
      canModerate: false,
    });
  });

  it('modo palestra: só palestrante publica, e o silenciamento continua valendo para ele', () => {
    const lecture = { ...base, role: 'MEMBER' as const, lectureMode: true };
    expect(computePermissions(lecture).canPublish).toBe(false);
    expect(computePermissions({ ...lecture, speakerIds: ['1'] }).canPublish).toBe(true);
    expect(
      computePermissions({ ...lecture, speakerIds: ['1'], mutedSources: ['microphone'] })
        .canPublishSources,
    ).not.toContain('microphone');
    expect(
      computePermissions({ ...lecture, speakerIds: ['1'], mutedSources: ALL_SOURCES }).canPublish,
    ).toBe(false);
  });

  it('MOD e ADMIN publicam tudo, mesmo com silenciamento antigo', () => {
    for (const role of ['MOD', 'ADMIN'] as const) {
      expect(computePermissions({ ...base, role, mutedSources: ALL_SOURCES })).toEqual({
        canPublish: true,
        canPublishSources: ALL_SOURCES,
        canModerate: true,
      });
    }
  });

  it('com o palco ligado ninguém transmite por padrão, nem admin; só quem foi colocado no palco', () => {
    for (const role of ['MOD', 'ADMIN'] as const) {
      const stage = { ...base, role, lectureMode: true };
      expect(computePermissions(stage)).toEqual({
        canPublish: false,
        canPublishSources: [],
        canModerate: true,
      });
      expect(computePermissions({ ...stage, speakerIds: ['1'] })).toEqual({
        canPublish: true,
        canPublishSources: ALL_SOURCES,
        canModerate: true,
      });
    }
  });

  it('tela travada: membro e moderador seguem com câmera e mic, sem tela', () => {
    const noScreen = ALL_SOURCES.filter((x) => x !== 'screen_share' && x !== 'screen_share_audio');
    for (const role of ['MEMBER', 'MOD'] as const) {
      expect(computePermissions({ ...base, role, screenLock: true }).canPublishSources).toEqual(
        noScreen,
      );
    }
  });

  it('tela travada: admin e quem está no palco compartilham tela', () => {
    expect(
      computePermissions({ ...base, role: 'ADMIN', screenLock: true }).canPublishSources,
    ).toEqual(ALL_SOURCES);
    expect(
      computePermissions({ ...base, role: 'MEMBER', screenLock: true, speakerIds: ['1'] })
        .canPublishSources,
    ).toEqual(ALL_SOURCES);
  });

  it('tela travada não tira a tela de quem já estava silenciado só de câmera', () => {
    const p = computePermissions({
      ...base,
      role: 'MEMBER',
      screenLock: true,
      mutedSources: ['camera', 'microphone'],
    });
    expect(p.canPublish).toBe(false);
    expect(p.canPublishSources).toEqual([]);
  });
});
