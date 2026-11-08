/**
 * Como o resto do sistema avisa os clientes conectados (Socket.IO). Os eventos
 * estão documentados em docs/backend/eventos-socketio.md.
 */
export interface RealtimeEmitter {
  /** Para quem está inscrito na sala (`room:subscribe`). */
  toRoom(roomId: string, event: string, payload: unknown): void;
  /** Para todos os sockets de um usuário. */
  toUser(userId: string, event: string, payload: unknown): void;
  /** Para os administradores conectados. */
  toAdmins(event: string, payload: unknown): void;
}

/**
 * O servidor Socket.IO só existe depois do `http.Server`, que só existe depois do
 * app Express, que já precisa do emissor. Este intermediário resolve o ciclo.
 */
export class LateBoundEmitter implements RealtimeEmitter {
  private target: RealtimeEmitter | undefined;

  attach(target: RealtimeEmitter): void {
    this.target = target;
  }

  toRoom(roomId: string, event: string, payload: unknown): void {
    this.target?.toRoom(roomId, event, payload);
  }

  toUser(userId: string, event: string, payload: unknown): void {
    this.target?.toUser(userId, event, payload);
  }

  toAdmins(event: string, payload: unknown): void {
    this.target?.toAdmins(event, payload);
  }
}
