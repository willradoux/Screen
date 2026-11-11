import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { ROLE_RANK, type Role } from '@screem/shared';
import type { Env } from '../config/env.js';
import { readCookie, SESSION_COOKIE } from '../modules/auth/auth.middleware.js';
import type { AuthService } from '../modules/auth/auth.service.js';
import type { SessionRecord } from '../modules/auth/auth.types.js';
import type { RoomAccess } from '../modules/rooms/access.js';
import { toParticipantDto, toRoomDto } from '../modules/rooms/dto.js';
import type { ParticipationRepo } from '../modules/rooms/participations.js';
import type { RoomRepo } from '../modules/rooms/rooms.types.js';
import { AppError } from '../shared/errors.js';
import { metrics } from '../observability/metrics.js';
import type { Logger } from '../shared/logger.js';
import { ChatState, registerChat } from './chat.js';
import type { RealtimeEmitter } from './emitter.js';

export interface SocketDeps {
  httpServer: HttpServer;
  env: Env;
  auth: AuthService;
  rooms: RoomRepo;
  participations: ParticipationRepo;
  access: RoomAccess;
  logger: Logger;
}

interface SocketData {
  userId: string;
  role: Role;
  session: SessionRecord;
}

type Ack = (response: unknown) => void;

const MAX_SOCKETS_PER_USER = 3;
const MAX_PAYLOAD_BYTES = 16 * 1024;
/** Assinaturas de sala por socket: cada uma consulta o banco, então têm teto. */
const SUBSCRIBES_PER_MINUTE = 30;
const roomPayload = z.object({ roomId: z.string().regex(/^[\w-]{22}$/) });
/** Legenda ao vivo: o navegador de quem fala transcreve e manda o texto; o servidor só repassa. */
const captionPayload = z.object({
  roomId: z.string().regex(/^[\w-]{22}$/),
  text: z.string().trim().min(1).max(300),
  final: z.boolean().default(false),
});
const CAPTIONS_PER_10S = 30;

const fail = (code: string, message: string) => ({ ok: false, error: { code, message } });

export interface SocketServer extends RealtimeEmitter {
  io: Server;
  /** Derruba os sockets de uma sessão (logout) ou de um usuário (bloqueio, saída do servidor). */
  revoke(target: { sessionId?: string; userId?: string }): void;
  close(): Promise<void>;
}

/**
 * Servidor Socket.IO: estado e avisos de controle. A mídia NÃO passa por aqui.
 * Ver docs/backend/eventos-socketio.md.
 */
export function createSocketServer(deps: SocketDeps): SocketServer {
  const { env, auth, logger } = deps;
  const io = new Server(deps.httpServer, {
    path: '/socket.io',
    cors: { origin: env.corsOrigins, credentials: true },
    maxHttpBufferSize: MAX_PAYLOAD_BYTES,
    // WebSocket não passa pelo CORS do navegador: sem isto, qualquer site poderia abrir uma
    // conexão em nome de quem está logado. Navegadores sempre mandam `Origin`; clientes
    // que não são navegadores não carregam cookie de ninguém, então sem `Origin` passa.
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || env.corsOrigins.includes(origin));
    },
  });

  const connections = new Map<string, number>();
  const data = (socket: Socket) => socket.data as SocketData;
  // Chat e enquetes (em memória; some quando a sala fecha).
  const chat = new ChatState();

  // Autenticação no handshake, pelo mesmo cookie de sessão da API.
  io.use(async (socket, next) => {
    try {
      const raw = readCookie(socket.handshake.headers.cookie, SESSION_COOKIE);
      const session = raw ? await auth.loadSession(raw) : null;
      if (!session) return next(new Error('UNAUTHENTICATED'));

      const identity = await auth.getIdentity(session);
      if ((connections.get(identity.user.id) ?? 0) >= MAX_SOCKETS_PER_USER) {
        return next(new Error('TOO_MANY_CONNECTIONS'));
      }
      socket.data = { userId: identity.user.id, role: identity.role, session } satisfies SocketData;
      next();
    } catch (err) {
      next(new Error(err instanceof AppError ? err.code : 'UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    const { userId, role } = data(socket);
    connections.set(userId, (connections.get(userId) ?? 0) + 1);
    metrics.socketConnections.inc();
    const subscribeTimes: number[] = [];
    void socket.join(`user:${userId}`);
    if (role === 'ADMIN') void socket.join('admins');
    registerChat({
      io,
      socket,
      userId,
      role: () => data(socket).role,
      participations: deps.participations,
      rooms: deps.rooms,
      state: chat,
      logger,
    });

    socket.on('disconnect', () => {
      metrics.socketConnections.dec();
      const left = (connections.get(userId) ?? 1) - 1;
      if (left <= 0) connections.delete(userId);
      else connections.set(userId, left);
    });

    // Entrar nas notificações de uma sala. Exige poder entrar nela (ou ser MOD+).
    socket.on('room:subscribe', async (payload: unknown, ack?: Ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        const now = Date.now();
        while (subscribeTimes.length > 0 && now - subscribeTimes[0]! > 60_000)
          subscribeTimes.shift();
        if (subscribeTimes.length >= SUBSCRIBES_PER_MINUTE) {
          return reply(fail('RATE_LIMITED', 'Muitas tentativas. Aguarde um instante.'));
        }
        subscribeTimes.push(now);

        const parsed = roomPayload.safeParse(payload);
        if (!parsed.success) return reply(fail('VALIDATION_ERROR', 'roomId inválido.'));

        const room = await deps.rooms.findById(parsed.data.roomId);
        if (!room) return reply(fail('ROOM_NOT_FOUND', 'Sala não encontrada.'));

        // Papel e acesso são recalculados agora (o papel pode ter mudado desde a conexão).
        const identity = await auth.getIdentity(data(socket).session);
        const staff = ROLE_RANK[identity.role] >= ROLE_RANK.MOD;
        const open = await deps.participations.findOpen(room.id, identity.user.id);
        if (!staff && !open && !(await deps.access.evaluate(room, identity)).canJoin) {
          return reply(fail('FORBIDDEN', 'Você não tem acesso a esta sala.'));
        }

        await socket.join(`room:${room.id}`);
        // O papel pode ter mudado desde a conexão: o chat usa o mais novo.
        data(socket).role = identity.role;
        const participants = await deps.participations.listOpen(room.id);
        reply({
          ok: true,
          data: {
            room: toRoomDto(room, participants.length, env.WEB_URL),
            participants: participants.map((p) => toParticipantDto(p, room)),
            // Quem entra no meio já vê a enquete do topo; a moderação vê as sugestões.
            poll: chat.active(room.id),
            ...(staff ? { pendingPolls: chat.pending(room.id) } : {}),
          },
        });
      } catch (err) {
        if (err instanceof AppError) return reply(fail(err.code, err.message));
        logger.error({ err }, 'falha em room:subscribe');
        reply(fail('INTERNAL_ERROR', 'Erro interno.'));
      }
    });

    const captionTimes: number[] = [];
    socket.on('caption:send', async (payload: unknown, ack?: Ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        const now = Date.now();
        while (captionTimes.length > 0 && now - captionTimes[0]! > 10_000) captionTimes.shift();
        if (captionTimes.length >= CAPTIONS_PER_10S) {
          return reply(fail('RATE_LIMITED', 'Muitas legendas seguidas. Aguarde um instante.'));
        }
        captionTimes.push(now);

        const parsed = captionPayload.safeParse(payload);
        if (!parsed.success) return reply(fail('VALIDATION_ERROR', 'Legenda inválida.'));
        const { roomId, text, final } = parsed.data;

        // Só quem acompanha a sala E está conectado nela pode legendar.
        if (!socket.rooms.has(`room:${roomId}`)) {
          return reply(fail('FORBIDDEN', 'Acompanhe a sala antes de enviar legendas.'));
        }
        const me = await deps.participations.findOpen(roomId, userId);
        if (!me) return reply(fail('PARTICIPANT_NOT_IN_ROOM', 'Você não está conectado à sala.'));

        io.to(`room:${roomId}`).emit('caption', {
          roomId,
          userId,
          displayName: me.displayName,
          text,
          final,
        });
        reply({ ok: true });
      } catch (err) {
        logger.error({ err }, 'falha em caption:send');
        reply(fail('INTERNAL_ERROR', 'Erro interno.'));
      }
    });

    socket.on('room:unsubscribe', async (payload: unknown, ack?: Ack) => {
      const parsed = roomPayload.safeParse(payload);
      if (parsed.success) await socket.leave(`room:${parsed.data.roomId}`);
      if (typeof ack === 'function') ack({ ok: true });
    });
  });

  return {
    io,
    toRoom: (roomId, event, payload) => {
      io.to(`room:${roomId}`).emit(event, payload);
      if (event === 'room:ended') chat.forget(roomId);
    },
    toUser: (userId, event, payload) => void io.to(`user:${userId}`).emit(event, payload),
    toAdmins: (event, payload) => void io.to('admins').emit(event, payload),
    revoke({ sessionId, userId }) {
      for (const socket of io.sockets.sockets.values()) {
        const d = data(socket);
        if ((sessionId && d.session.id === sessionId) || (userId && d.userId === userId)) {
          socket.emit('session:revoked', {});
          socket.disconnect(true);
        }
      }
    },
    close: () => io.close().then(() => undefined),
  };
}
