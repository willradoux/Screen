import type { RoomStatus, RoomType } from '@screem/shared';

export interface Reminder {
  minutesBefore: number;
  sentAt: Date | null;
}

export interface RoomRecord {
  id: string;
  guildId: string;
  type: RoomType;
  status: RoomStatus;
  title: string;
  description: string | null;
  voiceChannelId: string | null;
  announceChannelId: string | null;
  announceMessageId: string | null;
  startsAt: Date | null;
  openedAt: Date | null;
  endedAt: Date | null;
  /** ID Discord de quem criou (ou de quem abriu a live). */
  createdBy: string;
  maxParticipants: number;
  allowedRoleIds: string[];
  lectureMode: boolean;
  speakerIds: string[];
  reminders: Reminder[];
  endReason: string | null;
  createdAt: Date;
}

/** Campos editáveis de uma sala. `description: null` apaga a descrição. */
export interface RoomPatch {
  title?: string;
  description?: string | null;
  maxParticipants?: number;
  lectureMode?: boolean;
  allowedRoleIds?: string[];
}

export interface NewMeeting {
  guildId: string;
  title: string;
  description: string | null;
  startsAt: Date | null;
  createdBy: string;
  maxParticipants: number;
  allowedRoleIds: string[];
  reminders: number[];
  now: Date;
}

export interface RoomRepo {
  /**
   * Devolve a sala de live aberta do canal, criando-a se não existir.
   * Idempotente e seguro contra eventos concorrentes.
   */
  ensureOpenLive(input: {
    guildId: string;
    channelId: string;
    title: string;
    maxParticipants: number;
    createdBy: string;
    now: Date;
  }): Promise<{ room: RoomRecord; created: boolean }>;
  /** Cria reunião: `OPEN` se `startsAt` for nulo, senão `SCHEDULED`. */
  createMeeting(input: NewMeeting): Promise<RoomRecord>;
  findById(id: string): Promise<RoomRecord | null>;
  findOpenLiveByChannel(channelId: string): Promise<RoomRecord | null>;
  listOpenLive(guildId: string): Promise<RoomRecord[]>;
  /** Reuniões nos estados pedidos, da mais próxima para a mais distante. */
  listMeetings(guildId: string, statuses: RoomStatus[]): Promise<RoomRecord[]>;
  /** Lista salas, das mais novas para as mais antigas, com paginação por cursor. */
  list(
    guildId: string,
    filter: { statuses?: RoomStatus[]; type?: RoomType },
    page: { limit: number; cursor?: string },
  ): Promise<{ items: RoomRecord[]; next: string | null }>;
  setAnnouncement(id: string, channelId: string, messageId: string): Promise<void>;
  update(id: string, patch: RoomPatch): Promise<RoomRecord | null>;
  /**
   * Reagenda e/ou troca os lembretes de uma reunião `SCHEDULED` (`null` se já não estiver).
   * Os lembretes voltam a ser pendentes, só os que ainda fazem sentido (o início é depois deles).
   */
  updateSchedule(
    id: string,
    input: { startsAt?: Date; reminders?: number[]; now: Date },
  ): Promise<RoomRecord | null>;
  /** Reserva o envio de um lembrete. `true` só para quem conseguiu (evita envio duplo). */
  claimReminder(id: string, minutesBefore: number, at: Date): Promise<boolean>;
  /** Devolve um lembrete reservado cujo envio falhou, para tentar de novo. */
  releaseReminder(id: string, minutesBefore: number): Promise<void>;
  /** Adiciona ou remove um palestrante (sem duplicar). */
  updateSpeakers(id: string, action: 'add' | 'remove', userId: string): Promise<RoomRecord | null>;
  /** Muda o estado só se o atual estiver em `from`. `null` se não estava. */
  transition(
    id: string,
    from: RoomStatus[],
    to: RoomStatus,
    patch: { openedAt?: Date; endedAt?: Date; endReason?: string },
  ): Promise<RoomRecord | null>;
}

export const DEFAULT_REMINDERS = [1440, 60, 5];
export const DEFAULT_MEETING_CAPACITY = 100;
