import { AppError } from '../../shared/errors.js';
import { discordTime, parseDateTime } from '../../shared/time.js';
import type { MeetingService } from '../../modules/meetings/meetings.service.js';
import {
  DEFAULT_REMINDERS,
  type RoomRecord,
  type RoomRepo,
} from '../../modules/rooms/rooms.types.js';
import { roomUrl } from '../embeds.js';
import {
  UserError,
  type AutocompleteChoice,
  type CommandCall,
  type CommandContext,
  type CommandReply,
} from './types.js';

export interface MeetingHandlerDeps {
  rooms: RoomRepo;
  meetings: MeetingService;
  guildId: string;
  webUrl: string;
  timezone: string;
}

const MAX_REMINDERS = 5;
const MAX_REMINDER_MINUTES = 43_200; // 30 dias

function text(call: CommandCall, name: string, min: number, max: number): string {
  const value = call.options[name];
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (trimmed.length < min || trimmed.length > max) {
    throw new UserError(`"${name}" deve ter entre ${min} e ${max} caracteres.`);
  }
  return trimmed;
}

function optionalText(call: CommandCall, name: string, max: number): string | null {
  const value = call.options[name];
  if (value === undefined || value === '') return null;
  const trimmed = String(value).trim();
  if (trimmed.length > max) throw new UserError(`"${name}" pode ter no máximo ${max} caracteres.`);
  return trimmed || null;
}

/** "1440, 60, 5" -> [1440, 60, 5]. Só valores positivos, sem repetição, do maior para o menor. */
export function parseReminders(input: string | undefined): number[] {
  if (input === undefined || input.trim() === '') return DEFAULT_REMINDERS;
  if (input.trim() === '0') return [];
  const parts = input.split(',').map((p) => p.trim());
  const values = parts.map((p) => (/^\d+$/.test(p) ? Number(p) : NaN));
  if (
    values.some((v) => !Number.isInteger(v) || v < 1 || v > MAX_REMINDER_MINUTES) ||
    values.length > MAX_REMINDERS
  ) {
    throw new UserError(
      `Lembretes: informe até ${MAX_REMINDERS} números de minutos separados por vírgula (ex.: 1440,60,5), ou 0 para nenhum.`,
    );
  }
  return [...new Set(values)].sort((a, b) => b - a);
}

/**
 * `/reuniao ...` — criar, agendar, reagendar, cancelar e listar são só de ADMIN;
 * encerrar é de MOD+. Aqui só se interpreta o que foi digitado; as regras estão no
 * `MeetingService`, o mesmo usado pela API REST.
 */
export class MeetingHandler {
  constructor(private readonly deps: MeetingHandlerDeps) {}

  async handle(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    try {
      switch (call.sub) {
        case 'criar':
          return await this.create(ctx, call, false);
        case 'agendar':
          return await this.create(ctx, call, true);
        case 'reagendar':
          return await this.reschedule(ctx, call);
        case 'cancelar':
          return await this.cancel(ctx, call);
        case 'encerrar':
          return await this.end(ctx, call);
        case 'listar':
          return await this.list();
        default:
          throw new UserError('Subcomando desconhecido.');
      }
    } catch (err) {
      // Erros de regra (AppError) viram a resposta do comando, com a mesma mensagem da API.
      if (err instanceof AppError && err.status < 500) throw new UserError(err.message);
      throw err;
    }
  }

  private link(room: RoomRecord): string {
    return roomUrl(this.deps.webUrl, room.id);
  }

  private actor(ctx: CommandContext) {
    return { id: ctx.userId, via: 'command' as const, role: ctx.role };
  }

  /** `DD/MM/AAAA` + `HH:mm` no fuso do servidor. */
  private parseWhen(call: CommandCall): Date {
    const date = text(call, 'data', 8, 10);
    const time = text(call, 'hora', 4, 5);
    const startsAt = parseDateTime(date, time, this.deps.timezone);
    if (!startsAt) {
      throw new UserError(
        'Data ou hora inválida. Use `DD/MM/AAAA` e `HH:mm`, por exemplo `05/12/2026` e `20:00`.',
      );
    }
    return startsAt;
  }

  private async create(
    ctx: CommandContext,
    call: CommandCall,
    scheduled: boolean,
  ): Promise<CommandReply> {
    const title = text(call, 'titulo', 3, 100);
    const description = optionalText(call, 'descricao', 1000);
    const announce = call.options.avisar !== false;
    const startsAt = scheduled ? this.parseWhen(call) : null;
    const reminders = scheduled
      ? parseReminders(
          typeof call.options.lembretes === 'string' ? call.options.lembretes : undefined,
        )
      : [];

    const { room, announced } = await this.deps.meetings.create(this.actor(ctx), {
      title,
      description,
      startsAt,
      announce,
      reminders,
    });

    const lines = [
      startsAt
        ? `✅ Reunião **${room.title}** agendada para ${discordTime(startsAt, 'F')} (${discordTime(startsAt, 'R')}).`
        : `✅ Reunião **${room.title}** criada e aberta agora.`,
      `🔗 ${this.link(room)}`,
    ];
    if (announce && !announced) {
      lines.push(
        '⚠️ A reunião foi criada, mas **não consegui enviar o aviso**. Confira o canal de avisos e as permissões do bot.',
      );
    }
    if (!announce) lines.push('Nenhum aviso foi enviado.');
    return { content: lines.join('\n') };
  }

  private async reschedule(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    const id = text(call, 'reuniao', 1, 100);
    const startsAt = this.parseWhen(call);
    const room = await this.deps.meetings.update(this.actor(ctx), id, { startsAt });
    return {
      content: [
        `✅ Reunião **${room.title}** reagendada para ${discordTime(startsAt, 'F')} (${discordTime(startsAt, 'R')}).`,
        `🔗 ${this.link(room)}`,
      ].join('\n'),
    };
  }

  private async cancel(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    const id = text(call, 'reuniao', 1, 100);
    const canceled = await this.deps.meetings.cancel(this.actor(ctx), id);
    return { content: `✅ Reunião **${canceled.title}** cancelada.` };
  }

  private async end(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    const given = typeof call.options.reuniao === 'string' ? call.options.reuniao.trim() : '';
    let id = given;

    if (!id) {
      const open = await this.deps.rooms.listMeetings(this.deps.guildId, ['OPEN']);
      if (open.length === 0) throw new UserError('Não há nenhuma reunião aberta.');
      if (open.length > 1) {
        throw new UserError(
          'Há mais de uma reunião aberta. Escolha qual encerrar na opção `reuniao`.',
        );
      }
      id = open[0]!.id;
    }

    const ended = await this.deps.meetings.end(this.actor(ctx), id);
    return { content: `✅ Reunião **${ended.title}** encerrada.` };
  }

  private async list(): Promise<CommandReply> {
    const meetings = await this.deps.rooms.listMeetings(this.deps.guildId, ['OPEN', 'SCHEDULED']);
    if (meetings.length === 0) return { content: 'Nenhuma reunião aberta ou agendada.' };
    const lines = meetings.slice(0, 15).map((m) => {
      const when = m.status === 'OPEN' ? '🟢 aberta agora' : `📅 ${discordTime(m.startsAt!, 'f')}`;
      return `• **${m.title}** — ${when}\n  ${this.link(m)}`;
    });
    return { content: ['**Reuniões**', ...lines].join('\n') };
  }

  /** Sugestões para a opção `reuniao` (autocomplete). */
  async autocomplete(query: string): Promise<AutocompleteChoice[]> {
    const meetings = await this.deps.rooms.listMeetings(this.deps.guildId, ['OPEN', 'SCHEDULED']);
    const q = query.toLowerCase();
    return meetings
      .filter((m) => m.title.toLowerCase().includes(q))
      .slice(0, 25)
      .map((m) => ({
        name: `${m.title} (${m.status === 'OPEN' ? 'aberta' : 'agendada'})`.slice(0, 100),
        value: m.id,
      }));
  }
}
