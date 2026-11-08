import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { LiveKitEvent } from '../../src/modules/livekit/livekit.gateway.js';
import { VOICE_1 } from '../fixtures/bot-fakes.js';
import { buildRoomsApp, type RoomsCtx } from '../fixtures/rooms-fakes.js';

const USER = '910000000000000001';
const MOD = '910000000000000002';

async function openLive(ctx: RoomsCtx, userId = USER) {
  await ctx.live.handle({ userId, oldChannelId: null, newChannelId: VOICE_1 });
  return [...ctx.rooms.rooms.values()][0]!;
}

const joined = (roomName: string, identity: string, metadata: string): LiveKitEvent => ({
  event: 'participant_joined',
  roomName,
  participant: { identity, name: `Nome ${identity.slice(-1)}`, metadata, leaveCause: 'other' },
});
const left = (
  roomName: string,
  identity: string,
  leaveCause: 'client' | 'duplicate' | 'other',
): LiveKitEvent => ({
  event: 'participant_left',
  roomName,
  participant: { identity, name: '', metadata: '', leaveCause },
});

/** POST do webhook como o LiveKit faz: sem sessão e sem Origin. */
async function deliver(ctx: RoomsCtx, event: LiveKitEvent, signed = true) {
  const { body, auth } = ctx.sendWebhook(event, signed);
  return request(ctx.app)
    .post('/api/v1/livekit/webhook')
    .set('Content-Type', 'application/webhook+json')
    .set('Authorization', auth)
    .send(body);
}

const meta = (role: string, avatarUrl: string | null = null) => JSON.stringify({ role, avatarUrl });

describe('POST /livekit/webhook', () => {
  it('assinatura inválida -> 401 e nada é processado', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const res = await deliver(ctx, joined(room.id, USER, meta('MEMBER')), false);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
    expect(ctx.participations.rows).toHaveLength(0);
  });

  it('sem cabeçalho de autorização -> 401', async () => {
    const ctx = buildRoomsApp();
    const res = await request(ctx.app)
      .post('/api/v1/livekit/webhook')
      .set('Content-Type', 'application/webhook+json')
      .send('qualquer coisa');
    expect(res.status).toBe(401);
  });

  it('não exige Origin nem sofre o limite geral de requisições', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    let last = 0;
    for (let i = 0; i < 130; i++) {
      last = (
        await deliver(ctx, { event: 'track_published', roomName: room.id, participant: null })
      ).status;
    }
    expect(last).toBe(200);
  });

  it('eventos desconhecidos e salas desconhecidas são aceitos e ignorados', async () => {
    const ctx = buildRoomsApp();
    expect(
      (await deliver(ctx, { event: 'egress_started', roomName: null, participant: null })).status,
    ).toBe(200);
    const res = await deliver(ctx, joined('x'.repeat(22), USER, meta('MEMBER')));
    expect(res.status).toBe(200);
    expect(ctx.participations.rows).toHaveLength(0);
    expect(ctx.livekit.removed).toHaveLength(0);
  });
});

describe('participant_joined', () => {
  it('quem está na call vira participante e a sala é avisada', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    const res = await deliver(ctx, joined(room.id, USER, meta('MEMBER', 'https://cdn/avatar.png')));
    expect(res.status).toBe(200);

    expect(ctx.participations.rows).toHaveLength(1);
    expect(ctx.participations.rows[0]).toMatchObject({
      roomId: room.id,
      userId: USER,
      displayName: 'Nome 1',
      roleAtJoin: 'MEMBER',
      avatarUrl: 'https://cdn/avatar.png',
      leftAt: null,
    });
    expect(ctx.emitter.of('participant:joined')).toEqual([
      {
        target: 'room',
        id: room.id,
        event: 'participant:joined',
        payload: {
          roomId: room.id,
          participant: {
            userId: USER,
            displayName: 'Nome 1',
            avatarUrl: 'https://cdn/avatar.png',
            role: 'MEMBER',
            isSpeaker: false,
          },
        },
      },
    ]);
    expect(ctx.livekit.removed).toHaveLength(0);
  });

  it('webhook repetido não duplica participante nem evento', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await deliver(ctx, joined(room.id, USER, meta('MEMBER')));
    await deliver(ctx, joined(room.id, USER, meta('MEMBER')));
    expect(ctx.participations.rows).toHaveLength(1);
    expect(ctx.emitter.of('participant:joined')).toHaveLength(1);
  });

  it('membro que conecta FORA da call (token antigo) é derrubado na hora', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx, MOD); // a live existe; USER não está no canal
    await deliver(ctx, joined(room.id, USER, meta('MEMBER')));

    expect(ctx.livekit.removed).toEqual([{ roomName: room.id, identity: USER }]);
    expect(ctx.participations.rows).toHaveLength(0);
    expect(ctx.emitter.of('participant:joined')).toHaveLength(0);
  });

  it('MOD/ADMIN conecta sem estar na call e é aceito', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await deliver(ctx, joined(room.id, MOD, meta('MOD')));
    expect(ctx.livekit.removed).toHaveLength(0);
    expect(ctx.participations.rows[0]).toMatchObject({ userId: MOD, roleAtJoin: 'MOD' });
  });

  it('metadata inválido ou com papel desconhecido vira MEMBER (nunca eleva)', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await deliver(ctx, joined(room.id, USER, 'isso não é json'));
    expect(ctx.participations.rows[0]!.roleAtJoin).toBe('MEMBER');

    const other = '910000000000000009';
    await ctx.live.handle({ userId: other, oldChannelId: null, newChannelId: VOICE_1 });
    await deliver(ctx, joined(room.id, other, JSON.stringify({ role: 'SUPERUSER' })));
    expect(ctx.participations.rows.find((r) => r.userId === other)!.roleAtJoin).toBe('MEMBER');
  });

  it('sala já encerrada: o participante é derrubado', async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await ctx.roomService.endRoom(room.id, 'ENDED_BY_MOD');
    ctx.livekit.removed.length = 0;
    await deliver(ctx, joined(room.id, USER, meta('MEMBER')));
    expect(ctx.livekit.removed).toEqual([{ roomName: room.id, identity: USER }]);
    expect(ctx.participations.rows).toHaveLength(0);
  });

  it('em reunião não exige call', async () => {
    const ctx = buildRoomsApp();
    const m = await ctx.rooms.createMeeting({
      guildId: ctx.env.DISCORD_GUILD_ID,
      title: 'Reunião mensal',
      description: null,
      startsAt: null,
      createdBy: MOD,
      maxParticipants: 100,
      allowedRoleIds: [],
      reminders: [],
      now: ctx.clock.now(),
    });
    await deliver(ctx, joined(m.id, USER, meta('MEMBER')));
    expect(ctx.participations.rows).toHaveLength(1);
    expect(ctx.livekit.removed).toHaveLength(0);
  });
});

describe('participant_left e room_finished', () => {
  const setup = async () => {
    const ctx = buildRoomsApp();
    const room = await openLive(ctx);
    await deliver(ctx, joined(room.id, USER, meta('MEMBER')));
    ctx.emitter.events.length = 0;
    return { ctx, room };
  };

  it('saída pedida pelo cliente -> LEFT', async () => {
    const { ctx, room } = await setup();
    await deliver(ctx, left(room.id, USER, 'client'));
    expect(ctx.participations.rows[0]).toMatchObject({ leaveReason: 'LEFT' });
    expect(ctx.emitter.of('participant:left')[0]!.payload).toEqual({
      roomId: room.id,
      userId: USER,
      reason: 'LEFT',
    });
  });

  it('queda de conexão ou remoção -> DISCONNECTED', async () => {
    const { ctx, room } = await setup();
    await deliver(ctx, left(room.id, USER, 'other'));
    expect(ctx.participations.rows[0]!.leaveReason).toBe('DISCONNECTED');
  });

  it('reconexão (identidade duplicada) NÃO fecha a participação', async () => {
    const { ctx, room } = await setup();
    await deliver(ctx, left(room.id, USER, 'duplicate'));
    expect(ctx.participations.rows[0]!.leftAt).toBeNull();
    expect(ctx.emitter.of('participant:left')).toHaveLength(0);
  });

  it('saída de quem não tinha participação não gera evento', async () => {
    const { ctx, room } = await setup();
    await deliver(ctx, left(room.id, '910000000000000077', 'client'));
    expect(ctx.emitter.of('participant:left')).toHaveLength(0);
  });

  it('webhook de saída duplicado não repete o evento', async () => {
    const { ctx, room } = await setup();
    await deliver(ctx, left(room.id, USER, 'client'));
    await deliver(ctx, left(room.id, USER, 'client'));
    expect(ctx.emitter.of('participant:left')).toHaveLength(1);
  });

  it('room_finished fecha o que sobrou, mas NÃO encerra a live (ela depende do canal de voz)', async () => {
    const { ctx, room } = await setup();
    await deliver(ctx, { event: 'room_finished', roomName: room.id, participant: null });
    expect(ctx.participations.rows[0]!.leftAt).not.toBeNull();
    expect(ctx.emitter.of('participant:left')).toHaveLength(1);
    expect(ctx.rooms.rooms.get(room.id)!.status).toBe('OPEN');
  });
});
