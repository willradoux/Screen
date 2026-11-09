import { describe, expect, it } from 'vitest';
import { ParticipationModel, RoomModel, UserModel } from '../../src/db/models.js';
import { createStatsRepo, daysBetween, StatsService } from '../../src/modules/stats/stats.js';
import { useTestDb } from './helpers.js';

useTestDb('stats', [RoomModel, ParticipationModel, UserModel]);

const GUILD = '222222222222222222';
const NOW = new Date('2026-11-08T15:00:00Z');
const min = (m: number) => new Date(NOW.getTime() - m * 60_000);
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

async function room(id: string, type: 'LIVE' | 'MEETING', openedAt: Date) {
  await RoomModel.create({
    _id: id,
    guildId: GUILD,
    type,
    status: 'ENDED',
    title: id,
    openedAt,
    createdBy: '1',
    maxParticipants: 25,
    livekitRoomName: id,
  });
}
const part = (
  roomId: string,
  userId: string,
  joinedAt: Date,
  leftAt: Date | null,
  displayName?: string,
) =>
  ParticipationModel.create({
    roomId,
    userId,
    joinedAt,
    leftAt,
    displayName: displayName ?? userId,
    roleAtJoin: 'MEMBER',
  });

describe('estatísticas do servidor (MongoDB real)', () => {
  const service = () =>
    new StatsService({ repo: createStatsRepo(), guildId: GUILD, now: () => NOW });

  it('sem nenhum dado: tudo zerado, com um item por dia', async () => {
    const s = await service().get(7);
    expect(s).toMatchObject({
      livesOpened: 0,
      meetingsHeld: 0,
      uniqueParticipants: 0,
      sessions: 0,
      participantMinutes: 0,
      avgSessionMinutes: 0,
      topPeople: [],
    });
    expect(s.perDay.length).toBeGreaterThanOrEqual(7);
    expect(s.perDay.every((d) => d.participants === 0 && d.minutes === 0)).toBe(true);
  });

  it('conta lives, reuniões, pessoas, minutos e o ranking', async () => {
    await room('L1', 'LIVE', day(1));
    await room('L2', 'LIVE', day(2));
    await room('M1', 'MEETING', day(3));
    await UserModel.create({
      _id: 'u1',
      username: 'ana',
      globalName: 'Ana Souza',
      lastLoginAt: NOW,
    });
    await part('L1', 'u1', min(120), min(60)); // 60 min
    await part('L2', 'u1', min(30 + 1440), min(1440)); // 30 min
    await part('M1', 'u2', min(2000), min(1940), 'Beto'); // 60 min
    await part('M1', 'u3', min(10), null, 'Caio'); // ainda conectado: conta até agora (10 min)

    const s = await service().get(30);
    expect(s.livesOpened).toBe(2);
    expect(s.meetingsHeld).toBe(1);
    expect(s.uniqueParticipants).toBe(3);
    expect(s.sessions).toBe(4);
    expect(s.participantMinutes).toBe(160);
    expect(s.avgSessionMinutes).toBe(40);
    expect(s.topPeople[0]).toEqual({ userId: 'u1', displayName: 'Ana Souza', minutes: 90 });
    expect(s.topPeople.map((p) => p.userId)).toEqual(['u1', 'u2', 'u3']);
    expect(s.perDay.reduce((n, d) => n + d.minutes, 0)).toBe(160);
  });

  it('só considera o período pedido', async () => {
    await room('OLD', 'LIVE', day(60));
    await part('OLD', 'u9', day(60), new Date(day(60).getTime() + 3_600_000));
    expect((await service().get(30)).sessions).toBe(0);
    expect((await service().get(90)).sessions).toBe(1);
  });

  it('daysBetween devolve os dias sem repetir', () => {
    const d = daysBetween(day(3), NOW);
    expect(new Set(d).size).toBe(d.length);
    expect(d.length).toBeGreaterThanOrEqual(4);
  });
});
