import { describe, expect, it } from 'vitest';
import { ADMIN, MEMBER, MOD, buildBot, call } from '../fixtures/bot-fakes.js';

// "agora" nos testes é 2026-11-08 15:00Z = 12:00 em Brasília (UTC-3)
const when = { data: '05/12/2026', hora: '20:00' };

async function withMeeting() {
  const b = buildBot();
  b.configureLives();
  await b.router.handle(
    ADMIN,
    call('reuniao', 'agendar', { titulo: 'Reunião de dezembro', ...when }),
  );
  const room = [...b.rooms.rooms.values()][0]!;
  b.gateway.sent.length = 0;
  b.gateway.edits.length = 0;
  return { b, room };
}

describe('/reuniao reagendar', () => {
  it('muda o horário no fuso de Brasília, edita o aviso e avisa o canal', async () => {
    const { b, room } = await withMeeting();
    const r = await b.router.handle(
      ADMIN,
      call('reuniao', 'reagendar', { reuniao: room.id, data: '12/12/2026', hora: '19:30' }),
    );

    expect(r.content).toContain('reagendada');
    expect(r.content).toContain('<t:1797114600:F>');
    expect(b.rooms.rooms.get(room.id)!.startsAt?.toISOString()).toBe('2026-12-12T22:30:00.000Z');
    expect(b.gateway.sent.map((s) => s.payload.embeds[0]!.title)).toEqual([
      '🔁 Reunião reagendada: Reunião de dezembro',
    ]);
    expect(JSON.stringify(b.gateway.edits.at(-1)!.payload)).toContain('<t:1797114600:F>');
    expect(b.auditRepo.of('MEETING_UPDATED')).toMatchObject([
      { actorId: ADMIN.userId, meta: { via: 'command' } },
    ]);
  });

  it('recusa data inválida, horário no passado, reunião inexistente e reunião que já começou', async () => {
    const { b, room } = await withMeeting();
    const reply = async (options: Record<string, string>) =>
      (await b.router.handle(ADMIN, call('reuniao', 'reagendar', options))).content;

    expect(await reply({ reuniao: room.id, data: '31/02/2027', hora: '10:00' })).toContain(
      'inválida',
    );
    expect(await reply({ reuniao: room.id, data: '01/11/2026', hora: '10:00' })).toContain(
      'futuro',
    );
    expect(await reply({ reuniao: 'nada', ...when })).toContain('Não encontrei');

    await b.meetings.open({ id: ADMIN.userId, via: 'command', role: 'ADMIN' }, room.id);
    expect(await reply({ reuniao: room.id, ...when })).toContain('já começou');
    expect(b.auditRepo.of('MEETING_UPDATED')).toHaveLength(0);
  });

  it('só ADMIN reagenda', async () => {
    const { b, room } = await withMeeting();
    for (const actor of [MOD, MEMBER]) {
      const r = await b.router.handle(
        actor,
        call('reuniao', 'reagendar', { reuniao: room.id, ...when }),
      );
      expect(r.content).toContain('não tem permissão');
    }
  });

  it('reagendar para mais perto descarta lembretes que já passaram', async () => {
    const { b, room } = await withMeeting();
    // daqui a 3 h (15:00 em Brasília): lembrete de 24 h já passou; ficam 1 h e 5 min
    await b.router.handle(
      ADMIN,
      call('reuniao', 'reagendar', { reuniao: room.id, data: '08/11/2026', hora: '15:00' }),
    );
    expect(b.rooms.rooms.get(room.id)!.reminders.map((r) => r.minutesBefore)).toEqual([60, 5]);
  });
});

describe('/reuniao cancelar e encerrar (avisos e resumo)', () => {
  it('cancelar avisa o canal com uma mensagem silenciosa', async () => {
    const { b, room } = await withMeeting();
    await b.router.handle(ADMIN, call('reuniao', 'cancelar', { reuniao: room.id }));
    const notice = b.gateway.sent.at(-1)!.payload;
    expect(notice.embeds[0]!.title).toBe('🚫 Reunião cancelada: Reunião de dezembro');
    expect(notice.content).toBeUndefined();
    expect(notice.allowed_mentions).toEqual({ parse: [] });
  });

  it('o motivo registrado ao encerrar depende do papel de quem encerrou', async () => {
    const b = buildBot();
    b.configureLives();
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Primeira reunião' }));
    await b.router.handle(MOD, call('reuniao', 'encerrar'));
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Segunda reunião' }));
    await b.router.handle(ADMIN, call('reuniao', 'encerrar'));
    const reasons = [...b.rooms.rooms.values()].map((r) => r.endReason);
    expect(reasons).toEqual(['ENDED_BY_MOD', 'ENDED_BY_ADMIN']);
  });

  it('o embed de encerramento traz o resumo da reunião', async () => {
    const b = buildBot();
    b.configureLives();
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));
    const room = [...b.rooms.rooms.values()][0]!;
    const t0 = b.clock.now();
    await b.participations.open({
      roomId: room.id,
      userId: 'u1',
      displayName: 'Ana',
      avatarUrl: null,
      role: 'MEMBER',
      at: t0,
    });
    b.clock.advance(42 * 60_000);
    await b.router.handle(ADMIN, call('reuniao', 'encerrar'));

    const fields = b.gateway.edits.at(-1)!.payload.embeds[0]!.fields as {
      name: string;
      value: string;
    }[];
    expect(Object.fromEntries(fields.map((f) => [f.name, f.value]))).toEqual({
      Duração: '42 min',
      Participantes: '1',
      Pico: '1',
    });
  });
});
