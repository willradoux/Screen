import { describe, expect, it } from 'vitest';
import { AuditLogModel, GuildSettingsModel, RoomModel } from '../../src/db/models.js';
import {
  AuditService,
  createAuditRepo,
  isValidAuditCursor,
} from '../../src/modules/audit/audit.service.js';
import { createRoomRepo } from '../../src/modules/rooms/rooms.repository.js';
import { createSettingsRepo } from '../../src/modules/settings/settings.repository.js';
import { createLogger } from '../../src/shared/logger.js';
import { useTestDb } from './helpers.js';

useTestDb('audit-repo', [AuditLogModel, RoomModel, GuildSettingsModel]);

const T0 = new Date('2026-11-08T15:00:00Z');
const ROOM = 'R'.repeat(22);

describe('AuditRepo (MongoDB)', () => {
  const repo = createAuditRepo();

  const insert = (over: Partial<Parameters<typeof repo.insert>[0]> = {}) =>
    repo.insert({ at: T0, actorId: 'mod', action: 'PARTICIPANT_KICKED', ...over });

  it('grava e devolve todos os campos, com padrões para o que falta', async () => {
    await insert({ targetId: 'u1', roomId: ROOM, reason: 'spam', meta: { sources: ['camera'] } });
    await insert({ at: new Date(T0.getTime() + 1000), action: 'SETTINGS_UPDATED' });
    const { items } = await repo.list({}, { limit: 10 });
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      actorId: 'mod',
      targetId: 'u1',
      roomId: ROOM,
      action: 'PARTICIPANT_KICKED',
      reason: 'spam',
      meta: { sources: ['camera'] },
      at: T0,
    });
    expect(items[0]).toMatchObject({ targetId: null, roomId: null, reason: null, meta: {} });
    expect(items[0]!.id).toMatch(/^[0-9a-f]{24}$/);
  });

  it('ordena do mais novo para o mais antigo e desempata pelo id', async () => {
    for (let i = 0; i < 4; i++) {
      await insert({ at: new Date(T0.getTime() + i * 1000), reason: `r${i}` });
    }
    await insert({ at: T0, reason: 'empate-a' });
    await insert({ at: T0, reason: 'empate-b' });
    const { items } = await repo.list({}, { limit: 10 });
    expect(items.map((i) => i.reason)).toEqual(['r3', 'r2', 'r1', 'empate-b', 'empate-a', 'r0']);
  });

  it('paginação por cursor não repete nem perde, inclusive com horários iguais', async () => {
    for (let i = 0; i < 9; i++) {
      await insert({ at: new Date(T0.getTime() + Math.floor(i / 3) * 1000), reason: `r${i}` });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await repo.list({}, { limit: 4, ...(cursor ? { cursor } : {}) });
      if (page.next) expect(isValidAuditCursor(page.next)).toBe(true);
      seen.push(...page.items.map((i) => i.reason!));
      cursor = page.next ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(9);
  });

  it('filtros por ator, alvo, sala, ação e período; combináveis com a paginação', async () => {
    await insert({ actorId: 'a', targetId: 't1', roomId: ROOM, action: 'PARTICIPANT_MUTED' });
    await insert({
      actorId: 'b',
      targetId: 't1',
      action: 'PARTICIPANT_BANNED',
      at: new Date(T0.getTime() + 5000),
    });
    await insert({
      actorId: 'a',
      targetId: 't2',
      action: 'PARTICIPANT_MUTED',
      at: new Date(T0.getTime() + 10_000),
    });

    const n = async (f: Parameters<typeof repo.list>[0]) =>
      (await repo.list(f, { limit: 10 })).items.length;
    expect(await n({ actorId: 'a' })).toBe(2);
    expect(await n({ targetId: 't1' })).toBe(2);
    expect(await n({ roomId: ROOM })).toBe(1);
    expect(await n({ action: 'PARTICIPANT_MUTED' })).toBe(2);
    expect(
      await n({ from: new Date(T0.getTime() + 4000), to: new Date(T0.getTime() + 6000) }),
    ).toBe(1);
    expect(await n({ actorId: 'a', action: 'PARTICIPANT_BANNED' })).toBe(0);

    const first = await repo.list({ actorId: 'a' }, { limit: 1 });
    expect(first.next).not.toBeNull();
    const second = await repo.list({ actorId: 'a' }, { limit: 1, cursor: first.next! });
    expect(second.items).toHaveLength(1);
    expect(second.items[0]!.id).not.toBe(first.items[0]!.id);
    expect(second.next).toBeNull();
  });

  it('o repositório é somente de inserção (sem atualizar nem apagar)', () => {
    expect(Object.keys(repo).sort()).toEqual(['insert', 'list']);
  });

  it('tem os índices por data, ator e sala', async () => {
    const keys = (await AuditLogModel.collection.indexes()).map((i) => JSON.stringify(i.key));
    expect(keys).toContain('{"at":-1}');
    expect(keys).toContain('{"actorId":1,"at":-1}');
    expect(keys).toContain('{"roomId":1,"at":-1}');
  });

  it('AuditService grava com o relógio injetado e engole falhas do banco', async () => {
    const logger = createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'test' });
    const service = new AuditService({ repo, logger, now: () => T0 });
    await service.record({ actorId: 'x', action: 'ROOM_ENDED' });
    expect((await repo.list({}, { limit: 5 })).items[0]).toMatchObject({ actorId: 'x', at: T0 });

    const broken = new AuditService({
      repo: {
        ...repo,
        insert: async () => {
          throw new Error('banco caiu');
        },
      },
      logger,
    });
    await expect(broken.record({ actorId: 'x', action: 'ROOM_ENDED' })).resolves.toBeUndefined();
  });
});

describe('cursor de auditoria', () => {
  it('valida o formato', () => {
    const ok = Buffer.from(`1796511600000|${'a'.repeat(24)}`).toString('base64url');
    expect(isValidAuditCursor(ok)).toBe(true);
    const bad = [
      '',
      'lixo',
      Buffer.from('123|abc').toString('base64url'),
      Buffer.from(`abc|${'a'.repeat(24)}`).toString('base64url'),
    ];
    for (const cursor of bad) expect(isValidAuditCursor(cursor), cursor).toBe(false);
  });
});

describe('RoomRepo: edição e palestrantes (MongoDB)', () => {
  const rooms = createRoomRepo();
  const make = () =>
    rooms.createMeeting({
      guildId: 'g',
      title: 'Mensal',
      description: 'pauta',
      startsAt: null,
      createdBy: 'a',
      maxParticipants: 100,
      allowedRoleIds: [],
      reminders: [],
      now: T0,
    });

  it('update altera só o que veio e permite apagar a descrição', async () => {
    const room = await make();
    const a = await rooms.update(room.id, { title: 'Novo', lectureMode: true });
    expect(a).toMatchObject({
      title: 'Novo',
      lectureMode: true,
      description: 'pauta',
      maxParticipants: 100,
    });
    const b = await rooms.update(room.id, { description: null, maxParticipants: 10 });
    expect(b).toMatchObject({ description: null, maxParticipants: 10, title: 'Novo' });
    expect(await rooms.update('nao-existe', { title: 'x' })).toBeNull();
  });

  it('updateSpeakers adiciona sem duplicar e remove', async () => {
    const room = await make();
    await rooms.updateSpeakers(room.id, 'add', 'u1');
    await rooms.updateSpeakers(room.id, 'add', 'u1');
    expect((await rooms.updateSpeakers(room.id, 'add', 'u2'))!.speakerIds).toEqual(['u1', 'u2']);
    expect((await rooms.updateSpeakers(room.id, 'remove', 'u1'))!.speakerIds).toEqual(['u2']);
    expect(await rooms.updateSpeakers('nao-existe', 'add', 'u1')).toBeNull();
  });
});

describe('SettingsRepo: listas inteiras (MongoDB)', () => {
  const settings = createSettingsRepo();

  it('update substitui as listas de cargos e aceita limpar canais', async () => {
    await settings.modifyList('g', 'modRoleIds', 'add', 'velho', 'u');
    const s = await settings.update(
      'g',
      { modRoleIds: ['n1', 'n2'], adminRoleIds: [], liveCategoryId: 'c' },
      'u',
    );
    expect(s).toMatchObject({ modRoleIds: ['n1', 'n2'], adminRoleIds: [], liveCategoryId: 'c' });
    const cleared = await settings.update('g', { liveCategoryId: null }, 'u');
    expect(cleared.liveCategoryId).toBeNull();
    expect(cleared.modRoleIds).toEqual(['n1', 'n2']);
  });
});
