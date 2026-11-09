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
  type MediaSource,
  type LiveKitGateway,
  type TokenRequest,
} from '../../src/modules/livekit/livekit.gateway.js';
import { LiveKitWebhookHandler } from '../../src/modules/livekit/livekit.webhook.js';
import { RoomAccess } from '../../src/modules/rooms/access.js';
import type { BanRepo, RoomBan } from '../../src/modules/rooms/participations.js';
import { HandQueue } from '../../src/modules/moderation/hand-queue.js';
import { ModerationService } from '../../src/modules/moderation/moderation.service.js';
import { SettingsService } from '../../src/modules/settings/settings.service.js';
import { CallsService } from '../../src/modules/rooms/calls.service.js';
import { MediaSessionService } from '../../src/modules/rooms/media-session.js';
import { PresenceService } from '../../src/modules/rooms/presence.js';
import type { RoomsApi } from '../../src/modules/rooms/rooms.routes.js';
import type { RealtimeEmitter } from '../../src/realtime/emitter.js';
import { createSocketServer, type SocketServer } from '../../src/realtime/socket.js';
import { createLogger } from '../../src/shared/logger.js';
import { buildBot, WEB_URL } from './bot-fakes.js';
import { FakeDiscord, MemorySessions, MemoryUsers, ORIGIN } from './fakes.js';

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
  toAdmins(event: string, payload: unknown) {
    this.events.push({ target: 'room', id: 'admins', event, payload });
    this.forward?.toAdmins(event, payload);
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
  permissions: {
    roomName: string;
    identity: string;
    canPublish: boolean;
    sources: MediaSource[];
  }[] = [];
  muted: { roomName: string; identity: string; sources: MediaSource[] }[] = [];
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
    this.people.delete(roomName);
  }
  /** Quem está conectado e o que transmite, por sala (o que `listParticipants` devolve). */
  people = new Map<
    string,
    { identity: string; tracks: { source: MediaSource | 'unknown'; muted: boolean }[] }[]
  >();
  async listParticipants(roomName: string) {
    this.check();
    return structuredClone(this.people.get(roomName) ?? []);
  }
  async setPermissions(
    roomName: string,
    identity: string,
    p: { canPublish: boolean; canPublishSources: MediaSource[] },
  ) {
    this.check();
    this.permissions.push({
      roomName,
      identity,
      canPublish: p.canPublish,
      sources: p.canPublishSources,
    });
  }
  async muteSources(roomName: string, identity: string, sources: MediaSource[]) {
    this.check();
    this.muted.push({ roomName, identity, sources });
  }
  async verifyWebhook(rawBody: string, authHeader: string | undefined): Promise<LiveKitEvent> {
    if (authHeader !== 'assinado') throw new InvalidWebhookError('assinatura');
    const event = this.events.get(rawBody);
    if (!event) throw new InvalidWebhookError('corpo desconhecido');
    return event;
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
  const participations = bot.participations;
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
  // Sessão de mídia das lives (ativa/em espera), com o mesmo relógio e agendador.
  const media = new MediaSessionService({
    rooms: bot.rooms,
    participations,
    livekit,
    realtime: emitter,
    settings: bot.settings,
    audit: bot.audit,
    scheduler: bot.scheduler,
    logger,
    guildId: env.DISCORD_GUILD_ID,
    now: bot.clock.now,
  });
  bot.roomService.onEnded((room) => media.forget(room.id));
  media.setOnChange((room) => bot.announcer.scheduleRefresh(room.id));
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
    sessions: media,
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
    audit: bot.audit,
    guildId: env.DISCORD_GUILD_ID,
    webUrl: WEB_URL,
  };

  // A moderação consulta os cargos do alvo no Discord: usamos os membros do login falso.
  bot.gateway.getMemberRoleIds = async (id: string) => discord.members.get(id)?.roles ?? [];

  const roomChanges: string[] = [];
  const hands = new HandQueue({ participations, realtime: emitter, now: bot.clock.now });
  const moderation = new ModerationService({
    hands,
    rooms: bot.rooms,
    participations,
    bans,
    livekit,
    presence,
    realtime: emitter,
    audit: bot.audit,
    roles: bot.roles,
    onRoomChanged: async (room) => {
      roomChanges.push(room.id);
    },
    logger,
    now: bot.clock.now,
  });
  const settingsService = new SettingsService({
    settings: bot.settings,
    gateway: bot.gateway,
    audit: bot.audit,
    realtime: emitter,
    guildId: env.DISCORD_GUILD_ID,
  });

  const app = createApp(env, logger, {
    auth,
    rooms: roomsApi,
    moderation: { moderation, access, participations, hands, webUrl: WEB_URL },
    admin: {
      settings: settingsService,
      audit: bot.audit,
      calls: new CallsService({
        gateway: bot.gateway,
        settings: bot.settings,
        cache: bot.cache,
        rooms: bot.rooms,
        guildId: env.DISCORD_GUILD_ID,
      }),
    },
    meetings: { meetings: bot.meetings, participations, webUrl: WEB_URL },
  });

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
    media,
    hands,
    access,
    webhook,
    roomsApi,
    moderation,
    settingsService,
    roomChanges,
    listen,
    sendWebhook,
    origin: ORIGIN,
  };
}

export type RoomsCtx = ReturnType<typeof buildRoomsApp>;

export function connectSocket(
  url: string,
  cookie: string,
  headers: Record<string, string> = {},
): Socket {
  return connectClient(url, {
    path: '/socket.io',
    transports: ['websocket'],
    extraHeaders: { cookie, ...headers },
    forceNew: true,
    reconnection: false,
  });
}

/** Reunião aberta agora (moderação só existe em reuniões). */
export async function openMeeting(ctx: RoomsCtx, title = 'Reunião mensal') {
  ctx.configureLives();
  const { room } = await ctx.meetings.create(
    { id: '900000000000000000', via: 'api', role: 'ADMIN' },
    { title, description: null, startsAt: null, announce: false },
  );
  return room;
}
