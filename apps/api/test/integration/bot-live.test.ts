import { describe, expect, it } from 'vitest';
import {
  CATEGORY,
  LIVE_TEXT,
  OUTSIDE_VOICE,
  VOICE_1,
  VOICE_2,
  WEB_URL,
  buildBot,
  flush,
} from '../fixtures/bot-fakes.js';

const U1 = '800000000000000001';
const U2 = '800000000000000002';
const U3 = '800000000000000003';

const join = (b: ReturnType<typeof buildBot>, userId: string, channelId: string) =>
  b.live.handle({ userId, oldChannelId: null, newChannelId: channelId });
const leave = (b: ReturnType<typeof buildBot>, userId: string, channelId: string) =>
  b.live.handle({ userId, oldChannelId: channelId, newChannelId: null });

const field = (payload: { embeds: Record<string, unknown>[] }, name: string) =>
  (payload.embeds[0]!.fields as { name: string; value: string }[]).find((f) => f.name === name)
    ?.value;

describe('entrada num canal da categoria de lives', () => {
  it('cria a sala e envia UM embed com botão para o link único', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);

    expect(b.rooms.rooms.size).toBe(1);
    const room = [...b.rooms.rooms.values()][0]!;
    expect(room).toMatchObject({
      type: 'LIVE',
      status: 'OPEN',
      voiceChannelId: VOICE_1,
      title: 'Live - Live 1',
      createdBy: U1,
    });
    expect(room.id).toMatch(/^[\w-]{22}$/);

    expect(b.gateway.sent).toHaveLength(1);
    const { channelId, payload } = b.gateway.sent[0]!;
    expect(channelId).toBe(LIVE_TEXT);
    expect(payload.embeds[0]!.title).toBe('🔴 Live aberta: Live 1');
    expect(payload.embeds[0]!.description).toContain(`<@${U1}>`);
    expect(field(payload, 'Participantes')).toBe('1');
    expect(payload.components).toEqual([
      {
        type: 1,
        components: [{ type: 2, style: 5, label: 'Abrir sala', url: `${WEB_URL}/r/${room.id}` }],
      },
    ]);
    // O ID da mensagem fica guardado para as próximas edições.
    expect(room.announceMessageId).toBe(b.gateway.sent[0]!.messageId);
    // Não pode marcar ninguém.
    expect(payload.allowed_mentions).toEqual({ parse: [] });
  });

  it('segunda pessoa entra: não cria outra sala nem outra mensagem, só atualiza (com atraso)', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await join(b, U2, VOICE_1);

    expect(b.rooms.rooms.size).toBe(1);
    expect(b.gateway.sent).toHaveLength(1);
    expect(b.gateway.edits).toHaveLength(0); // ainda dentro do intervalo de 15 s

    await b.scheduler.advance(15_000);
    expect(b.gateway.edits).toHaveLength(1);
    expect(field(b.gateway.edits[0]!.payload, 'Participantes')).toBe('2');
  });

  it('várias entradas seguidas viram uma única edição (limite de taxa)', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await join(b, U2, VOICE_1);
    await join(b, U3, VOICE_1);
    await leave(b, U3, VOICE_1);
    await b.scheduler.advance(15_000);
    expect(b.gateway.edits).toHaveLength(1);
    expect(field(b.gateway.edits[0]!.payload, 'Participantes')).toBe('2');
  });

  it('dois canais diferentes geram duas salas independentes', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await join(b, U2, VOICE_2);
    expect(b.rooms.rooms.size).toBe(2);
    expect(b.gateway.sent).toHaveLength(2);
  });

  it('eventos simultâneos no mesmo canal não duplicam sala nem embed', async () => {
    const b = buildBot();
    b.configureLives();
    await Promise.all([join(b, U1, VOICE_1), join(b, U2, VOICE_1), join(b, U3, VOICE_1)]);
    expect(b.rooms.rooms.size).toBe(1);
    expect(b.gateway.sent).toHaveLength(1);
  });

  it('mudar de um canal de live para outro: sai de um e entra no outro', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await b.live.handle({ userId: U1, oldChannelId: VOICE_1, newChannelId: VOICE_2 });
    expect(b.rooms.rooms.size).toBe(2);
    expect(b.cache.channelOf(U1)).toBe(VOICE_2);
    expect(b.cache.count(VOICE_1)).toBe(0);
  });
});

describe('o que NÃO deve abrir sala', () => {
  it('canal de voz fora da categoria', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, OUTSIDE_VOICE);
    expect(b.rooms.rooms.size).toBe(0);
    expect(b.gateway.sent).toHaveLength(0);
  });

  it('categoria de lives ainda não configurada', async () => {
    const b = buildBot();
    await join(b, U1, VOICE_1);
    expect(b.rooms.rooms.size).toBe(0);
  });

  it('canal de texto dentro da categoria', async () => {
    const b = buildBot();
    b.configureLives();
    b.gateway.addChannel({ id: '5999', name: 'chat', kind: 'text', parentId: CATEGORY });
    await join(b, U1, '5999');
    expect(b.rooms.rooms.size).toBe(0);
  });

  it('mudança sem troca de canal (mutar/desmutar) é ignorada', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await b.live.handle({ userId: U1, oldChannelId: VOICE_1, newChannelId: VOICE_1 });
    expect(b.gateway.sent).toHaveLength(1);
    expect(b.scheduler.pending).toBe(0);
  });
});

describe('canal de embeds não configurado ou com problema', () => {
  it('sem canal das lives: a sala é criada, sem embed e sem erro; ao configurar, o próximo join publica', async () => {
    const b = buildBot();
    b.configureLives();
    b.settings.settings.liveTextChannelId = null;
    await join(b, U1, VOICE_1);
    expect(b.rooms.rooms.size).toBe(1);
    expect(b.gateway.sent).toHaveLength(0);

    b.settings.settings.liveTextChannelId = LIVE_TEXT;
    await join(b, U2, VOICE_1);
    expect(b.gateway.sent).toHaveLength(1);
    expect(b.rooms.rooms.size).toBe(1);
  });

  it('falha ao enviar (bot sem permissão) não derruba o handler', async () => {
    const b = buildBot();
    b.configureLives();
    b.gateway.failSend = true;
    await expect(join(b, U1, VOICE_1)).resolves.toBeUndefined();
    expect(b.rooms.rooms.size).toBe(1);
  });

  it('mensagem apagada por alguém: o próximo update reenvia e guarda o novo ID', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    const first = b.gateway.sent[0]!;
    b.gateway.deleteMessage(first.channelId, first.messageId);

    await join(b, U2, VOICE_1);
    await b.scheduler.advance(15_000);

    expect(b.gateway.sent).toHaveLength(2);
    const room = [...b.rooms.rooms.values()][0]!;
    expect(room.announceMessageId).toBe(b.gateway.sent[1]!.messageId);
  });
});

describe('saída e encerramento', () => {
  it('sair sem esvaziar o canal só atualiza a contagem', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await join(b, U2, VOICE_1);
    await leave(b, U2, VOICE_1);
    await b.scheduler.advance(15_000);
    expect(field(b.gateway.edits.at(-1)!.payload, 'Participantes')).toBe('1');
    expect([...b.rooms.rooms.values()][0]!.status).toBe('OPEN');
  });

  it('canal vazio por 60 s encerra a sala e troca o embed por "Live encerrada" sem botão', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await leave(b, U1, VOICE_1);

    await b.scheduler.advance(59_000);
    expect([...b.rooms.rooms.values()][0]!.status).toBe('OPEN');

    await b.scheduler.advance(1_000);
    const room = [...b.rooms.rooms.values()][0]!;
    expect(room.status).toBe('ENDED');
    expect(room.endReason).toBe('VOICE_EMPTY');
    const last = b.gateway.edits.at(-1)!.payload;
    expect(last.embeds[0]!.title).toBe('⚫ Live encerrada');
    expect(last.components).toEqual([]);
  });

  it('voltar antes dos 60 s cancela o encerramento', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await leave(b, U1, VOICE_1);
    await b.scheduler.advance(30_000);
    await join(b, U2, VOICE_1);
    await b.scheduler.advance(120_000);
    expect([...b.rooms.rooms.values()][0]!.status).toBe('OPEN');
    expect(b.rooms.rooms.size).toBe(1);
  });

  it('depois de encerrada, nova entrada no canal abre uma sala nova com novo link', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    await leave(b, U1, VOICE_1);
    await b.scheduler.advance(60_000);
    const firstId = [...b.rooms.rooms.keys()][0]!;

    await join(b, U2, VOICE_1);
    expect(b.rooms.rooms.size).toBe(2);
    const open = [...b.rooms.rooms.values()].filter((r) => r.status === 'OPEN');
    expect(open).toHaveLength(1);
    expect(open[0]!.id).not.toBe(firstId);
    expect(b.gateway.sent).toHaveLength(2);
  });

  it('encerrar é idempotente: ouvintes são chamados uma vez só', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    const room = [...b.rooms.rooms.values()][0]!;
    const calls: string[] = [];
    b.roomService.onEnded((r, reason) => void calls.push(`${r.id}:${reason}`));

    await b.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    await b.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    expect(calls).toEqual([`${room.id}:ENDED_BY_MOD`]);
  });
});

describe('reconciliação ao iniciar', () => {
  it('encerra salas cujo canal ficou vazio enquanto o bot estava fora', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    b.gateway.voiceStates = []; // todos saíram com o bot offline
    await b.live.reconcile();
    const room = [...b.rooms.rooms.values()][0]!;
    expect(room.status).toBe('ENDED');
    expect(room.endReason).toBe('VOICE_EMPTY');
  });

  it('mantém salas com gente e NÃO duplica o embed (edita o existente)', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, U1, VOICE_1);
    b.gateway.voiceStates = [
      { userId: U1, channelId: VOICE_1 },
      { userId: U2, channelId: VOICE_1 },
    ];
    await b.live.reconcile();

    expect(b.rooms.rooms.size).toBe(1);
    expect(b.gateway.sent).toHaveLength(1);
    expect(field(b.gateway.edits.at(-1)!.payload, 'Participantes')).toBe('2');
  });

  it('cria sala para canal já ocupado que não tinha sala', async () => {
    const b = buildBot();
    b.configureLives();
    b.gateway.voiceStates = [{ userId: U1, channelId: VOICE_2 }];
    await b.live.reconcile();
    expect(b.rooms.rooms.size).toBe(1);
    expect([...b.rooms.rooms.values()][0]!.voiceChannelId).toBe(VOICE_2);
    expect(b.gateway.sent).toHaveLength(1);
  });

  it('ignora canais ocupados fora da categoria', async () => {
    const b = buildBot();
    b.configureLives();
    b.gateway.voiceStates = [{ userId: U1, channelId: OUTSIDE_VOICE }];
    await b.live.reconcile();
    expect(b.rooms.rooms.size).toBe(0);
  });

  it('é idempotente: rodar duas vezes não duplica nada', async () => {
    const b = buildBot();
    b.configureLives();
    b.gateway.voiceStates = [{ userId: U1, channelId: VOICE_1 }];
    await b.live.reconcile();
    await b.live.reconcile();
    await flush();
    expect(b.rooms.rooms.size).toBe(1);
    expect(b.gateway.sent).toHaveLength(1);
  });

  it('cache de voz reflete o estado real depois da reconciliação', async () => {
    const b = buildBot();
    b.configureLives();
    b.gateway.voiceStates = [
      { userId: U1, channelId: VOICE_1 },
      { userId: U2, channelId: VOICE_2 },
    ];
    await b.live.reconcile();
    expect(b.cache.isInChannel(U1, VOICE_1)).toBe(true);
    expect(b.cache.isInChannel(U1, VOICE_2)).toBe(false);
    expect(b.cache.membersIn(VOICE_2)).toEqual([U2]);
  });
});
