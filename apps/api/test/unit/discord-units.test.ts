import { describe, expect, it } from 'vitest';
import { buildRoomMessage, roomUrl } from '../../src/discord/embeds.js';
import { VoiceCache } from '../../src/discord/voice-cache.js';
import type { RoomRecord } from '../../src/modules/rooms/rooms.types.js';
import { KeyedQueue } from '../../src/shared/scheduler.js';
import { discordTime, parseDateTime, zonedTimeToUtc } from '../../src/shared/time.js';

describe('zonedTimeToUtc / parseDateTime', () => {
  const SP = 'America/Sao_Paulo';

  it('Brasília (UTC-3, sem horário de verão desde 2019)', () => {
    expect(parseDateTime('05/12/2026', '20:00', SP)?.toISOString()).toBe(
      '2026-12-05T23:00:00.000Z',
    );
    expect(parseDateTime('05/07/2026', '09:30', SP)?.toISOString()).toBe(
      '2026-07-05T12:30:00.000Z',
    );
  });

  it('aceita dia/mês com um dígito e espaços', () => {
    expect(parseDateTime(' 5/1/2027 ', ' 8:05 ', SP)?.toISOString()).toBe(
      '2027-01-05T11:05:00.000Z',
    );
  });

  it('fuso com horário de verão', () => {
    const NY = 'America/New_York';
    expect(parseDateTime('01/07/2026', '12:00', NY)?.toISOString()).toBe(
      '2026-07-01T16:00:00.000Z',
    ); // EDT
    expect(parseDateTime('01/12/2026', '12:00', NY)?.toISOString()).toBe(
      '2026-12-01T17:00:00.000Z',
    ); // EST
  });

  it('UTC não muda nada', () => {
    expect(parseDateTime('05/12/2026', '20:00', 'UTC')?.toISOString()).toBe(
      '2026-12-05T20:00:00.000Z',
    );
  });

  it('rejeita datas inexistentes e horário que o fuso pula', () => {
    expect(parseDateTime('31/02/2027', '10:00', SP)).toBeNull();
    expect(parseDateTime('29/02/2027', '10:00', SP)).toBeNull(); // 2027 não é bissexto
    expect(parseDateTime('29/02/2028', '10:00', SP)).not.toBeNull();
    expect(parseDateTime('05/13/2026', '10:00', SP)).toBeNull();
    // 08/03/2026 02:30 não existe em Nova York (relógio pula de 02:00 para 03:00)
    expect(parseDateTime('08/03/2026', '02:30', 'America/New_York')).toBeNull();
  });

  it('rejeita formato errado', () => {
    for (const [d, t] of [
      ['2026-12-05', '20:00'],
      ['05/12/26', '20:00'],
      ['05/12/2026', '8pm'],
      ['05/12/2026', '24:00'],
      ['05/12/2026', '20:60'],
      ['', ''],
    ] as const) {
      expect(parseDateTime(d, t, SP), `${d} ${t}`).toBeNull();
    }
  });

  it('zonedTimeToUtc direto', () => {
    expect(
      zonedTimeToUtc(
        { year: 2026, month: 12, day: 5, hour: 20, minute: 0 },
        'America/Sao_Paulo',
      )?.toISOString(),
    ).toBe('2026-12-05T23:00:00.000Z');
  });

  it('discordTime gera timestamps dinâmicos', () => {
    const d = new Date('2026-12-05T23:00:00Z');
    expect(discordTime(d)).toBe('<t:1796511600:F>');
    expect(discordTime(d, 'R')).toBe('<t:1796511600:R>');
  });
});

describe('VoiceCache', () => {
  it('acompanha entradas, saídas e trocas de canal', () => {
    const c = new VoiceCache();
    c.set('a', 'c1');
    c.set('b', 'c1');
    c.set('c', 'c2');
    expect(c.count('c1')).toBe(2);
    expect(c.isInChannel('a', 'c1')).toBe(true);
    c.set('a', 'c2');
    expect(c.membersIn('c1')).toEqual(['b']);
    expect(c.membersIn('c2').sort()).toEqual(['a', 'c']);
    c.set('b', null);
    expect(c.channelOf('b')).toBeNull();
    expect(c.occupiedChannels()).toEqual(['c2']);
  });

  it('replaceAll substitui tudo', () => {
    const c = new VoiceCache();
    c.set('a', 'c1');
    c.replaceAll([{ userId: 'x', channelId: 'c9' }]);
    expect(c.channelOf('a')).toBeNull();
    expect(c.channelOf('x')).toBe('c9');
  });
});

describe('KeyedQueue', () => {
  it('serializa a mesma chave e deixa chaves diferentes correrem em paralelo', async () => {
    const q = new KeyedQueue();
    const log: string[] = [];
    const task = (name: string, ms: number) => async () => {
      log.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, ms));
      log.push(`${name}:end`);
    };
    await Promise.all([
      q.run('k', task('a', 20)),
      q.run('k', task('b', 1)),
      q.run('z', task('z', 1)),
    ]);
    expect(log.indexOf('a:end')).toBeLessThan(log.indexOf('b:start'));
    expect(log.indexOf('z:start')).toBeLessThan(log.indexOf('a:end'));
  });

  it('um erro não trava a fila da chave', async () => {
    const q = new KeyedQueue();
    await expect(q.run('k', async () => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(q.run('k', async () => 'ok')).resolves.toBe('ok');
  });
});

describe('embeds', () => {
  const live: RoomRecord = {
    id: 'abc',
    guildId: 'g',
    type: 'LIVE',
    status: 'OPEN',
    title: 'Live - Live 1',
    description: null,
    voiceChannelId: '123',
    announceChannelId: null,
    announceMessageId: null,
    startsAt: null,
    openedAt: null,
    endedAt: null,
    createdBy: '99',
    maxParticipants: 25,
    allowedRoleIds: [],
    lectureMode: false,
    mediaState: 'IDLE',
    speakerIds: [],
    reminders: [],
    endReason: null,
    createdAt: new Date(0),
  };
  const ctx = { webUrl: 'https://app.exemplo.com/', participants: 3 };

  it('roomUrl não duplica a barra', () => {
    expect(roomUrl('https://app.exemplo.com/', 'abc')).toBe('https://app.exemplo.com/r/abc');
    expect(roomUrl('https://app.exemplo.com', 'abc')).toBe('https://app.exemplo.com/r/abc');
  });

  it('live aberta: título, contagem, canal clicável e botão de link', () => {
    const m = buildRoomMessage(live, ctx);
    expect(m.embeds[0]!.title).toBe('🔴 Live aberta: Live 1');
    expect(JSON.stringify(m.embeds[0]!.fields)).toContain('<#123>');
    expect(JSON.stringify(m.components)).toContain('https://app.exemplo.com/r/abc');
    expect(m.content).toBeUndefined();
  });

  it('live encerrada: sem botão', () => {
    const m = buildRoomMessage({ ...live, status: 'ENDED' }, ctx);
    expect(m.embeds[0]!.title).toBe('⚫ Live encerrada');
    expect(m.components).toEqual([]);
  });

  it('reunião agendada, aberta, cancelada e encerrada', () => {
    const meeting: RoomRecord = {
      ...live,
      type: 'MEETING',
      status: 'SCHEDULED',
      title: 'Mensal',
      voiceChannelId: null,
      startsAt: new Date('2026-12-05T23:00:00Z'),
    };
    expect(buildRoomMessage(meeting, ctx).embeds[0]!.title).toBe('📅 Reunião: Mensal');
    expect(buildRoomMessage({ ...meeting, status: 'OPEN' }, ctx).embeds[0]!.title).toBe(
      '🟢 Reunião aberta agora: Mensal',
    );
    const canceled = buildRoomMessage({ ...meeting, status: 'CANCELED' }, ctx);
    expect(canceled.embeds[0]!.title).toBe('🚫 Reunião cancelada: Mensal');
    expect(canceled.components).toEqual([]);
    expect(buildRoomMessage({ ...meeting, status: 'ENDED' }, ctx).components).toEqual([]);
  });
});
