import { discordTime } from '../shared/time.js';
import type { MeetingSummary } from '../modules/meetings/report.js';
import type { RoomRecord } from '../modules/rooms/rooms.types.js';
import type { MessagePayload } from './gateway.js';

export interface EmbedContext {
  webUrl: string;
  /** Pessoas no canal de voz agora (só lives). */
  participants: number;
  /** Cargo marcado no aviso de reunião; vazio = não marca ninguém. */
  mentionRoleId?: string | undefined;
  /** Números da reunião encerrada (aparecem no embed final). */
  summary?: MeetingSummary | null | undefined;
}

// Cores do Screen: laranja quando está acontecendo, pêssego quando está marcado, cinza quando acabou.
const COLORS = {
  live: 0xff7a45,
  open: 0xff7a45,
  scheduled: 0xffb347,
  ended: 0x4e5058,
  canceled: 0x4e5058,
} as const;

/** Ícone do Screen servido pelo próprio site (o Discord só aceita https). */
const iconUrl = (webUrl: string): string | undefined =>
  /^https:\/\//.test(webUrl) ? `${webUrl.replace(/\/$/, '')}/icon-192.png` : undefined;

/** Rodapé com o ícone do Screen (sem ícone quando o site não é https, como no desenvolvimento). */
const footer = (webUrl: string) => {
  const icon = iconUrl(webUrl);
  return { text: 'Screen · Acelera DEV', ...(icon ? { icon_url: icon } : {}) };
};

export const roomUrl = (webUrl: string, roomId: string) =>
  `${webUrl.replace(/\/$/, '')}/r/${roomId}`;

const linkButton = (label: string, url: string, emoji?: string): Record<string, unknown>[] => [
  {
    type: 1,
    components: [{ type: 2, style: 5, label, url, ...(emoji ? { emoji: { name: emoji } } : {}) }],
  },
];

/**
 * Monta a mensagem pública de uma sala conforme o estado dela.
 * Link único: `{WEB_URL}/r/{roomId}`. O acesso real é validado no servidor.
 */
export function buildRoomMessage(room: RoomRecord, ctx: EmbedContext): MessagePayload {
  return room.type === 'LIVE' ? buildLive(room, ctx) : buildMeeting(room, ctx);
}

function buildLive(room: RoomRecord, ctx: EmbedContext): MessagePayload {
  const channel = room.voiceChannelId ? `<#${room.voiceChannelId}>` : room.title;

  if (room.status !== 'OPEN') {
    return {
      embeds: [
        {
          title: 'Live encerrada',
          description: `A live em ${channel} terminou. Valeu a todo mundo que passou por lá!`,
          color: COLORS.ended,
          footer: footer(ctx.webUrl),
        },
      ],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }

  return {
    embeds: [
      {
        title: `Live aberta: ${room.title.replace(/^Live - /, '')}`,
        description:
          `🔴 <@${room.createdBy}> abriu uma live em ${channel}.\n` +
          'Entre no canal de voz e abra o **Screen** para mostrar câmera e tela.',
        color: COLORS.live,
        fields: [
          { name: 'Participantes', value: String(ctx.participants), inline: true },
          { name: 'Canal', value: channel, inline: true },
          {
            name: 'Sessão',
            value:
              room.mediaState === 'ACTIVE' ? '🟢 Em uso' : '⏸️ Em espera: abra a sala para ativar',
            inline: true,
          },
        ],
        footer: footer(ctx.webUrl),
      },
    ],
    components: linkButton('Abrir sala', roomUrl(ctx.webUrl, room.id), '▶️'),
    allowed_mentions: { parse: [] },
  };
}

function buildMeeting(room: RoomRecord, ctx: EmbedContext): MessagePayload {
  const url = roomUrl(ctx.webUrl, room.id);
  const description = room.description ?? undefined;
  const who = room.allowedRoleIds.length
    ? room.allowedRoleIds.map((r) => `<@&${r}>`).join(', ')
    : 'todos os membros';
  const when = room.startsAt
    ? `${discordTime(room.startsAt, 'F')} (${discordTime(room.startsAt, 'R')})`
    : 'agora';

  const base = (title: string, color: number, fields: Record<string, unknown>[]) => ({
    title,
    ...(description ? { description } : {}),
    color,
    fields,
    footer: footer(ctx.webUrl),
  });

  if (room.status === 'ENDED') {
    return {
      embeds: [base(`Reunião encerrada: ${room.title}`, COLORS.ended, summaryFields(ctx.summary))],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }
  if (room.status === 'CANCELED') {
    return {
      embeds: [base(`Reunião cancelada: ${room.title}`, COLORS.canceled, [])],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }

  const open = room.status === 'OPEN';
  const embed = base(
    open ? `Reunião aberta agora: ${room.title}` : `Reunião: ${room.title}`,
    open ? COLORS.open : COLORS.scheduled,
    [
      { name: 'Quando', value: `🗓️ ${when}`, inline: false },
      { name: 'Quem pode entrar', value: who, inline: true },
      { name: 'Vagas', value: `até ${room.maxParticipants} pessoas`, inline: true },
    ],
  );

  // A menção só vale na mensagem inicial; edições não notificam de novo.
  const mention = mentionOf(ctx.mentionRoleId);
  return {
    ...mention,
    embeds: [embed],
    components: linkButton(open ? 'Entrar na reunião' : 'Ver sala', url, open ? '▶️' : '🗓️'),
  };
}

/**
 * Menção do aviso. Com cargo configurado marca só esse cargo; sem cargo NÃO marca ninguém
 * (nem @everyone, nem @here): sem `content` e com `allowed_mentions` vazio.
 */
function mentionOf(roleId: string | undefined): {
  content?: string;
  allowed_mentions: Record<string, unknown>;
} {
  return roleId
    ? { content: `<@&${roleId}>`, allowed_mentions: { roles: [roleId] } }
    : { allowed_mentions: { parse: [] } };
}

function summaryFields(summary: MeetingSummary | null | undefined): Record<string, unknown>[] {
  if (!summary) return [];
  return [
    { name: 'Duração', value: `${summary.durationMinutes} min`, inline: true },
    { name: 'Participantes', value: String(summary.attendeeCount), inline: true },
    { name: 'Pico', value: String(summary.peakParticipants), inline: true },
  ];
}

export type MeetingNoticeKind = 'reminder' | 'rescheduled' | 'canceled';

/**
 * Mensagem curta e nova no canal de avisos (lembrete, reagendamento, cancelamento).
 * Lembrete e reagendamento marcam o mesmo cargo/@everyone do aviso original e têm o botão
 * para a sala; o cancelamento é silencioso e sem botão.
 */
export function buildMeetingNotice(
  room: RoomRecord,
  kind: MeetingNoticeKind,
  ctx: Pick<EmbedContext, 'webUrl' | 'mentionRoleId'>,
): MessagePayload {
  const when = room.startsAt
    ? `${discordTime(room.startsAt, 'F')} (${discordTime(room.startsAt, 'R')})`
    : 'agora';

  if (kind === 'canceled') {
    return {
      embeds: [
        {
          title: `Reunião cancelada: ${room.title}`,
          color: COLORS.canceled,
          footer: footer(ctx.webUrl),
        },
      ],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }

  const mention = mentionOf(ctx.mentionRoleId);
  const embed =
    kind === 'reminder'
      ? {
          title: `Reunião em breve: ${room.title}`,
          description: `Começa ${room.startsAt ? discordTime(room.startsAt, 'R') : 'agora'}.`,
          color: COLORS.scheduled,
          fields: [{ name: 'Quando', value: `🗓️ ${when}`, inline: false }],
          footer: footer(ctx.webUrl),
        }
      : {
          title: `Reunião reagendada: ${room.title}`,
          description: `🗓️ Nova data: ${when}`,
          color: COLORS.scheduled,
          footer: footer(ctx.webUrl),
        };

  return {
    ...mention,
    embeds: [embed],
    components: linkButton('Ver sala', roomUrl(ctx.webUrl, room.id), '🗓️'),
  };
}
