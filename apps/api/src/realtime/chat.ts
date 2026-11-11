import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { ROLE_RANK, type Role } from '@screem/shared';
import type { ParticipationRepo } from '../modules/rooms/participations.js';
import type { RoomRepo } from '../modules/rooms/rooms.types.js';
import type { Logger } from '../shared/logger.js';

/*
 * Chat e enquete da sala, pelo Socket.IO (docs/backend/eventos-socketio.md).
 *
 * O servidor só confere e repassa: nada vai para o banco. O histórico do chat fica no navegador
 * de cada um (e some quando a sala fecha); a enquete ativa fica na memória enquanto a sala está
 * aberta, para quem entra no meio já ver. Com 500 pessoas, uma mensagem de texto é bem mais leve
 * que um único quadro de vídeo.
 */

const roomId = z.string().regex(/^[\w-]{22}$/);
const chatSend = z.object({ roomId, text: z.string().trim().min(1).max(500) });
const chatDelete = z.object({ roomId, id: z.string().min(1).max(64) });
const pollPropose = z.object({
  roomId,
  question: z.string().trim().min(1).max(200),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(5),
});
const pollRef = z.object({ roomId, pollId: z.string().min(1).max(64) });
const pollVote = pollRef.extend({ option: z.number().int().min(0).max(4) });
const typing = z.object({ roomId });

/** "Fulano está digitando": no máximo um aviso a cada 1,5 s por pessoa. */
export const TYPING_EVERY_MS = 1_500;
/** O resumo de quem digita sai no máximo 1 vez por segundo por sala (não 1 por pessoa). */
export const TYPING_FLUSH_MS = 1_000;
/** Quem não avisa há 3 s parou de digitar. */
const TYPING_TTL_MS = 3_000;
/**
 * Modo lento da sala inteira (como no YouTube): no máximo 10 mensagens por segundo, com folga
 * de 20 de uma vez. Com 500 pessoas, cada mensagem vira 500 entregas: isso segura a VPS.
 */
export const ROOM_MSGS_PER_SEC = 10;
const ROOM_MSG_BURST = 20;
/** Os mapas de "última mensagem" são limpos quando passam disto (memória não cresce sem fim). */
const PRUNE_ABOVE = 5_000;

/** Uma mensagem a cada 3 s por pessoa (contra spam), valendo para todas as abas dela. */
export const CHAT_COOLDOWN_MS = 3_000;
/** No modo live, a plateia (quem não está no palco nem é da moderação) espera 5 s. */
export const AUDIENCE_COOLDOWN_MS = 5_000;
/** Sugerir enquete: uma a cada 30 s por pessoa. */
export const POLL_PROPOSE_COOLDOWN_MS = 30_000;
/** Enquetes esperando o admin, por sala (as mais antigas saem). */
const MAX_PENDING = 10;
/** Votos chegam juntos em sala cheia: o placar sai no máximo a cada 0,5 s. */
const VOTE_BROADCAST_MS = 500;

type Ack = (response: unknown) => void;
const fail = (code: string, message: string) => ({ ok: false, error: { code, message } });

interface Poll {
  id: string;
  question: string;
  options: string[];
  votes: Map<string, number>;
  proposedBy: string;
  status: 'pending' | 'open' | 'closed';
}

export interface PollDto {
  id: string;
  question: string;
  options: { text: string; votes: number }[];
  total: number;
  status: Poll['status'];
  proposedBy: string;
}

const toDto = (p: Poll): PollDto => {
  const counts = p.options.map(() => 0);
  for (const option of p.votes.values()) counts[option] = (counts[option] ?? 0) + 1;
  return {
    id: p.id,
    question: p.question,
    options: p.options.map((text, i) => ({ text, votes: counts[i] ?? 0 })),
    total: p.votes.size,
    status: p.status,
    proposedBy: p.proposedBy,
  };
};

/** Estado do chat e das enquetes de todas as salas (em memória). */
export class ChatState {
  private rooms = new Map<
    string,
    { active: Poll | null; pending: Poll[]; timer?: ReturnType<typeof setTimeout> }
  >();
  readonly lastMessage = new Map<string, number>();
  readonly lastProposal = new Map<string, number>();
  /** Balde de mensagens por sala (modo lento). */
  private buckets = new Map<string, { tokens: number; at: number }>();
  /** Quem está digitando, por sala, e o resumo agendado. */
  private typing = new Map<
    string,
    { who: Map<string, { name: string; until: number }>; timer?: ReturnType<typeof setTimeout> }
  >();

  /** A sala ainda aceita mensagem agora? (gasta uma ficha do balde) */
  takeRoomSlot(roomId: string, t: number): boolean {
    const b = this.buckets.get(roomId) ?? { tokens: ROOM_MSG_BURST, at: t };
    b.tokens = Math.min(ROOM_MSG_BURST, b.tokens + ((t - b.at) / 1000) * ROOM_MSGS_PER_SEC);
    b.at = t;
    this.buckets.set(roomId, b);
    if (b.tokens < 1) return false;
    b.tokens -= 1;
    return true;
  }

  /** Marca que alguém digita; devolve true se é preciso agendar o resumo da sala. */
  markTyping(roomId: string, userId: string, name: string, t: number): boolean {
    let r = this.typing.get(roomId);
    if (!r) {
      r = { who: new Map() };
      this.typing.set(roomId, r);
    }
    r.who.set(userId, { name, until: t + TYPING_TTL_MS });
    return r.timer === undefined;
  }

  stopTyping(roomId: string, userId: string): void {
    this.typing.get(roomId)?.who.delete(userId);
  }

  setTypingTimer(roomId: string, timer: ReturnType<typeof setTimeout> | undefined): void {
    const r = this.typing.get(roomId);
    if (r) r.timer = timer;
  }

  /** Resumo atual: até 3 nomes (com o id, para cada um não ver o próprio) e quantos ao todo. */
  typingSummary(roomId: string, t: number) {
    const r = this.typing.get(roomId);
    if (!r) return { people: [], count: 0 };
    for (const [id, v] of r.who) if (v.until <= t) r.who.delete(id);
    const people = [...r.who].slice(0, 4).map(([userId, v]) => ({ userId, name: v.name }));
    return { people, count: r.who.size };
  }

  /** Limpa os mapas de tempo quando crescem demais (só guarda os recentes). */
  prune(t: number): void {
    for (const [map, keep] of [
      [this.lastMessage, 60_000],
      [this.lastProposal, POLL_PROPOSE_COOLDOWN_MS],
    ] as const) {
      if (map.size <= PRUNE_ABOVE) continue;
      for (const [k, v] of map) if (t - v > keep) map.delete(k);
    }
  }

  room(id: string) {
    let r = this.rooms.get(id);
    if (!r) {
      r = { active: null, pending: [] };
      this.rooms.set(id, r);
    }
    return r;
  }

  active(roomId: string): PollDto | null {
    const p = this.rooms.get(roomId)?.active;
    return p ? toDto(p) : null;
  }

  pending(roomId: string): PollDto[] {
    return (this.rooms.get(roomId)?.pending ?? []).map(toDto);
  }

  /** A sala fechou: some tudo. */
  forget(roomId: string): void {
    const r = this.rooms.get(roomId);
    if (r?.timer) clearTimeout(r.timer);
    this.rooms.delete(roomId);
    const ty = this.typing.get(roomId);
    if (ty?.timer) clearTimeout(ty.timer);
    this.typing.delete(roomId);
    this.buckets.delete(roomId);
  }
}

export interface ChatDeps {
  io: Server;
  socket: Socket;
  userId: string;
  role: () => Role;
  participations: ParticipationRepo;
  rooms: Pick<RoomRepo, 'findById'>;
  state: ChatState;
  logger: Logger;
  now?: () => number;
}

const isStaff = (role: Role) => ROLE_RANK[role] >= ROLE_RANK.MOD;

/** Liga os eventos de chat e enquete num socket já autenticado. */
export function registerChat(deps: ChatDeps): void {
  const { io, socket, userId, participations, state, logger } = deps;
  // Nome de quem digita, guardado por sala (o aviso de digitando não consulta o banco toda vez).
  const names = new Map<string, string>();
  let lastTyping = 0;
  const now = deps.now ?? Date.now;
  const room = (id: string) => `room:${id}`;

  /** Manda a lista de enquetes pendentes só para a moderação da sala. */
  const sendPendingToStaff = async (roomId: string) => {
    const list = state.pending(roomId);
    for (const s of await io.in(room(roomId)).fetchSockets()) {
      const r = (s.data as { role?: Role }).role;
      if (r && isStaff(r)) s.emit('poll:pending', { roomId, polls: list });
    }
  };

  const broadcastPoll = (roomId: string) =>
    io.to(room(roomId)).emit('poll:state', { roomId, poll: state.active(roomId) });

  /** Confere: está acompanhando a sala e conectado nela. Devolve a participação. */
  const inRoom = async (roomId: string, reply: Ack) => {
    if (!socket.rooms.has(room(roomId))) {
      reply(fail('FORBIDDEN', 'Acompanhe a sala antes.'));
      return null;
    }
    const me = await participations.findOpen(roomId, userId);
    if (!me) {
      reply(fail('PARTICIPANT_NOT_IN_ROOM', 'Você não está conectado à sala.'));
      return null;
    }
    return me;
  };

  const handler =
    <T>(schema: z.ZodType<T>, name: string, fn: (input: T, reply: Ack) => Promise<void>) =>
    async (payload: unknown, ack?: Ack) => {
      const reply = typeof ack === 'function' ? ack : () => undefined;
      try {
        const parsed = schema.safeParse(payload);
        if (!parsed.success) return reply(fail('VALIDATION_ERROR', 'Dados inválidos.'));
        await fn(parsed.data, reply);
      } catch (err) {
        logger.error({ err }, `falha em ${name}`);
        reply(fail('INTERNAL_ERROR', 'Erro interno.'));
      }
    };

  // Mensagem: 1 a cada 3 s por pessoa; quem foi silenciado pela moderação não escreve.
  socket.on(
    'chat:send',
    handler(chatSend, 'chat:send', async ({ roomId, text }, reply) => {
      const t = now();
      // Plateia no modo live: 5 s entre mensagens; palco e moderação: 3 s.
      const r = await deps.rooms.findById(roomId);
      const audience =
        Boolean(r?.lectureMode) && !r?.speakerIds.includes(userId) && !isStaff(deps.role());
      const cooldown = audience ? AUDIENCE_COOLDOWN_MS : CHAT_COOLDOWN_MS;
      const last = state.lastMessage.get(userId) ?? 0;
      if (t - last < cooldown) {
        return reply({
          ...fail('RATE_LIMITED', 'Espere um pouco antes de mandar outra mensagem.'),
          retryInMs: cooldown - (t - last),
        });
      }
      const me = await inRoom(roomId, reply);
      if (!me) return;
      if (me.mutedByModeration) {
        return reply(fail('MUTED', 'A moderação silenciou você nesta sala.'));
      }
      if (!state.takeRoomSlot(roomId, t)) {
        return reply({
          ...fail('ROOM_BUSY', 'O chat está muito movimentado. Tente de novo em instantes.'),
          retryInMs: 1_000,
        });
      }
      state.lastMessage.set(userId, t);
      state.stopTyping(roomId, userId);
      state.prune(t);
      const message = {
        roomId,
        id: randomUUID(),
        userId,
        displayName: me.displayName,
        avatarUrl: me.avatarUrl,
        role: deps.role(),
        text,
        at: new Date(t).toISOString(),
      };
      io.to(room(roomId)).emit('chat:message', message);
      reply({ ok: true, data: { id: message.id, cooldownMs: cooldown } });
    }),
  );

  // Digitando: avisa os outros da sala (não quem digita). Só repassa, nada é guardado.
  socket.on('chat:typing', async (payload: unknown) => {
    try {
      const parsed = typing.safeParse(payload);
      if (!parsed.success) return;
      const { roomId } = parsed.data;
      const t = now();
      if (t - lastTyping < TYPING_EVERY_MS || !socket.rooms.has(room(roomId))) return;
      lastTyping = t;
      let name = names.get(roomId);
      if (!name) {
        const me = await participations.findOpen(roomId, userId);
        if (!me || me.mutedByModeration) return;
        name = me.displayName;
        names.set(roomId, name);
      }
      // Junta todo mundo que digita na sala num resumo (1 por segundo, no máximo).
      if (state.markTyping(roomId, userId, name, t)) {
        state.setTypingTimer(
          roomId,
          setTimeout(() => {
            state.setTypingTimer(roomId, undefined);
            io.to(room(roomId)).emit('chat:typing', {
              roomId,
              ...state.typingSummary(roomId, now()),
            });
          }, TYPING_FLUSH_MS),
        );
      }
    } catch (err) {
      logger.error({ err }, 'falha em chat:typing');
    }
  });

  // Enquete só existe no modo live (reunião com o palco ligado: apresentador e plateia).
  const pollsAllowed = async (roomId: string, reply: Ack) => {
    const r = await deps.rooms.findById(roomId);
    if (!r?.lectureMode) {
      reply(fail('POLLS_DISABLED', 'Enquete só existe no modo live (com o palco ligado).'));
      return false;
    }
    return true;
  };

  // Apagar mensagem: só a moderação (some da tela de todos).
  socket.on(
    'chat:delete',
    handler(chatDelete, 'chat:delete', async ({ roomId, id }, reply) => {
      if (!isStaff(deps.role())) return reply(fail('FORBIDDEN', 'Só a moderação apaga.'));
      if (!socket.rooms.has(room(roomId))) return reply(fail('FORBIDDEN', 'Acompanhe a sala.'));
      io.to(room(roomId)).emit('chat:deleted', { roomId, id });
      reply({ ok: true });
    }),
  );

  // Sugerir enquete: qualquer um sugere; a moderação aceita. Se quem sugere é da moderação,
  // a enquete já abre.
  socket.on(
    'poll:propose',
    handler(pollPropose, 'poll:propose', async ({ roomId, question, options }, reply) => {
      const me = await inRoom(roomId, reply);
      if (!me) return;
      if (!(await pollsAllowed(roomId, reply))) return;
      const staff = isStaff(deps.role());
      const t = now();
      if (!staff && t - (state.lastProposal.get(userId) ?? 0) < POLL_PROPOSE_COOLDOWN_MS) {
        return reply(fail('RATE_LIMITED', 'Espere um pouco antes de sugerir outra enquete.'));
      }
      state.lastProposal.set(userId, t);
      const poll: Poll = {
        id: randomUUID(),
        question,
        options,
        votes: new Map(),
        proposedBy: me.displayName,
        status: staff ? 'open' : 'pending',
      };
      const r = state.room(roomId);
      if (staff) {
        r.active = poll;
        broadcastPoll(roomId);
      } else {
        r.pending = [...r.pending, poll].slice(-MAX_PENDING);
        await sendPendingToStaff(roomId);
      }
      reply({ ok: true, data: { id: poll.id, status: poll.status } });
    }),
  );

  // Aceitar ou recusar uma sugestão (moderação).
  const decide = (accept: boolean) =>
    handler(pollRef, accept ? 'poll:approve' : 'poll:reject', async ({ roomId, pollId }, reply) => {
      if (!isStaff(deps.role())) return reply(fail('FORBIDDEN', 'Só a moderação decide.'));
      if (!socket.rooms.has(room(roomId))) return reply(fail('FORBIDDEN', 'Acompanhe a sala.'));
      const r = state.room(roomId);
      const poll = r.pending.find((p) => p.id === pollId);
      if (!poll) return reply(fail('NOT_FOUND', 'Essa sugestão não existe mais.'));
      r.pending = r.pending.filter((p) => p !== poll);
      if (accept) {
        poll.status = 'open';
        r.active = poll;
        broadcastPoll(roomId);
      }
      await sendPendingToStaff(roomId);
      reply({ ok: true });
    });
  socket.on('poll:approve', decide(true));
  socket.on('poll:reject', decide(false));

  // Votar: um voto por pessoa; o placar sai agrupado (no máximo a cada 0,5 s).
  socket.on(
    'poll:vote',
    handler(pollVote, 'poll:vote', async ({ roomId, pollId, option }, reply) => {
      const me = await inRoom(roomId, reply);
      if (!me) return;
      const r = state.room(roomId);
      const poll = r.active;
      if (!poll || poll.id !== pollId || poll.status !== 'open') {
        return reply(fail('NOT_FOUND', 'Essa enquete não está aberta.'));
      }
      if (option >= poll.options.length) return reply(fail('VALIDATION_ERROR', 'Opção inválida.'));
      if (poll.votes.has(userId)) return reply(fail('ALREADY_VOTED', 'Você já votou.'));
      poll.votes.set(userId, option);
      if (!r.timer) {
        r.timer = setTimeout(() => {
          r.timer = undefined;
          broadcastPoll(roomId);
        }, VOTE_BROADCAST_MS);
      }
      reply({ ok: true });
    }),
  );

  // Encerrar (mostra o resultado) ou tirar a enquete do topo (moderação).
  const finish = (remove: boolean) =>
    handler(pollRef, remove ? 'poll:clear' : 'poll:close', async ({ roomId, pollId }, reply) => {
      if (!isStaff(deps.role())) return reply(fail('FORBIDDEN', 'Só a moderação encerra.'));
      if (!socket.rooms.has(room(roomId))) return reply(fail('FORBIDDEN', 'Acompanhe a sala.'));
      const r = state.room(roomId);
      if (!r.active || r.active.id !== pollId)
        return reply(fail('NOT_FOUND', 'Enquete não encontrada.'));
      if (remove) r.active = null;
      else r.active.status = 'closed';
      broadcastPoll(roomId);
      reply({ ok: true });
    });
  socket.on('poll:close', finish(false));
  socket.on('poll:clear', finish(true));
}
