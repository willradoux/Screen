import { describe, expect, it } from 'vitest';
import { buildReport, summarize } from '../../src/modules/meetings/report.js';
import type { Participation } from '../../src/modules/rooms/participations.js';

const T = (min: number) => new Date(Date.UTC(2026, 11, 5, 23, 0, 0) + min * 60_000);

const room = (over: Partial<{ openedAt: Date; endedAt: Date | null }> = {}) => ({
  openedAt: over.openedAt ?? T(0),
  startsAt: T(0),
  createdAt: T(-60),
  endedAt: over.endedAt === undefined ? T(60) : over.endedAt,
});

const session = (
  userId: string,
  from: number,
  to: number | null,
  name = `Nome ${userId}`,
): Participation => ({
  roomId: 'r',
  userId,
  displayName: name,
  avatarUrl: null,
  roleAtJoin: 'MEMBER',
  joinedAt: T(from),
  leftAt: to === null ? null : T(to),
  leaveReason: to === null ? null : 'LEFT',
  mutedByModeration: false,
  mutedSources: [],
});

describe('buildReport', () => {
  it('reunião vazia: duração certa, ninguém na lista, pico zero', () => {
    expect(buildReport(room(), [], T(999))).toEqual({
      durationMinutes: 60,
      peakParticipants: 0,
      attendees: [],
    });
  });

  it('soma os minutos de cada pessoa e ordena pela primeira entrada', () => {
    const r = buildReport(room(), [session('b', 10, 40), session('a', 5, 25)], T(999));
    expect(r.attendees.map((a) => a.userId)).toEqual(['a', 'b']);
    expect(r.attendees).toEqual([
      {
        userId: 'a',
        displayName: 'Nome a',
        joinedAt: T(5).toISOString(),
        leftAt: T(25).toISOString(),
        minutes: 20,
      },
      {
        userId: 'b',
        displayName: 'Nome b',
        joinedAt: T(10).toISOString(),
        leftAt: T(40).toISOString(),
        minutes: 30,
      },
    ]);
  });

  it('quem saiu e voltou aparece uma vez, com a soma dos períodos (e não o intervalo)', () => {
    const r = buildReport(room(), [session('a', 0, 10), session('a', 30, 50)], T(999));
    expect(r.attendees).toHaveLength(1);
    expect(r.attendees[0]).toMatchObject({
      joinedAt: T(0).toISOString(),
      leftAt: T(50).toISOString(),
      minutes: 30, // 10 + 20, não 50
    });
  });

  it('quem ainda estava conectado no fim conta só até o fim da reunião', () => {
    const r = buildReport(room({ endedAt: T(60) }), [session('a', 20, null)], T(5000));
    expect(r.attendees[0]).toMatchObject({ leftAt: T(60).toISOString(), minutes: 40 });
  });

  it('sessão que termina depois do fim é cortada no fim', () => {
    const r = buildReport(room({ endedAt: T(60) }), [session('a', 50, 90)], T(5000));
    expect(r.attendees[0]).toMatchObject({ leftAt: T(60).toISOString(), minutes: 10 });
  });

  it('sessão que começou antes da abertura conta a partir da abertura', () => {
    const r = buildReport(room(), [session('a', -30, 20)], T(999));
    expect(r.attendees[0]).toMatchObject({ joinedAt: T(0).toISOString(), minutes: 20 });
  });

  it('sessão totalmente fora do intervalo é ignorada', () => {
    const r = buildReport(room(), [session('a', 70, 80), session('b', -20, -10)], T(999));
    expect(r.attendees).toEqual([]);
    expect(r.peakParticipants).toBe(0);
  });

  it('pico = máximo de pessoas ao mesmo tempo', () => {
    const r = buildReport(
      room(),
      [session('a', 0, 30), session('b', 10, 40), session('c', 20, 50), session('d', 45, 60)],
      T(999),
    );
    expect(r.peakParticipants).toBe(3); // a, b, c entre os minutos 20 e 30
  });

  it('quem sai e quem entra no mesmo instante não se somam no pico', () => {
    const r = buildReport(room(), [session('a', 0, 30), session('b', 30, 60)], T(999));
    expect(r.peakParticipants).toBe(1);
  });

  it('sem fim registrado, usa o relógio atual (reunião ainda aberta)', () => {
    const r = buildReport(room({ endedAt: null }), [session('a', 0, null)], T(25));
    expect(r.durationMinutes).toBe(25);
    expect(r.attendees[0]!.minutes).toBe(25);
  });

  it('arredonda para o minuto mais próximo e nunca devolve duração negativa', () => {
    const half = { ...session('a', 0, 0), leftAt: new Date(T(0).getTime() + 90_000) };
    expect(buildReport(room(), [half], T(999)).attendees[0]!.minutes).toBe(2);
    expect(buildReport(room({ endedAt: T(-10) }), [], T(999)).durationMinutes).toBe(0);
  });

  it('usa o horário de início quando a reunião nunca foi aberta', () => {
    const r = buildReport(
      { openedAt: null as never, startsAt: T(0), createdAt: T(-60), endedAt: T(30) },
      [],
      T(999),
    );
    expect(r.durationMinutes).toBe(30);
  });
});

describe('summarize', () => {
  it('reduz o relatório ao resumo do embed', () => {
    const report = buildReport(room(), [session('a', 0, 30), session('b', 10, 40)], T(999));
    expect(summarize(report)).toEqual({
      durationMinutes: 60,
      attendeeCount: 2,
      peakParticipants: 2,
    });
  });
});
