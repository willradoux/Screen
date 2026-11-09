import { ParticipationModel, RoomModel, UserModel } from '../../db/models.js';

export interface ServerStats {
  /** Janela analisada, em dias. */
  days: number;
  from: string;
  to: string;
  livesOpened: number;
  meetingsHeld: number;
  /** Pessoas diferentes que entraram em alguma sala. */
  uniqueParticipants: number;
  /** Quantas entradas em sala houve (a mesma pessoa pode entrar várias vezes). */
  sessions: number;
  /** Soma do tempo de todo mundo conectado, em minutos. */
  participantMinutes: number;
  avgSessionMinutes: number;
  topPeople: { userId: string; displayName: string; minutes: number }[];
  /** Um item por dia do período (inclusive dias sem atividade). */
  perDay: { date: string; participants: number; minutes: number }[];
}

export type StatsData = Omit<ServerStats, 'days' | 'from' | 'to'>;

export interface StatsRepo {
  compute(guildId: string, from: Date, to: Date): Promise<StatsData>;
}

const TZ = 'America/Sao_Paulo';

/** Todos os dias entre `from` e `to` (no fuso do Brasil), na forma AAAA-MM-DD. */
export function daysBetween(from: Date, to: Date): string[] {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const out: string[] = [];
  for (let t = from.getTime(); t <= to.getTime() + 86_400_000 - 1; t += 86_400_000) {
    const d = fmt.format(new Date(t));
    if (!out.includes(d)) out.push(d);
    if (out.length > 400) break;
  }
  return out;
}

export function createStatsRepo(): StatsRepo {
  return {
    async compute(guildId, from, to) {
      const [livesOpened, meetingsHeld] = await Promise.all([
        RoomModel.countDocuments({ guildId, type: 'LIVE', openedAt: { $gte: from, $lte: to } }),
        RoomModel.countDocuments({
          guildId,
          type: 'MEETING',
          openedAt: { $gte: from, $lte: to },
        }),
      ]);

      const minutes = {
        $divide: [{ $subtract: [{ $ifNull: ['$leftAt', to] }, '$joinedAt'] }, 60_000],
      };
      const [agg] = await ParticipationModel.aggregate<{
        totals: { sessions: number; minutes: number }[];
        unique: { n: number }[];
        top: { _id: string; minutes: number; name: string | null }[];
        days: { _id: string; participants: string[]; minutes: number }[];
      }>([
        { $match: { joinedAt: { $gte: from, $lte: to } } },
        { $addFields: { m: minutes } },
        {
          $facet: {
            totals: [{ $group: { _id: null, sessions: { $sum: 1 }, minutes: { $sum: '$m' } } }],
            unique: [{ $group: { _id: '$userId' } }, { $count: 'n' }],
            top: [
              {
                $group: {
                  _id: '$userId',
                  minutes: { $sum: '$m' },
                  name: { $last: '$displayName' },
                },
              },
              { $sort: { minutes: -1 } },
              { $limit: 5 },
            ],
            days: [
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$joinedAt', timezone: TZ } },
                  participants: { $addToSet: '$userId' },
                  minutes: { $sum: '$m' },
                },
              },
            ],
          },
        },
      ]);

      const totals = agg?.totals[0] ?? { sessions: 0, minutes: 0 };
      const byDay = new Map((agg?.days ?? []).map((d) => [d._id, d]));
      const top = agg?.top ?? [];
      // Nome atual da pessoa (o da participação pode ser antigo).
      const users = await UserModel.find({ _id: { $in: top.map((t) => t._id) } })
        .select('username globalName')
        .lean();
      const nameOf = new Map(users.map((u) => [u._id, u.globalName ?? u.username]));

      return {
        livesOpened,
        meetingsHeld,
        uniqueParticipants: agg?.unique[0]?.n ?? 0,
        sessions: totals.sessions,
        participantMinutes: Math.round(totals.minutes),
        avgSessionMinutes: totals.sessions ? Math.round(totals.minutes / totals.sessions) : 0,
        topPeople: top.map((t) => ({
          userId: t._id,
          displayName: nameOf.get(t._id) ?? t.name ?? t._id,
          minutes: Math.round(t.minutes),
        })),
        perDay: daysBetween(from, to).map((date) => ({
          date,
          participants: byDay.get(date)?.participants.length ?? 0,
          minutes: Math.round(byDay.get(date)?.minutes ?? 0),
        })),
      };
    },
  };
}

export class StatsService {
  constructor(private readonly deps: { repo: StatsRepo; guildId: string; now?: () => Date }) {}

  async get(days: number): Promise<ServerStats> {
    const to = this.deps.now?.() ?? new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    const data = await this.deps.repo.compute(this.deps.guildId, from, to);
    return { days, from: from.toISOString(), to: to.toISOString(), ...data };
  }
}
