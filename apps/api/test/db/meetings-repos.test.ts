import { describe, expect, it } from 'vitest';
import { ParticipationModel, RoomModel } from '../../src/db/models.js';
import { createParticipationRepo } from '../../src/modules/rooms/participations.js';
import { createRoomRepo } from '../../src/modules/rooms/rooms.repository.js';
import { useTestDb } from './helpers.js';

useTestDb('meetings-repos', [RoomModel, ParticipationModel]);

const NOW = new Date('2026-11-08T15:00:00Z');
const H = 3_600_000;
const GUILD = 'g';

describe('RoomRepo: agendamento e lembretes (MongoDB)', () => {
  const rooms = createRoomRepo();
  const make = (startsAt: Date | null, reminders = [1440, 60, 5]) =>
    rooms.createMeeting({
      guildId: GUILD,
      title: 'Mensal',
      description: null,
      startsAt,
      createdBy: 'a',
      maxParticipants: 100,
      allowedRoleIds: [],
      reminders,
      now: NOW,
    });

  it('claimReminder reserva cada lembrete uma única vez', async () => {
    const m = await make(new Date(NOW.getTime() + 30 * H));
    expect(await rooms.claimReminder(m.id, 1440, NOW)).toBe(true);
    expect(await rooms.claimReminder(m.id, 1440, NOW)).toBe(false);
    expect(await rooms.claimReminder(m.id, 999, NOW)).toBe(false); // não existe
    const found = await rooms.findById(m.id);
    expect(found!.reminders.find((r) => r.minutesBefore === 1440)!.sentAt).toEqual(NOW);
    expect(found!.reminders.find((r) => r.minutesBefore === 60)!.sentAt).toBeNull();
  });

  it('20 reservas simultâneas do mesmo lembrete: só uma vence (envio nunca duplica)', async () => {
    const m = await make(new Date(NOW.getTime() + 30 * H));
    const results = await Promise.all(
      Array.from({ length: 20 }, () => rooms.claimReminder(m.id, 60, NOW)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('releaseReminder devolve só o lembrete pedido, que pode ser reservado de novo', async () => {
    const m = await make(new Date(NOW.getTime() + 30 * H));
    await rooms.claimReminder(m.id, 1440, NOW);
    await rooms.claimReminder(m.id, 60, NOW);
    await rooms.releaseReminder(m.id, 1440);
    const found = await rooms.findById(m.id);
    expect(found!.reminders.find((r) => r.minutesBefore === 1440)!.sentAt).toBeNull();
    expect(found!.reminders.find((r) => r.minutesBefore === 60)!.sentAt).toEqual(NOW);
    expect(await rooms.claimReminder(m.id, 1440, NOW)).toBe(true);
  });

  it('não reserva lembrete de reunião que não está mais agendada', async () => {
    const m = await make(new Date(NOW.getTime() + 30 * H));
    await rooms.transition(m.id, ['SCHEDULED'], 'CANCELED', {});
    expect(await rooms.claimReminder(m.id, 1440, NOW)).toBe(false);
  });

  it('updateSchedule reagenda e zera os lembretes que ainda fazem sentido', async () => {
    const m = await make(new Date(NOW.getTime() + 30 * H));
    await rooms.claimReminder(m.id, 1440, NOW);

    const startsAt = new Date(NOW.getTime() + 72 * H);
    const updated = await rooms.updateSchedule(m.id, { startsAt, now: NOW });
    expect(updated!.startsAt).toEqual(startsAt);
    expect(updated!.reminders).toEqual([
      { minutesBefore: 1440, sentAt: null },
      { minutesBefore: 60, sentAt: null },
      { minutesBefore: 5, sentAt: null },
    ]);
  });

  it('updateSchedule descarta lembretes cujo momento já passou e ordena do maior para o menor', async () => {
    const m = await make(new Date(NOW.getTime() + 30 * H));
    const soon = await rooms.updateSchedule(m.id, {
      startsAt: new Date(NOW.getTime() + 30 * 60_000),
      now: NOW,
    });
    expect(soon!.reminders.map((r) => r.minutesBefore)).toEqual([5]);

    const custom = await rooms.updateSchedule(m.id, {
      reminders: [10, 20, 10, 0, 29, 31],
      now: NOW,
    });
    expect(custom!.reminders.map((r) => r.minutesBefore)).toEqual([29, 20, 10]); // 31 e 0 fora
    expect(custom!.startsAt).toEqual(soon!.startsAt); // horário mantido
  });

  it('updateSchedule só vale para reunião agendada', async () => {
    const open = await make(null);
    expect(
      await rooms.updateSchedule(open.id, { startsAt: new Date(NOW.getTime() + H), now: NOW }),
    ).toBeNull();
    const m = await make(new Date(NOW.getTime() + 30 * H));
    await rooms.transition(m.id, ['SCHEDULED'], 'OPEN', {});
    expect(
      await rooms.updateSchedule(m.id, { startsAt: new Date(NOW.getTime() + 40 * H), now: NOW }),
    ).toBeNull();
    expect(
      await rooms.updateSchedule('nao-existe', { startsAt: new Date(NOW.getTime() + H), now: NOW }),
    ).toBeNull();
  });

  it('update aceita a lista de cargos de acesso', async () => {
    const m = await make(null);
    const updated = await rooms.update(m.id, { allowedRoleIds: ['r1', 'r2'] });
    expect(updated!.allowedRoleIds).toEqual(['r1', 'r2']);
  });
});

describe('ParticipationRepo: histórico para o relatório (MongoDB)', () => {
  const repo = createParticipationRepo();
  const base = {
    roomId: 'R'.repeat(22),
    displayName: 'Ana',
    avatarUrl: null,
    role: 'MEMBER' as const,
  };

  it('listAll devolve abertas e fechadas, da mais antiga para a mais nova', async () => {
    await repo.open({ ...base, userId: 'b', at: new Date(NOW.getTime() + 5000) });
    await repo.open({ ...base, userId: 'a', at: NOW });
    await repo.close(base.roomId, 'a', 'LEFT', new Date(NOW.getTime() + 9000));
    await repo.open({ ...base, userId: 'a', at: new Date(NOW.getTime() + 20_000) });
    await repo.open({ ...base, userId: 'z', roomId: 'outra'.padEnd(22, 'x'), at: NOW });

    const all = await repo.listAll(base.roomId);
    expect(all.map((p) => [p.userId, p.leftAt !== null])).toEqual([
      ['a', true],
      ['b', false],
      ['a', false],
    ]);
  });

  it('lastActivityAt é o último instante de entrada ou saída (null se nunca houve ninguém)', async () => {
    expect(await repo.lastActivityAt(base.roomId)).toBeNull();

    await repo.open({ ...base, userId: 'a', at: NOW });
    expect(await repo.lastActivityAt(base.roomId)).toEqual(NOW);

    const left = new Date(NOW.getTime() + 60_000);
    await repo.close(base.roomId, 'a', 'LEFT', left);
    expect(await repo.lastActivityAt(base.roomId)).toEqual(left);

    const rejoin = new Date(NOW.getTime() + 120_000);
    await repo.open({ ...base, userId: 'b', at: rejoin });
    expect(await repo.lastActivityAt(base.roomId)).toEqual(rejoin);
  });
});
