import { describe, expect, it } from 'vitest';
import { MeetingScheduler } from '../../src/modules/meetings/scheduler.js';
import { createLogger } from '../../src/shared/logger.js';
import { ANNOUNCE, buildBot, flush } from '../fixtures/bot-fakes.js';
import { GUILD_ID } from '../fixtures/fakes.js';

const ADMIN = { id: '700000000000000001', via: 'command' as const, role: 'ADMIN' as const };
const MIN = 60_000;
const H = 60 * MIN;

type Bot = ReturnType<typeof buildBot>;

/** Reunião agendada para `inMinutes` minutos depois de agora (padrão: 26 h). */
async function scheduled(b: Bot, inMinutes = 26 * 60, title = 'Reunião mensal') {
  b.configureLives();
  const startsAt = new Date(b.clock.now().getTime() + inMinutes * MIN);
  const { room } = await b.meetings.create(ADMIN, {
    title,
    description: null,
    startsAt,
    announce: true,
  });
  b.gateway.sent.length = 0; // ignora o aviso inicial
  b.gateway.edits.length = 0;
  return room;
}

const notices = (b: Bot) => b.gateway.sent.map((s) => s.payload.embeds[0]!.title as string);
const state = (b: Bot, id: string) => b.rooms.rooms.get(id)!;

describe('lembretes', () => {
  it('manda cada lembrete no momento certo (24 h, 1 h e 5 min antes), uma única vez', async () => {
    const b = buildBot();
    const room = await scheduled(b);

    expect(await b.meetingScheduler.tick()).toEqual({ opened: 0, reminded: 0, ended: 0 });

    b.clock.advance(2 * H); // faltam 24 h
    expect((await b.meetingScheduler.tick()).reminded).toBe(1);
    expect((await b.meetingScheduler.tick()).reminded).toBe(0); // não repete
    expect(notices(b)).toEqual([`Reunião em breve: ${room.title}`]);

    b.clock.advance(23 * H); // faltam 1 h
    await b.meetingScheduler.tick();
    b.clock.advance(55 * MIN); // faltam 5 min
    await b.meetingScheduler.tick();

    expect(notices(b)).toHaveLength(3);
    expect(state(b, room.id).reminders.every((r) => r.sentAt !== null)).toBe(true);
    expect(state(b, room.id).status).toBe('SCHEDULED'); // ainda não começou
  });

  it('o lembrete vai para o canal de avisos, não marca ninguém e leva o botão da sala', async () => {
    const b = buildBot();
    const room = await scheduled(b);
    b.clock.advance(2 * H);
    await b.meetingScheduler.tick();

    const sent = b.gateway.sent[0]!;
    expect(sent.channelId).toBe(ANNOUNCE);
    expect(sent.payload.content).toBeUndefined();
    expect(sent.payload.allowed_mentions).toEqual({ parse: [] });
    expect(sent.payload.embeds[0]!.description).toMatch(/^Começa <t:\d+:R>\.$/);
    expect(JSON.stringify(sent.payload.components)).toContain(`/r/${room.id}`);
  });

  it('marca o cargo configurado', async () => {
    const b = buildBot({ mentionRoleId: '650000000000000001' });
    await scheduled(b);
    b.clock.advance(2 * H);
    await b.meetingScheduler.tick();
    expect(b.gateway.sent[0]!.payload.content).toBe('<@&650000000000000001>');
  });

  it('lembrete atrasado até 10 minutos ainda é enviado; passou disso, é descartado (e não volta)', async () => {
    const b = buildBot();
    const room = await scheduled(b);

    b.clock.advance(2 * H + 9 * MIN); // 9 min depois da hora do lembrete de 24 h
    await b.meetingScheduler.tick();
    expect(notices(b)).toHaveLength(1);
    b.gateway.sent.length = 0;

    // O servidor ficou parado: o lembrete de 1 h (devido às 25 h) só é visto 20 min depois.
    b.clock.advance(23 * H + 11 * MIN);
    const r = await b.meetingScheduler.tick();
    expect(r.reminded).toBe(0);
    expect(notices(b)).toEqual([]);
    const reminder = (min: number) =>
      state(b, room.id).reminders.find((x) => x.minutesBefore === min)!;
    expect(reminder(60).sentAt).not.toBeNull(); // descartado, não fica tentando para sempre
    expect(reminder(5).sentAt).toBeNull(); // o de 5 min ainda vai chegar na hora certa

    expect((await b.meetingScheduler.tick()).reminded).toBe(0);
  });

  it('servidor fora do ar na hora da reunião: abre ao voltar, sem despejar lembretes velhos', async () => {
    const b = buildBot();
    const room = await scheduled(b);
    b.clock.advance(30 * H); // passou do início por 4 h

    const r = await b.meetingScheduler.tick();
    expect(r).toEqual({ opened: 1, reminded: 0, ended: 0 });
    expect(notices(b)).toEqual([]);
    expect(state(b, room.id).status).toBe('OPEN');
  });

  it('se o envio falha, o lembrete é devolvido e tentado de novo na próxima rodada', async () => {
    const b = buildBot();
    const room = await scheduled(b);
    b.clock.advance(2 * H);

    b.gateway.failSend = true;
    expect((await b.meetingScheduler.tick()).reminded).toBe(0);
    expect(state(b, room.id).reminders.find((r) => r.minutesBefore === 1440)!.sentAt).toBeNull();

    b.gateway.failSend = false;
    b.clock.advance(MIN);
    expect((await b.meetingScheduler.tick()).reminded).toBe(1);
    expect(notices(b)).toHaveLength(1);
  });

  it('se continua falhando por mais de 10 minutos, desiste (não manda lembrete atrasado)', async () => {
    const b = buildBot();
    await scheduled(b);
    b.clock.advance(2 * H);
    b.gateway.failSend = true;
    await b.meetingScheduler.tick();
    b.clock.advance(11 * MIN);
    b.gateway.failSend = false;
    expect((await b.meetingScheduler.tick()).reminded).toBe(0);
    expect(notices(b)).toEqual([]);
  });

  it('sem canal de avisos configurado: não quebra e não repete', async () => {
    const b = buildBot();
    const room = await scheduled(b);
    b.settings.settings.announceChannelId = null;
    state(b, room.id).announceChannelId = null;
    b.clock.advance(2 * H);
    expect((await b.meetingScheduler.tick()).reminded).toBe(0);
    expect(
      state(b, room.id).reminders.find((r) => r.minutesBefore === 1440)!.sentAt,
    ).not.toBeNull();
  });

  it('reunião cancelada não recebe lembrete nem é aberta', async () => {
    const b = buildBot();
    const room = await scheduled(b, 30);
    await b.meetings.cancel(ADMIN, room.id);
    b.gateway.sent.length = 0;
    b.clock.advance(2 * H);
    expect(await b.meetingScheduler.tick()).toEqual({ opened: 0, reminded: 0, ended: 0 });
    expect(state(b, room.id).status).toBe('CANCELED');
    expect(notices(b)).toEqual([]);
  });

  it('duas rodadas ao mesmo tempo (ou dois servidores) não duplicam o lembrete', async () => {
    const b = buildBot();
    await scheduled(b);
    b.clock.advance(2 * H);

    const second = new MeetingScheduler({
      rooms: b.rooms,
      roomService: b.roomService,
      announcer: b.announcer,
      participations: b.participations,
      audit: b.audit,
      scheduler: b.scheduler,
      logger: createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'test' }),
      guildId: GUILD_ID,
      intervalMs: 15_000,
      emptyEndMinutes: 15,
      now: b.clock.now,
    });
    const results = await Promise.all([
      b.meetingScheduler.tick(),
      second.tick(),
      b.meetingScheduler.tick(),
    ]);
    expect(results.reduce((n, r) => n + r.reminded, 0)).toBe(1);
    expect(notices(b)).toHaveLength(1);
  });
});

describe('abertura automática', () => {
  it('abre no horário: estado OPEN, embed editado para "aberta agora" e auditoria do sistema', async () => {
    const b = buildBot();
    const room = await scheduled(b, 10);
    b.clock.advance(9 * MIN);
    expect((await b.meetingScheduler.tick()).opened).toBe(0);

    b.clock.advance(MIN);
    expect((await b.meetingScheduler.tick()).opened).toBe(1);

    expect(state(b, room.id)).toMatchObject({ status: 'OPEN', openedAt: b.clock.now() });
    const edit = b.gateway.edits.at(-1)!.payload;
    expect(edit.embeds[0]!.title).toBe(`Reunião aberta agora: ${room.title}`);
    expect(JSON.stringify(edit.components)).toContain('Entrar na reunião');
    expect(b.auditRepo.of('MEETING_OPENED')).toMatchObject([
      { actorId: 'system', roomId: room.id, meta: { via: 'scheduler' } },
    ]);
  });

  it('é idempotente: não abre duas vezes nem edita de novo', async () => {
    const b = buildBot();
    await scheduled(b, 10);
    b.clock.advance(10 * MIN);
    await b.meetingScheduler.tick();
    const edits = b.gateway.edits.length;
    expect((await b.meetingScheduler.tick()).opened).toBe(0);
    expect(b.gateway.edits).toHaveLength(edits);
    expect(b.auditRepo.of('MEETING_OPENED')).toHaveLength(1);
  });

  it('reunião aberta à mão antes da hora não é reaberta pelo relógio', async () => {
    const b = buildBot();
    const room = await scheduled(b, 60);
    await b.meetings.open({ ...ADMIN, via: 'api' }, room.id);
    const openedAt = state(b, room.id).openedAt;
    b.clock.advance(2 * H);
    expect((await b.meetingScheduler.tick()).opened).toBe(0);
    expect(state(b, room.id).openedAt).toEqual(openedAt);
  });

  it('abre várias reuniões do mesmo horário', async () => {
    const b = buildBot();
    await scheduled(b, 10, 'Reunião A');
    await scheduled(b, 10, 'Reunião B');
    b.clock.advance(10 * MIN);
    expect((await b.meetingScheduler.tick()).opened).toBe(2);
  });

  it('falha ao editar o embed não impede a abertura', async () => {
    const b = buildBot();
    const room = await scheduled(b, 10);
    b.gateway.editMessage = async () => {
      throw new Error('Missing Access');
    };
    b.clock.advance(10 * MIN);
    expect((await b.meetingScheduler.tick()).opened).toBe(1);
    expect(state(b, room.id).status).toBe('OPEN');
  });

  it('um erro numa reunião não impede as outras', async () => {
    const b = buildBot();
    const bad = await scheduled(b, 10, 'Reunião com problema');
    const good = await scheduled(b, 10, 'Reunião normal');
    const original = b.rooms.transition.bind(b.rooms);
    b.rooms.transition = async (id, from, to, patch) => {
      if (id === bad.id) throw new Error('banco indisponível');
      return original(id, from, to, patch);
    };
    b.clock.advance(10 * MIN);
    const r = await b.meetingScheduler.tick();
    expect(r.opened).toBe(1);
    expect(state(b, good.id).status).toBe('OPEN');
    expect(state(b, bad.id).status).toBe('SCHEDULED');
  });
});

describe('encerramento de reunião abandonada', () => {
  const opened = async (b: Bot) => {
    b.configureLives();
    const { room } = await b.meetings.create(ADMIN, {
      title: 'Reunião mensal',
      description: null,
      startsAt: null,
      announce: true,
    });
    return room;
  };

  it('vazia por 15 minutos: encerra com MEETING_FINISHED e atualiza o embed com o resumo', async () => {
    const b = buildBot();
    const room = await opened(b);

    b.clock.advance(14 * MIN);
    expect((await b.meetingScheduler.tick()).ended).toBe(0);
    b.clock.advance(MIN);
    expect((await b.meetingScheduler.tick()).ended).toBe(1);

    expect(state(b, room.id)).toMatchObject({ status: 'ENDED', endReason: 'MEETING_FINISHED' });
    expect(b.auditRepo.of('ROOM_ENDED')).toMatchObject([
      { actorId: 'system', meta: { via: 'scheduler', reason: 'MEETING_FINISHED' } },
    ]);
    const edit = b.gateway.edits.at(-1)!.payload;
    expect(edit.embeds[0]!.title).toBe(`Reunião encerrada: ${room.title}`);
    expect(edit.embeds[0]!.fields).toEqual([
      { name: 'Duração', value: '15 min', inline: true },
      { name: 'Participantes', value: '0', inline: true },
      { name: 'Pico', value: '0', inline: true },
    ]);
  });

  it('com gente dentro nunca encerra; o prazo conta a partir da última saída', async () => {
    const b = buildBot();
    const room = await opened(b);
    await b.participations.open({
      roomId: room.id,
      userId: 'u1',
      displayName: 'Fulano',
      avatarUrl: null,
      role: 'MEMBER',
      at: b.clock.now(),
    });

    b.clock.advance(2 * H);
    expect((await b.meetingScheduler.tick()).ended).toBe(0);

    await b.participations.close(room.id, 'u1', 'LEFT', b.clock.now());
    b.clock.advance(14 * MIN);
    expect((await b.meetingScheduler.tick()).ended).toBe(0);
    b.clock.advance(MIN);
    expect((await b.meetingScheduler.tick()).ended).toBe(1);
  });

  it('o resumo do embed final traz duração, participantes e pico', async () => {
    const b = buildBot();
    const room = await opened(b);
    const t0 = b.clock.now();
    await b.participations.open({
      roomId: room.id,
      userId: 'a',
      displayName: 'A',
      avatarUrl: null,
      role: 'MEMBER',
      at: t0,
    });
    await b.participations.open({
      roomId: room.id,
      userId: 'b',
      displayName: 'B',
      avatarUrl: null,
      role: 'MEMBER',
      at: new Date(t0.getTime() + 10 * MIN),
    });
    b.clock.advance(30 * MIN);
    await b.participations.close(room.id, 'a', 'LEFT', b.clock.now());
    await b.participations.close(room.id, 'b', 'LEFT', b.clock.now());
    b.clock.advance(15 * MIN);
    await b.meetingScheduler.tick();

    const fields = b.gateway.edits.at(-1)!.payload.embeds[0]!.fields as {
      name: string;
      value: string;
    }[];
    expect(Object.fromEntries(fields.map((f) => [f.name, f.value]))).toEqual({
      Duração: '45 min',
      Participantes: '2',
      Pico: '2',
    });
  });

  it('lives não são tocadas pelo agendador de reuniões', async () => {
    const b = buildBot();
    b.configureLives();
    await b.live.handle({ userId: 'u1', oldChannelId: null, newChannelId: '500000000000000011' });
    b.clock.advance(5 * H);
    expect((await b.meetingScheduler.tick()).ended).toBe(0);
  });

  it('reunião agendada que abre tarde conta os 15 minutos a partir da abertura', async () => {
    const b = buildBot();
    const room = await scheduled(b, 10);
    b.clock.advance(3 * H);
    expect((await b.meetingScheduler.tick()).opened).toBe(1);
    expect((await b.meetingScheduler.tick()).ended).toBe(0); // acabou de abrir
    b.clock.advance(15 * MIN);
    expect((await b.meetingScheduler.tick()).ended).toBe(1);
    expect(state(b, room.id).status).toBe('ENDED');
  });
});

describe('o relógio (start e stop)', () => {
  it('start roda já e depois a cada 15 s; stop interrompe; start repetido não duplica', async () => {
    const b = buildBot();
    await scheduled(b, 5); // exige 2 min de antecedência; ajustamos o início logo abaixo
    const room = [...b.rooms.rooms.values()][0]!;
    room.startsAt = new Date(b.clock.now().getTime() + 20_000);

    b.meetingScheduler.start();
    b.meetingScheduler.start();
    await flush();
    expect(state(b, room.id).status).toBe('SCHEDULED');
    expect(b.scheduler.pending).toBe(1); // um único relógio armado

    b.clock.advance(20_000);
    await b.scheduler.advance(15_000);
    expect(state(b, room.id).status).toBe('OPEN');

    b.meetingScheduler.stop();
    expect(b.scheduler.pending).toBe(0);
    b.clock.advance(H);
    await b.scheduler.advance(60_000);
    expect(b.auditRepo.of('ROOM_ENDED')).toHaveLength(0); // parou: nada mais acontece
  });

  it('um erro na rodada não derruba o relógio', async () => {
    const b = buildBot();
    let calls = 0;
    const original = b.rooms.listMeetings.bind(b.rooms);
    b.rooms.listMeetings = async (...args) => {
      if (++calls === 1) throw new Error('banco indisponível');
      return original(...args);
    };
    b.meetingScheduler.start();
    await flush();
    expect(b.scheduler.pending).toBe(1); // rearmou mesmo com o erro
    await b.scheduler.advance(15_000);
    expect(calls).toBeGreaterThan(1);
    b.meetingScheduler.stop();
  });
});

describe('reagendar', () => {
  it('muda o horário, volta a marcar os lembretes e avisa o canal', async () => {
    const b = buildBot();
    const room = await scheduled(b);
    b.clock.advance(2 * H);
    await b.meetingScheduler.tick(); // lembrete de 24 h já enviado
    b.gateway.sent.length = 0;

    const newStart = new Date(b.clock.now().getTime() + 48 * H);
    const updated = await b.meetings.update(ADMIN, room.id, { startsAt: newStart });

    expect(updated.startsAt).toEqual(newStart);
    expect(updated.reminders.map((r) => [r.minutesBefore, r.sentAt])).toEqual([
      [1440, null],
      [60, null],
      [5, null],
    ]);
    expect(notices(b)).toEqual([`Reunião reagendada: ${room.title}`]);
    expect(b.gateway.edits.at(-1)!.payload.embeds[0]!.title).toBe(`Reunião: ${room.title}`);
    expect(b.auditRepo.of('MEETING_UPDATED')).toHaveLength(1);

    // o lembrete antigo não dispara de novo agora; só 24 h antes do novo horário
    expect((await b.meetingScheduler.tick()).reminded).toBe(0);
    b.clock.advance(24 * H);
    expect((await b.meetingScheduler.tick()).reminded).toBe(1);
  });

  it('para um horário mais próximo, descarta os lembretes que já passaram', async () => {
    const b = buildBot();
    const room = await scheduled(b);
    const updated = await b.meetings.update(ADMIN, room.id, {
      startsAt: new Date(b.clock.now().getTime() + 30 * MIN),
    });
    expect(updated.reminders.map((r) => r.minutesBefore)).toEqual([5]);
  });

  it('o horário antigo deixa de valer: não abre no horário velho', async () => {
    const b = buildBot();
    const room = await scheduled(b, 10);
    await b.meetings.update(ADMIN, room.id, {
      startsAt: new Date(b.clock.now().getTime() + 3 * H),
    });
    b.clock.advance(15 * MIN);
    expect((await b.meetingScheduler.tick()).opened).toBe(0);
    expect(state(b, room.id).status).toBe('SCHEDULED');
  });
});
