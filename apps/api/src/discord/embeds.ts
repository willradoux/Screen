import { discordTime } from '../shared/time.js';
import type { RoomRecord } from '../modules/rooms/rooms.types.js';
import type { MessagePayload } from './gateway.js';

export interface EmbedContext {
  webUrl: string;
  /** Pessoas no canal de voz agora (só lives). */
  participants: number;
  /** Cargo marcado no aviso de reunião; vazio = @everyone. */
  mentionRoleId?: string | undefined;
}

const COLORS = {
  live: 0xed4245,
  open: 0x57f287,
  scheduled: 0x5865f2,
  ended: 0x747f8d,
  canceled: 0x747f8d,
} as const;

const FOOTER = { text: 'Acelera DEV · Screem' };

export const roomUrl = (webUrl: string, roomId: string) =>
  `${webUrl.replace(/\/$/, '')}/r/${roomId}`;

const linkButton = (label: string, url: string): Record<string, unknown>[] => [
  { type: 1, components: [{ type: 2, style: 5, label, url }] },
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
          title: '⚫ Live encerrada',
          description: `A sala de ${channel} foi encerrada.`,
          color: COLORS.ended,
          footer: FOOTER,
        },
      ],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }

  return {
    embeds: [
      {
        title: `🔴 Live aberta: ${room.title.replace(/^Live - /, '')}`,
        description:
          `<@${room.createdBy}> iniciou uma sala. Entre no canal de voz e abra o Screem ` +
          'para transmitir câmera e tela.',
        color: COLORS.live,
        fields: [
          { name: 'Participantes', value: String(ctx.participants), inline: true },
          { name: 'Canal', value: channel, inline: true },
        ],
        footer: FOOTER,
      },
    ],
    components: linkButton('Abrir sala', roomUrl(ctx.webUrl, room.id)),
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
    footer: FOOTER,
  });

  if (room.status === 'ENDED') {
    return {
      embeds: [base(`⚫ Reunião encerrada: ${room.title}`, COLORS.ended, [])],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }
  if (room.status === 'CANCELED') {
    return {
      embeds: [base(`🚫 Reunião cancelada: ${room.title}`, COLORS.canceled, [])],
      components: [],
      allowed_mentions: { parse: [] },
    };
  }

  const open = room.status === 'OPEN';
  const embed = base(
    open ? `🟢 Reunião aberta agora: ${room.title}` : `📅 Reunião: ${room.title}`,
    open ? COLORS.open : COLORS.scheduled,
    [
      { name: 'Quando', value: when, inline: false },
      { name: 'Quem pode entrar', value: who, inline: false },
    ],
  );

  // A menção só vale na mensagem inicial; edições não notificam de novo.
  const mention = ctx.mentionRoleId ? `<@&${ctx.mentionRoleId}>` : '@everyone';
  return {
    content: mention,
    embeds: [embed],
    components: linkButton(open ? 'Entrar na reunião' : 'Ver sala', url),
    allowed_mentions: ctx.mentionRoleId ? { roles: [ctx.mentionRoleId] } : { parse: ['everyone'] },
  };
}
