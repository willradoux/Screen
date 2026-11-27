import { discordTime } from '../../shared/time.js';
import type { RoomRecord, RoomRepo } from '../../modules/rooms/rooms.types.js';
import type { VoiceCache } from '../voice-cache.js';
import { roomUrl } from '../embeds.js';
import type { CommandCall, CommandContext, CommandReply } from './types.js';

export interface ScreenHandlerDeps {
  rooms: Pick<RoomRepo, 'findOpenLiveByChannel' | 'listOpenLive' | 'listMeetings'>;
  voice: Pick<VoiceCache, 'channelOf'>;
  guildId: string;
  webUrl: string;
}

/** Quantas salas o /screen salas mostra de cada tipo (a resposta do Discord tem limite). */
const MAX_LISTED = 5;

/**
 * `/screen` para qualquer membro (só a própria pessoa vê a resposta):
 *  - `link`: o link da live da call em que a pessoa está agora;
 *  - `salas`: as lives abertas e as próximas reuniões, com o link de cada uma;
 *  - `ajuda`: o que é o Screen e onde aprender a usar.
 * Só lê: não abre, não cria e não muda nada (quem abre a live continua sendo a call).
 */
export class ScreenHandler {
  constructor(private readonly deps: ScreenHandlerDeps) {}

  async handle(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    if (call.sub === 'link') return this.link(ctx);
    if (call.sub === 'salas') return this.rooms();
    return this.help();
  }

  private async link(ctx: CommandContext): Promise<CommandReply> {
    const channel = this.deps.voice.channelOf(ctx.userId);
    if (!channel) {
      return {
        content:
          'Você não está numa call agora. Entre numa call de lives no Discord: a sala abre sozinha e o link chega no chat da call.\n' +
          'Para ver o que já está aberto, use `/screen salas`.',
      };
    }
    const live = await this.deps.rooms.findOpenLiveByChannel(channel);
    if (!live) {
      return {
        content:
          `A call <#${channel}> não tem live aberta (ela não é uma call de lives).\n` +
          'Para ver o que está aberto, use `/screen salas`.',
      };
    }
    return {
      content: `🔴 **${live.title}** em <#${channel}>\n${roomUrl(this.deps.webUrl, live.id)}`,
    };
  }

  private async rooms(): Promise<CommandReply> {
    const [lives, meetings] = await Promise.all([
      this.deps.rooms.listOpenLive(this.deps.guildId),
      this.deps.rooms.listMeetings(this.deps.guildId, ['OPEN', 'SCHEDULED']),
    ]);
    const upcoming = [...meetings].sort(
      (a, b) =>
        (a.status === 'OPEN' ? 0 : 1) - (b.status === 'OPEN' ? 0 : 1) ||
        (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0),
    );
    if (lives.length === 0 && upcoming.length === 0) {
      return {
        content:
          'Nada aberto agora. Entre numa call de lives para abrir uma sala; as reuniões agendadas também aparecem aqui.',
      };
    }
    const lines: string[] = [];
    if (lives.length > 0) {
      lines.push('**Ao vivo agora**');
      for (const r of lives.slice(0, MAX_LISTED)) lines.push(this.line(r));
      if (lives.length > MAX_LISTED) lines.push(`e mais ${lives.length - MAX_LISTED}`);
    }
    if (upcoming.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('**Reuniões**');
      for (const r of upcoming.slice(0, MAX_LISTED)) lines.push(this.line(r));
      if (upcoming.length > MAX_LISTED) lines.push(`e mais ${upcoming.length - MAX_LISTED}`);
    }
    return { content: lines.join('\n') };
  }

  private line(r: RoomRecord): string {
    const url = roomUrl(this.deps.webUrl, r.id);
    if (r.type === 'LIVE') {
      const where = r.voiceChannelId ? ` em <#${r.voiceChannelId}>` : '';
      return `🔴 ${r.title}${where}: ${url}`;
    }
    if (r.status === 'OPEN') return `🟢 ${r.title} (aberta agora): ${url}`;
    const when = r.startsAt ? discordTime(r.startsAt, 'R') : 'sem data';
    return `🗓️ ${r.title} (${when}): ${url}`;
  }

  private help(): CommandReply {
    const site = this.deps.webUrl.replace(/\/$/, '');
    return {
      content:
        '**Screen**: tela, câmera e voz das calls do Acelera DEV, no navegador.\n' +
        '• Lives: entre numa call de lives e abra o link que o bot manda no chat da call.\n' +
        '• Reuniões: aparecem em `/screen salas` e no site, com contagem regressiva.\n' +
        '• `/screen link`: o link da live da sua call.\n' +
        `Site: ${site}\nComo usar: ${site}/features`,
    };
  }
}
