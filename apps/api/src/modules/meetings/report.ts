import type { Participation } from '../rooms/participations.js';
import type { RoomRecord } from '../rooms/rooms.types.js';

export interface Attendee {
  userId: string;
  displayName: string;
  /** Primeira entrada. */
  joinedAt: string;
  /** Última saída (ou o fim da reunião, para quem ainda estava dentro). */
  leftAt: string;
  /** Soma de todos os períodos em que ficou na sala. */
  minutes: number;
}

export interface MeetingReport {
  durationMinutes: number;
  peakParticipants: number;
  attendees: Attendee[];
}

/** O resumo curto que aparece no embed quando a reunião termina. */
export interface MeetingSummary {
  durationMinutes: number;
  attendeeCount: number;
  peakParticipants: number;
}

const MINUTE = 60_000;

/**
 * Lista de presença e números da reunião, a partir das participações.
 * Quem ainda estava conectado (ou saiu depois do fim) é contado só até o fim da reunião;
 * por isso o relatório fica certo mesmo que as participações ainda não tenham sido fechadas.
 */
export function buildReport(
  room: Pick<RoomRecord, 'openedAt' | 'startsAt' | 'createdAt' | 'endedAt'>,
  sessions: Participation[],
  now: Date,
): MeetingReport {
  const end = (room.endedAt ?? now).getTime();
  const start = (room.openedAt ?? room.startsAt ?? room.createdAt).getTime();

  // Cada sessão, limitada ao intervalo da reunião.
  const clipped = sessions
    .map((s) => ({
      userId: s.userId,
      displayName: s.displayName,
      from: Math.max(s.joinedAt.getTime(), start),
      to: Math.min((s.leftAt ?? new Date(end)).getTime(), end),
    }))
    .filter((s) => s.to >= s.from);

  const byUser = new Map<string, Attendee & { ms: number; first: number; last: number }>();
  for (const s of clipped.sort((a, b) => a.from - b.from)) {
    const current = byUser.get(s.userId);
    if (!current) {
      byUser.set(s.userId, {
        userId: s.userId,
        displayName: s.displayName,
        joinedAt: new Date(s.from).toISOString(),
        leftAt: new Date(s.to).toISOString(),
        minutes: 0,
        ms: s.to - s.from,
        first: s.from,
        last: s.to,
      });
    } else {
      current.ms += s.to - s.from;
      if (s.to > current.last) {
        current.last = s.to;
        current.leftAt = new Date(s.to).toISOString();
      }
    }
  }

  // Pico de gente ao mesmo tempo: varredura de entradas (+1) e saídas (-1).
  // Em empate de horário a saída vem antes, para quem sai e quem entra não se somarem.
  const events = clipped.flatMap((s) => [
    { at: s.from, delta: 1 },
    { at: s.to, delta: -1 },
  ]);
  events.sort((a, b) => a.at - b.at || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const e of events) {
    current += e.delta;
    if (current > peak) peak = current;
  }

  const attendees = [...byUser.values()]
    .sort((a, b) => a.first - b.first)
    .map(({ userId, displayName, joinedAt, leftAt, ms }) => ({
      userId,
      displayName,
      joinedAt,
      leftAt,
      minutes: Math.round(ms / MINUTE),
    }));

  return {
    durationMinutes: Math.max(0, Math.round((end - start) / MINUTE)),
    peakParticipants: peak,
    attendees,
  };
}

export function summarize(report: MeetingReport): MeetingSummary {
  return {
    durationMinutes: report.durationMinutes,
    attendeeCount: report.attendees.length,
    peakParticipants: report.peakParticipants,
  };
}
