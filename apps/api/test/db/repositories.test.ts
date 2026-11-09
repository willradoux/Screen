import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { GuildSettingsModel, RoomModel, SessionModel, UserModel } from '../../src/db/models.js';
import { pingDb } from '../../src/db/connection.js';
import { createSessionRepo, createUserRepo } from '../../src/modules/auth/auth.repositories.js';
import { createRoomRepo } from '../../src/modules/rooms/rooms.repository.js';
import { createSettingsRepo } from '../../src/modules/settings/settings.repository.js';
import { useTestDb } from './helpers.js';

useTestDb('repositories', [UserModel, SessionModel, RoomModel, GuildSettingsModel]);

const GUILD = '222222222222222222';
const NOW = new Date('2026-11-08T15:00:00Z');

describe('conexão', () => {
  it('pingDb responde com o banco conectado', async () => {
    await expect(pingDb()).resolves.toBeUndefined();
  });
});

describe('UserRepo (MongoDB)', () => {
  const users = createUserRepo();
  const input = { id: '1', username: 'fulano', globalName: 'Fulano', avatarHash: 'abc' };

  it('cria no primeiro login e atualiza nos seguintes, sem perder o bloqueio', async () => {
    const first = await users.upsertOnLogin(input);
    expect(first).toMatchObject({ id: '1', username: 'fulano', blocked: false });

    await UserModel.updateOne({ _id: '1' }, { $set: { blocked: true } });
    const second = await users.upsertOnLogin({ ...input, username: 'novo-nome' });
    expect(second).toMatchObject({ username: 'novo-nome', blocked: true });
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('findById', async () => {
    expect(await users.findById('nada')).toBeNull();
    await users.upsertOnLogin(input);
    expect((await users.findById('1'))?.globalName).toBe('Fulano');
  });
});

describe('SessionRepo (MongoDB)', () => {
  const sessions = createSessionRepo();
  const base = {
    id: 'hash1',
    userId: '1',
    discordAccessToken: 'enc-a',
    discordRefreshToken: 'enc-r',
    discordExpiresAt: new Date(Date.now() + 3600_000),
    ip: '127.0.0.1',
    userAgent: 'vitest',
    expiresAt: new Date(Date.now() + 86_400_000),
    absoluteExpiresAt: new Date(Date.now() + 30 * 86_400_000),
  };

  it('cria, busca, renova expiração e tokens, e apaga', async () => {
    await sessions.create(base);
    expect((await sessions.findById('hash1'))?.ip).toBe('127.0.0.1');

    const later = new Date(Date.now() + 2 * 86_400_000);
    await sessions.updateExpiry('hash1', later);
    expect((await sessions.findById('hash1'))?.expiresAt.getTime()).toBe(later.getTime());

    await sessions.updateTokens('hash1', {
      discordAccessToken: 'novo-a',
      discordRefreshToken: 'novo-r',
      discordExpiresAt: later,
    });
    expect((await sessions.findById('hash1'))?.discordAccessToken).toBe('novo-a');

    await sessions.delete('hash1');
    expect(await sessions.findById('hash1')).toBeNull();
  });

  it('deleteByUser remove só as sessões daquele usuário', async () => {
    await sessions.create(base);
    await sessions.create({ ...base, id: 'hash2' });
    await sessions.create({ ...base, id: 'hash3', userId: '2' });
    await sessions.deleteByUser('1');
    expect(await sessions.findById('hash1')).toBeNull();
    expect(await sessions.findById('hash2')).toBeNull();
    expect(await sessions.findById('hash3')).not.toBeNull();
  });

  it('tem índice TTL em expiresAt', async () => {
    const indexes = await SessionModel.collection.indexes();
    const ttl = indexes.find((i) => i.key.expiresAt === 1);
    expect(ttl?.expireAfterSeconds).toBe(0);
  });
});

describe('SettingsRepo (MongoDB)', () => {
  const settings = createSettingsRepo();

  it('sem nada salvo devolve os padrões', async () => {
    expect(await settings.get(GUILD)).toEqual({
      guildId: GUILD,
      liveCategoryId: null,
      liveTextChannelId: null,
      announceChannelId: null,
      adminRoleIds: [],
      modRoleIds: [],
      meetingAllowedRoleIds: [],
      maxParticipantsLive: 25,
      graceSeconds: 30,
      liveChannelIds: [],
      logChannelId: null,
      mentionRoleId: null,
      emptyLiveEndSeconds: null,
      idleSessionMinutes: 10,
      activationGraceMinutes: 3,
      panelUsers: [],
    });
    expect(await settings.getRoleConfig(GUILD)).toEqual({
      adminRoleIds: [],
      modRoleIds: [],
      adminUserIds: [],
      modUserIds: [],
    });
  });

  it('update faz upsert e mantém o resto', async () => {
    await settings.update(GUILD, { liveCategoryId: '10' }, 'u1');
    const s = await settings.update(
      GUILD,
      { announceChannelId: '20', maxParticipantsLive: 40 },
      'u1',
    );
    expect(s).toMatchObject({
      liveCategoryId: '10',
      announceChannelId: '20',
      maxParticipantsLive: 40,
    });
    expect(await GuildSettingsModel.countDocuments()).toBe(1);
  });

  it('modifyList adiciona sem duplicar e remove', async () => {
    await settings.modifyList(GUILD, 'modRoleIds', 'add', 'r1', 'u1');
    await settings.modifyList(GUILD, 'modRoleIds', 'add', 'r1', 'u1');
    const added = await settings.modifyList(GUILD, 'modRoleIds', 'add', 'r2', 'u1');
    expect(added.modRoleIds).toEqual(['r1', 'r2']);
    const removed = await settings.modifyList(GUILD, 'modRoleIds', 'remove', 'r1', 'u1');
    expect(removed.modRoleIds).toEqual(['r2']);
  });

  it('removeReference limpa canal e cargos apagados no Discord', async () => {
    await settings.update(GUILD, { liveCategoryId: 'x', announceChannelId: 'y' }, 'u1');
    await settings.modifyList(GUILD, 'adminRoleIds', 'add', 'x', 'u1');
    await settings.modifyList(GUILD, 'modRoleIds', 'add', 'z', 'u1');

    await settings.removeReference(GUILD, 'x');
    const s = await settings.get(GUILD);
    expect(s.liveCategoryId).toBeNull();
    expect(s.adminRoleIds).toEqual([]);
    expect(s.announceChannelId).toBe('y');
    expect(s.modRoleIds).toEqual(['z']);
  });
});

describe('RoomRepo (MongoDB)', () => {
  const rooms = createRoomRepo();
  const live = (channelId = 'c1') => ({
    guildId: GUILD,
    channelId,
    title: 'Live - Live 1',
    maxParticipants: 25,
    createdBy: 'u1',
    now: NOW,
  });

  it('ensureOpenLive cria uma vez e depois devolve a mesma sala', async () => {
    const a = await rooms.ensureOpenLive(live());
    const b = await rooms.ensureOpenLive(live());
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.room.id).toBe(a.room.id);
    expect(a.room.id).toMatch(/^[\w-]{22}$/);
    expect(a.room).toMatchObject({
      type: 'LIVE',
      status: 'OPEN',
      voiceChannelId: 'c1',
      createdBy: 'u1',
    });
  });

  it('20 eventos simultâneos no mesmo canal geram exatamente UMA sala (índice único parcial)', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () => rooms.ensureOpenLive(live())),
    );
    expect(new Set(results.map((r) => r.room.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(await RoomModel.countDocuments()).toBe(1);
  });

  it('o índice impede duas salas abertas no mesmo canal, mas permite salas encerradas', async () => {
    const first = await rooms.ensureOpenLive(live());
    await rooms.transition(first.room.id, ['OPEN'], 'ENDED', {
      endedAt: NOW,
      endReason: 'VOICE_EMPTY',
    });

    const second = await rooms.ensureOpenLive(live());
    expect(second.created).toBe(true);
    expect(second.room.id).not.toBe(first.room.id);
    expect(await RoomModel.countDocuments({ voiceChannelId: 'c1' })).toBe(2);

    await expect(
      RoomModel.create({
        _id: 'duplicada',
        guildId: GUILD,
        type: 'LIVE',
        status: 'OPEN',
        title: 'x',
        voiceChannelId: 'c1',
        createdBy: 'u',
        maxParticipants: 5,
        livekitRoomName: 'duplicada',
      }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('reuniões não são afetadas pelo índice (voiceChannelId nulo)', async () => {
    const meeting = (title: string) => ({
      guildId: GUILD,
      title,
      description: null,
      startsAt: null,
      createdBy: 'a',
      maxParticipants: 100,
      allowedRoleIds: [],
      reminders: [],
      now: NOW,
    });
    await rooms.createMeeting(meeting('Primeira'));
    await rooms.createMeeting(meeting('Segunda'));
    expect(await RoomModel.countDocuments({ type: 'MEETING' })).toBe(2);
  });

  it('createMeeting: imediata abre; agendada fica SCHEDULED com lembretes pendentes', async () => {
    const immediate = await rooms.createMeeting({
      guildId: GUILD,
      title: 'Agora',
      description: 'pauta',
      startsAt: null,
      createdBy: 'a',
      maxParticipants: 100,
      allowedRoleIds: ['r1'],
      reminders: [],
      now: NOW,
    });
    expect(immediate).toMatchObject({
      status: 'OPEN',
      description: 'pauta',
      allowedRoleIds: ['r1'],
    });
    expect(immediate.openedAt).toEqual(NOW);

    const startsAt = new Date('2026-12-05T23:00:00Z');
    const scheduled = await rooms.createMeeting({
      guildId: GUILD,
      title: 'Dezembro',
      description: null,
      startsAt,
      createdBy: 'a',
      maxParticipants: 100,
      allowedRoleIds: [],
      reminders: [1440, 60, 5],
      now: NOW,
    });
    expect(scheduled).toMatchObject({ type: 'MEETING', status: 'SCHEDULED', openedAt: null });
    expect(scheduled.startsAt).toEqual(startsAt);
    expect(scheduled.reminders).toEqual([
      { minutesBefore: 1440, sentAt: null },
      { minutesBefore: 60, sentAt: null },
      { minutesBefore: 5, sentAt: null },
    ]);
  });

  it('transition só funciona a partir do estado esperado (e só uma vez)', async () => {
    const { room } = await rooms.ensureOpenLive(live());
    expect(await rooms.transition(room.id, ['SCHEDULED'], 'CANCELED', {})).toBeNull();

    const ended = await rooms.transition(room.id, ['OPEN'], 'ENDED', {
      endedAt: NOW,
      endReason: 'VOICE_EMPTY',
    });
    expect(ended).toMatchObject({ status: 'ENDED', endReason: 'VOICE_EMPTY' });
    expect(await rooms.transition(room.id, ['OPEN'], 'ENDED', { endedAt: NOW })).toBeNull();
  });

  it('listOpenLive, findOpenLiveByChannel e listMeetings (ordenado por horário)', async () => {
    const a = await rooms.ensureOpenLive(live('c1'));
    await rooms.ensureOpenLive(live('c2'));
    await rooms.transition(a.room.id, ['OPEN'], 'ENDED', {});
    expect((await rooms.listOpenLive(GUILD)).map((r) => r.voiceChannelId)).toEqual(['c2']);
    expect(await rooms.findOpenLiveByChannel('c1')).toBeNull();
    expect((await rooms.findOpenLiveByChannel('c2'))?.status).toBe('OPEN');

    const m = (title: string, startsAt: Date | null) =>
      rooms.createMeeting({
        guildId: GUILD,
        title,
        description: null,
        startsAt,
        createdBy: 'a',
        maxParticipants: 100,
        allowedRoleIds: [],
        reminders: [],
        now: NOW,
      });
    await m('Depois', new Date('2026-12-20T20:00:00Z'));
    await m('Antes', new Date('2026-12-01T20:00:00Z'));
    const list = await rooms.listMeetings(GUILD, ['SCHEDULED']);
    expect(list.map((r) => r.title)).toEqual(['Antes', 'Depois']);
    expect(await rooms.listMeetings('outra-guilda', ['SCHEDULED'])).toEqual([]);
  });

  it('setAnnouncement grava canal e mensagem', async () => {
    const { room } = await rooms.ensureOpenLive(live());
    await rooms.setAnnouncement(room.id, 'canal', 'msg');
    expect(await rooms.findById(room.id)).toMatchObject({
      announceChannelId: 'canal',
      announceMessageId: 'msg',
    });
    expect(await rooms.findById('nao-existe')).toBeNull();
  });

  it('o nome da sala no LiveKit é o próprio id', async () => {
    const { room } = await rooms.ensureOpenLive(live());
    const raw = await RoomModel.findById(room.id).lean();
    expect(raw?.livekitRoomName).toBe(room.id);
  });
});

describe('estado do mongoose', () => {
  it('está conectado ao banco de teste', () => {
    expect(mongoose.connection.readyState).toBe(1);
    expect(mongoose.connection.name).toBe('repositories');
  });
});
