import { describe, expect, it } from 'vitest';
import { ParticipationModel, RoomBanModel, RoomModel } from '../../src/db/models.js';
import { createBanRepo, createParticipationRepo } from '../../src/modules/rooms/participations.js';
import { createRoomRepo } from '../../src/modules/rooms/rooms.repository.js';
import { useTestDb } from './helpers.js';

useTestDb('rooms-repos', [ParticipationModel, RoomBanModel, RoomModel]);

const NOW = new Date('2026-11-08T15:00:00Z');
const GUILD = '222222222222222222';
const base = {
  roomId: 'R'.repeat(22),
  displayName: 'Fulano',
  avatarUrl: null,
  role: 'MEMBER' as const,
  at: NOW,
};

describe('ParticipationRepo (MongoDB)', () => {
  const repo = createParticipationRepo();

  it('open cria uma vez e é idempotente', async () => {
    const a = await repo.open({ ...base, userId: '1' });
    const b = await repo.open({ ...base, userId: '1' });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(await ParticipationModel.countDocuments()).toBe(1);
    expect(a.participation).toMatchObject({
      roomId: base.roomId,
      userId: '1',
      roleAtJoin: 'MEMBER',
      leftAt: null,
    });
  });

  it('20 webhooks simultâneos do mesmo usuário geram UMA participação aberta', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => repo.open({ ...base, userId: '1' })),
    );
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await ParticipationModel.countDocuments({ leftAt: null })).toBe(1);
  });

  it('close devolve a participação uma única vez; depois pode abrir outra (novo histórico)', async () => {
    await repo.open({ ...base, userId: '1' });
    const closed = await repo.close(base.roomId, '1', 'LEFT', new Date(NOW.getTime() + 5000));
    expect(closed).toMatchObject({ leaveReason: 'LEFT' });
    expect(await repo.close(base.roomId, '1', 'LEFT', NOW)).toBeNull();

    const again = await repo.open({ ...base, userId: '1' });
    expect(again.created).toBe(true);
    expect(await ParticipationModel.countDocuments()).toBe(2);
    expect(await repo.countOpen(base.roomId)).toBe(1);
  });

  it('listOpen, countOpen e findOpen só enxergam quem está dentro', async () => {
    await repo.open({ ...base, userId: '1' });
    await repo.open({ ...base, userId: '2', at: new Date(NOW.getTime() + 1000) });
    await repo.open({ ...base, userId: '3', roomId: 'outra'.padEnd(22, 'x') });
    await repo.close(base.roomId, '1', 'KICKED', NOW);

    expect((await repo.listOpen(base.roomId)).map((p) => p.userId)).toEqual(['2']);
    expect(await repo.countOpen(base.roomId)).toBe(1);
    expect(await repo.findOpen(base.roomId, '1')).toBeNull();
    expect(await repo.findOpen(base.roomId, '2')).not.toBeNull();
  });

  it('closeAll fecha todos e devolve quem estava dentro', async () => {
    await repo.open({ ...base, userId: '1' });
    await repo.open({ ...base, userId: '2' });
    await repo.close(base.roomId, '2', 'LEFT', NOW);
    const closed = await repo.closeAll(base.roomId, 'ROOM_ENDED', NOW);
    expect(closed.map((p) => p.userId)).toEqual(['1']);
    expect(closed[0]).toMatchObject({ leaveReason: 'ROOM_ENDED', leftAt: NOW });
    expect(await repo.countOpen(base.roomId)).toBe(0);
    expect(await repo.closeAll(base.roomId, 'ROOM_ENDED', NOW)).toEqual([]);
    // quem já tinha saído mantém o motivo original
    expect((await ParticipationModel.findOne({ userId: '2' }).lean())?.leaveReason).toBe('LEFT');
  });

  it('setMutedByModeration marca só a participação aberta', async () => {
    await repo.open({ ...base, userId: '1' });
    await repo.setMutedByModeration(base.roomId, '1', true);
    expect((await repo.findOpen(base.roomId, '1'))?.mutedByModeration).toBe(true);
    await repo.setMutedByModeration(base.roomId, '1', false);
    expect((await repo.findOpen(base.roomId, '1'))?.mutedByModeration).toBe(false);
  });
});

describe('BanRepo (MongoDB)', () => {
  const repo = createBanRepo();
  const ban = {
    roomId: base.roomId,
    userId: '1',
    bannedBy: 'mod',
    reason: 'ruído',
    expiresAt: null,
  };

  it('banimento sem prazo vale até ser removido', async () => {
    await repo.upsert(ban);
    expect(await repo.find(base.roomId, '1', new Date('2099-01-01'))).toMatchObject({
      reason: 'ruído',
      expiresAt: null,
    });
    await repo.remove(base.roomId, '1');
    expect(await repo.find(base.roomId, '1', NOW)).toBeNull();
  });

  it('banimento com prazo deixa de valer depois dele, mesmo antes do TTL limpar o documento', async () => {
    const expiresAt = new Date(NOW.getTime() + 3600_000);
    await repo.upsert({ ...ban, expiresAt });
    expect(await repo.find(base.roomId, '1', NOW)).not.toBeNull();
    expect(await repo.find(base.roomId, '1', new Date(expiresAt.getTime() + 1))).toBeNull();
  });

  it('upsert troca o banimento anterior em vez de duplicar', async () => {
    await repo.upsert(ban);
    await repo.upsert({ ...ban, reason: 'novo motivo' });
    expect(await RoomBanModel.countDocuments()).toBe(1);
    expect((await repo.find(base.roomId, '1', NOW))?.reason).toBe('novo motivo');
  });

  it('é por sala e por usuário', async () => {
    await repo.upsert(ban);
    expect(await repo.find('outra'.padEnd(22, 'x'), '1', NOW)).toBeNull();
    expect(await repo.find(base.roomId, '2', NOW)).toBeNull();
  });

  it('tem índice único (sala, usuário) e índice TTL', async () => {
    const indexes = await RoomBanModel.collection.indexes();
    expect(indexes.find((i) => i.key.roomId === 1 && i.key.userId === 1)?.unique).toBe(true);
    expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);
  });
});

describe('RoomRepo.list (MongoDB)', () => {
  const rooms = createRoomRepo();

  const seed = async (count: number) => {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const m = await rooms.createMeeting({
        guildId: GUILD,
        title: `Reunião ${i}`,
        description: null,
        startsAt: i % 2 === 0 ? new Date('2026-12-01T20:00:00Z') : null,
        createdBy: 'a',
        maxParticipants: 10,
        allowedRoleIds: [],
        reminders: [],
        now: NOW,
      });
      ids.push(m.id);
      await new Promise((r) => setTimeout(r, 3)); // createdAt distintos
    }
    return ids;
  };

  it('ordena das mais novas para as mais antigas e pagina sem repetir nem perder', async () => {
    const ids = await seed(7);
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await rooms.list(GUILD, {}, { limit: 3, ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((r) => r.id));
      cursor = page.next ?? undefined;
      pages++;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toEqual([...ids].reverse());
  });

  it('filtra por estado e tipo e isola por guilda', async () => {
    await seed(4); // 2 SCHEDULED, 2 OPEN
    await rooms.ensureOpenLive({
      guildId: GUILD,
      channelId: 'c1',
      title: 'Live',
      maxParticipants: 5,
      createdBy: 'u',
      now: NOW,
    });
    await rooms.ensureOpenLive({
      guildId: 'outra-guilda',
      channelId: 'c2',
      title: 'Live',
      maxParticipants: 5,
      createdBy: 'u',
      now: NOW,
    });

    const scheduled = await rooms.list(GUILD, { statuses: ['SCHEDULED'] }, { limit: 50 });
    expect(scheduled.items).toHaveLength(2);
    const lives = await rooms.list(GUILD, { type: 'LIVE' }, { limit: 50 });
    expect(lives.items.map((r) => r.voiceChannelId)).toEqual(['c1']);
    expect(
      (await rooms.list(GUILD, { statuses: ['OPEN', 'SCHEDULED'] }, { limit: 50 })).items,
    ).toHaveLength(5);
    expect(lives.next).toBeNull();
  });

  it('createdAt vem preenchido', async () => {
    const [id] = await seed(1);
    expect((await rooms.findById(id!))?.createdAt.getTime()).toBeGreaterThan(0);
  });
});
