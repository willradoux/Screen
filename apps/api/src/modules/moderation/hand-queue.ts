import type { RealtimeEmitter } from '../../realtime/emitter.js';
import type { ParticipationRepo } from '../rooms/participations.js';

export interface RaisedHand {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  /** Quando levantou a mão (ISO). A fila é por ordem de chegada. */
  at: string;
}

/**
 * Fila de "pedir a palavra" das reuniões (principalmente no modo palestra). Fica em memória:
 * é um estado de minutos e some se o servidor reiniciar, o que não machuca ninguém (a pessoa
 * levanta a mão de novo). Só aparece quem ainda está conectado na sala.
 */
export class HandQueue {
  private readonly rooms = new Map<string, Map<string, RaisedHand>>();

  constructor(
    private readonly deps: {
      participations: Pick<ParticipationRepo, 'findOpen' | 'listOpen'>;
      realtime: RealtimeEmitter;
      now?: () => Date;
    },
  ) {}

  private notify(roomId: string, list: RaisedHand[]): void {
    this.deps.realtime.toRoom(roomId, 'hand:updated', { roomId, hands: list });
  }

  /** Levanta a mão. Idempotente: levantar de novo mantém a posição. `false` se não está na sala. */
  async raise(roomId: string, userId: string): Promise<boolean> {
    const p = await this.deps.participations.findOpen(roomId, userId);
    if (!p) return false;
    const queue = this.rooms.get(roomId) ?? new Map<string, RaisedHand>();
    if (!queue.has(userId)) {
      queue.set(userId, {
        userId,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
        at: (this.deps.now?.() ?? new Date()).toISOString(),
      });
      this.rooms.set(roomId, queue);
      this.notify(roomId, [...queue.values()]);
    }
    return true;
  }

  /** Abaixa a mão (por conta própria ou quando recebe a palavra). */
  lower(roomId: string, userId: string): void {
    const queue = this.rooms.get(roomId);
    if (!queue?.delete(userId)) return;
    if (queue.size === 0) this.rooms.delete(roomId);
    this.notify(roomId, [...(queue.values() ?? [])]);
  }

  /** A fila atual, sem quem já saiu da sala. */
  async list(roomId: string): Promise<RaisedHand[]> {
    const queue = this.rooms.get(roomId);
    if (!queue) return [];
    const present = new Set((await this.deps.participations.listOpen(roomId)).map((p) => p.userId));
    for (const id of [...queue.keys()]) if (!present.has(id)) queue.delete(id);
    return [...queue.values()];
  }

  clear(roomId: string): void {
    this.rooms.delete(roomId);
  }
}
