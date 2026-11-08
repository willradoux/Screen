import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as connectClient, type Socket } from 'socket.io-client';
import { createApp } from '../../src/app.js';
import { loadEnv, type Env } from '../../src/config/env.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import {
  InvalidWebhookError,
  LiveKitUnavailableError,
  type LiveKitEvent,
  type LiveKitGateway,
  type TokenRequest,
} from '../../src/modules/livekit/livekit.gateway.js';
import { LiveKitWebhookHandler } from '../../src/modules/livekit/livekit.webhook.js';
import { RoomAccess } from '../../src/modules/rooms/access.js';
import type {
  BanRepo,
  LeaveReason,
  Participation,
  ParticipationRepo,
  RoomBan,
} from '../../src/modules/rooms/participations.js';
import { PresenceService } from '../../src/modules/rooms/presence.js';
import type { RoomsApi } from '../../src/modules/rooms/rooms.routes.js';
import type { RealtimeEmitter } from '../../src/realtime/emitter.js';
import { createSocketServer, type SocketServer } from '../../src/realtime/socket.js';
import { createLogger } from '../../src/shared/logger.js';
import { buildBot, WEB_URL } from './bot-fakes.js';
import { FakeDiscord, MemorySessions, MemoryUsers, ORIGIN } from './fakes.js';
import type { Role } from '@screem/shared';

export class RecordingEmitter implements RealtimeEmitter {
  events: { target: 'room' | 'user'; id: string; event: string; payload: unknown }[] = [];
  /** Quando há um servidor Socket.IO real no teste, repassa para ele. */
  forward?: RealtimeEmitter;
  toRoom(id: string, event: string, payload: unknown) {
    this.events.push({ target: 'room', id, event, payload });
    this.forward?.toRoom(id, event, payload);
  }
  toUser(id: string, event: string, payload: unknown) {
    this.events.push({ target: 'user', id, event, payload });
    this.forward?.toUser(id, event, payload);
  }
  of(event: string) {
    return this.events.filter((e) => e.event === event);
  }
}

export class FakeLiveKit implements LiveKitGateway {
  tokens: TokenRequest[] = [];
  ensured: { roomName: string; max: number }[] = [];
  removed: { roomName: string; identity: string }[] = [];
  deleted: string[] = [];
  down = false;
  /** Fila de eventos que `verifyWebhook` devolve, indexada pelo corpo enviado. */
  events = new Map<string, LiveKitEvent>();

  private check() {
    if (this.down) throw new LiveKitUnavailableError('LiveKit fora do ar');
  }
  async createToken(req: TokenRequest) {
    this.check();
    this.tokens.push(req);
    return `token-${this.tokens.length}`;
  }
  async ensureRoom(roomName: string, max: number) {
    this.check();
    this.ensured.push({ roomName, max });
  }
  async removeParticipant(roomName: string, identity: string) {
    this.removed.push({ roomName, identity });
  }
  async deleteRoom(roomName: string) {
    this.deleted.push(roomName);
  }
  async verifyWebhook(rawBody: string, authHeader: string | undefined): Promise<LiveKitEvent> {
    if (authHeader !== 'assinado') throw new InvalidWebhookError('assinatura');
    const event = this.events.get(rawBody);
    if (!event) throw new InvalidWebhookError('corpo desconhecido');
    return event;
  }
}

export class MemoryParticipations implements ParticipationRepo {
  rows: Participation[] = [];

  async open(input: {
    roomId: string;
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    role: Role;
    at: Date;
  }) {
    const existing = await this.findOpen(input.roomId, input.userId);
    if (existing) return { participation: existing, created: false };
    const row: Participation = {
      roomId: input.roomId,
      userId: input.userId,
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      roleAtJoin: input.role,
      joinedAt: input.at,
      leftAt: null,
      leaveReason: null,
      mutedByModeration: false,
    };
    this.rows.push(row);
    return { participation: { ...row }, created: true };
  }
  async close(roomId: string, userId: string, reason: LeaveReason, at: Date) {
    const row = this.rows.find((r) => r.roomId === roomId && r.userId === userId && !r.leftAt);
    if (!row) return null;
    row.leftAt = at;
    row.leaveReason = reason;
    return { ...row };
  }
  async closeAll(roomId: string, reason: LeaveReason, at: Date) {
    const open = this.rows.filter((r) => r.roomId === roomId && !r.leftAt);
    for (const r of open) {
      r.leftAt = at;
      r.leaveReason = reason;
    }
    return open.map((r) => ({ ...r }));
  }
  async findOpen(roomId: string, userId: string) {
    const row = this.rows.find((r) => r.roomId === roomId && r.userId === userId && !r.leftAt);
    return row ? { ...row } : null;
  }
  async listOpen(roomId: string) {
    return this.rows.filter((r) => r.roomId === roomId && !r.leftAt).map((r) => ({ ...r }));
  }
  async countOpen(roomId: string) {
    return this.rows.filter((r) => r.roomId === roomId && !r.leftAt).length;
  }
  async setMutedByModeration(roomId: string, userId: string, muted: boolean) {
    const row = this.rows.find((r) => r.roomId === roomId && r.userId === userId && !r.leftAt);
    if (row) row.mutedByModeration = muted;
  }
}

export class MemoryBans implements BanRepo {
  bans: RoomBan[] = [];
  async find(roomId: string, userId: string, now: Date) {
    return (
      this.bans.find(
        (b) =>
          b.roomId === roomId &&
          b.userId === userId &&
          (!b.expiresAt || b.expiresAt.getTime() > now.getTime()),
      ) ?? null
    );
  }
  async upsert(ban: RoomBan) {
    this.bans = this.bans.filter((b) => !(b.roomId === ban.roomId && b.userId === ban.userId));
    this.bans.push(ban);
  }
  async remove(roomId: string, userId: string) {
    this.bans = this.bans.filter((b) => !(b.roomId === roomId && b.userId === userId));
  }
}

/**
 * Sistema completo com dublês: login (Discord falso), bot (gateway falso),
 * salas, LiveKit falso e emissor de eventos que grava o que foi enviado.
 */
export function buildRoomsApp(opts: { graceSeconds?: number } = {}) {
  const bot = buildBot();
  bot.configureLives();
  if (opts.graceSeconds !== undefined) bot.settings.settings.graceSeconds = opts.graceSeconds;

  const env: Env = loadEnv({ NODE_ENV: 'test' });
  const logger = createLogger(env);
  const discord = new FakeDiscord();
  const users = new MemoryUsers();
  const sessions = new MemorySessions();
  const livekit = new FakeLiveKit();
  const participations = new MemoryParticipations();
  const bans = new MemoryBans();
  const emitter = new RecordingEmitter();
  let socketServer: SocketServer | undefined;

  const auth = new AuthService({
    env,
    discord,
    users,
    sessions,
    settings: bot.settings,
    now: bot.clock.now,
    guildPermissions: bot.gateway,
    onSessionRevoked: (target) => socketServer?.revoke(target),
  });

  // Presença com o MESMO relógio/agendador/cache do bot.
  const presence = new PresenceService({
    participations,
    livekit,
    realtime: emitter,
    settings: bot.settings,
    cache: bot.cache,
    scheduler: bot.scheduler,
    logger,
    guildId: env.DISCORD_GUILD_ID,
    now: bot.clock.now,
  });
  bot.roomService.onEnded((room, reason) => presence.onRoomEnded(room, reason));
  // Liga a presença ao tratador de voz do bot.
  (bot.live as unknown as { deps: { presence: PresenceService } }).deps.presence = presence;

  const access = new RoomAccess({
    participations,
    bans,
    cache: bot.cache,
    gateway: bot.gateway,
    livekit,
    livekitPublicUrl: env.LIVEKIT_PUBLIC_URL,
    tokenTtlSeconds: env.JOIN_TOKEN_TTL_SECONDS,
    now: bot.clock.now,
  });

  const webhook = new LiveKitWebhookHandler({
    livekit,
    rooms: bot.rooms,
    participations,
    presence,
    realtime: emitter,
    cache: bot.cache,
    logger,
    now: bot.clock.now,
  });

  const roomsApi: RoomsApi = {
    rooms: bot.rooms,
    participations,
    access,
    presence,
    roomService: bot.roomService,
    webhook,
    guildId: env.DISCORD_GUILD_ID,
    webUrl: WEB_URL,
  };

  const app = createApp(env, logger, { auth, rooms: roomsApi });

  /** Sobe um servidor HTTP + Socket.IO de verdade numa porta livre. */
  const listen = async () => {
    const server: Server = createServer(app);
    socketServer = createSocketServer({
      httpServer: server,
      env,
      auth,
      rooms: bot.rooms,
      participations,
      access,
      logger,
    });
    emitter.forward = socketServer;
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    return {
      url: `http://localhost:${port}`,
      sockets: socketServer,
      close: async () => {
        await socketServer?.close();
        emitter.forward = undefined;
      },
    };
  };

  /** Envia um webhook assinado ao LiveKit falso e processa. */
  let counter = 0;
  const sendWebhook = (event: LiveKitEvent, signed = true) => {
    const body = `evento-${++counter}`;
    livekit.events.set(body, event);
    return { body, auth: signed ? 'assinado' : 'forjado' };
  };

  return {
    ...bot,
    env,
    logger,
    app,
    auth,
    discord,
    users,
    sessions,
    livekit,
    participations,
    bans,
    emitter,
    presence,
    access,
    webhook,
    roomsApi,
    listen,
    sendWebhook,
    origin: ORIGIN,
  };
}

export type RoomsCtx = ReturnType<typeof buildRoomsApp>;

export function connectSocket(url: string, cookie: string): Socket {
  return connectClient(url, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie },
    forceNew: true,
    reconnection: false,
  });
}
