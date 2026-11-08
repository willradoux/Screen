import { roomUrl } from '../embeds.js';
import { discordTime, parseDateTime } from '../../shared/time.js';
import type { RoomService } from '../../modules/rooms/rooms.service.js';
import {
  DEFAULT_MEETING_CAPACITY,
  DEFAULT_REMINDERS,
  type RoomRecord,
  type RoomRepo,
} from '../../modules/rooms/rooms.types.js';
import type { SettingsRepo } from '../../modules/settings/settings.types.js';
import {
  UserError,
  type AutocompleteChoice,
  type CommandCall,
  type CommandContext,
  type CommandReply,
} from './types.js';

export interface MeetingHandlerDeps {
  rooms: RoomRepo;
  roomService: RoomService;
  settings: SettingsRepo;
  guildId: string;
  webUrl: string;
  timezone: string;
  now?: () => Date;
}

const MIN_LEAD_MS = 2 * 60_000;
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

/** `/reuniao ...` — criar, agendar e cancelar são só de ADMIN; encerrar é de MOD+. */
export class MeetingHandler {
  private readonly now: () => Date;

  constructor(private readonly deps: MeetingHandlerDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  async handle(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    switch (call.sub) {
      case 'criar':
        return this.create(ctx, call, false);
      case 'agendar':
        return this.create(ctx, call, true);
      case 'cancelar':
        return this.cancel(call);
      case 'encerrar':
        return this.end(ctx, call);
      case 'listar':
        return this.list();
      default:
        throw new UserError('Subcomando desconhecido.');
    }
  }

  private link(room: RoomRecord): string {
    return roomUrl(this.deps.webUrl, room.id);
  }

  private async create(
    ctx: CommandContext,
    call: CommandCall,
    scheduled: boolean,
  ): Promise<CommandReply> {
    const title = text(call, 'titulo', 3, 100);
    const description = optionalText(call, 'descricao', 1000);
    const announce = call.options.avisar !== false;

    let startsAt: Date | null = null;
    if (scheduled) {
      const date = text(call, 'data', 8, 10);
      const time = text(call, 'hora', 4, 5);
      startsAt = parseDateTime(date, time, this.deps.timezone);
      if (!startsAt) {
        throw new UserError(
          'Data ou hora inválida. Use `DD/MM/AAAA` e `HH:mm`, por exemplo `05/12/2026` e `20:00`.',
        );
      }
      if (startsAt.getTime() < this.now().getTime() + MIN_LEAD_MS) {
        throw new UserError('O horário precisa estar pelo menos 2 minutos no futuro.');
      }
    }

    const settings = await this.deps.settings.get(this.deps.guildId);
    if (announce && !settings.announceChannelId) {
      throw new UserError(
        'O canal de avisos ainda não foi configurado. Use `/config canal-avisos` (ou crie sem aviso com `avisar: não`).',
      );
    }

    // Só lembretes que ainda fazem sentido (começam depois de agora).
    let reminders: number[] = [];
    if (startsAt) {
      const minutesAway = (startsAt.getTime() - this.now().getTime()) / 60_000;
      reminders = parseReminders(
        typeof call.options.lembretes === 'string' ? call.options.lembretes : undefined,
      ).filter((m) => m < minutesAway);
    }

    const { room, announced } = await this.deps.roomService.createMeeting(
      {
        guildId: this.deps.guildId,
        title,
        description,
        startsAt,
        createdBy: ctx.userId,
        maxParticipants: DEFAULT_MEETING_CAPACITY,
        allowedRoleIds: settings.meetingAllowedRoleIds,
        reminders,
        now: this.now(),
      },
      announce,
    );

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

  private async cancel(call: CommandCall): Promise<CommandReply> {
    const id = text(call, 'reuniao', 1, 100);
    const room = await this.deps.rooms.findById(id);
    if (!room || room.type !== 'MEETING') throw new UserError('Não encontrei essa reunião.');
    if (room.status === 'OPEN') {
      throw new UserError('Essa reunião já está aberta. Use `/reuniao encerrar`.');
    }
    const canceled = await this.deps.roomService.cancelMeeting(id);
    if (!canceled)
      throw new UserError(`Essa reunião não pode ser cancelada (estado: ${room.status}).`);
    return { content: `✅ Reunião **${canceled.title}** cancelada.` };
  }

  private async end(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    void ctx;
    const given = typeof call.options.reuniao === 'string' ? call.options.reuniao.trim() : '';
    let room: RoomRecord | null;

    if (given) {
      room = await this.deps.rooms.findById(given);
      if (!room || room.type !== 'MEETING') throw new UserError('Não encontrei essa reunião.');
    } else {
      const open = await this.deps.rooms.listMeetings(this.deps.guildId, ['OPEN']);
      if (open.length === 0) throw new UserError('Não há nenhuma reunião aberta.');
      if (open.length > 1) {
        throw new UserError(
          'Há mais de uma reunião aberta. Escolha qual encerrar na opção `reuniao`.',
        );
      }
      room = open[0]!;
    }

    if (room.status !== 'OPEN') {
      throw new UserError(`Essa reunião não está aberta (estado: ${room.status}).`);
    }
    const ended = await this.deps.roomService.endRoom(room.id, 'ENDED_BY_ADMIN');
    if (!ended) throw new UserError('Essa reunião já foi encerrada.');
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
