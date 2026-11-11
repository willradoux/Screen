import type { AuditEntry } from '../modules/audit/audit.service.js';
import type { SettingsRepo } from '../modules/settings/settings.types.js';
import type { Logger } from '../shared/logger.js';
import type { OpsEvent } from '../shared/ops-log.js';
import type { DiscordGateway } from './gateway.js';

const COLORS = { info: 0x3b82f6, warn: 0xf59e0b, error: 0xef4444 } as const;

/** Frase humana de cada ação auditada, para o canal de logs. */
export const AUDIT_LABELS: Record<string, string> = {
  PARTICIPANT_MUTED: 'silenciou',
  PARTICIPANT_UNMUTED: 'liberou o áudio de',
  PARTICIPANT_KICKED: 'expulsou',
  PARTICIPANT_BANNED: 'baniu',
  BAN_REMOVED: 'removeu o banimento de',
  SPEAKER_PROMOTED: 'tornou palestrante',
  SPEAKER_DEMOTED: 'tirou de palestrante',
  ROOM_ENDED: 'encerrou a sala',
  ROOM_UPDATED: 'editou a sala',
  MEETING_CREATED: 'criou uma reunião',
  MEETING_UPDATED: 'editou uma reunião',
  MEETING_CANCELED: 'cancelou uma reunião',
  MEETING_OPENED: 'abriu uma reunião',
  MEETING_ANNOUNCED: 'divulgou uma reunião',
  MEETING_MUTE_ALL: 'silenciou todos na reunião',
  MEETING_CAMERAS_OFF: 'desligou todas as câmeras na reunião',
  SETTINGS_UPDATED: 'alterou as configurações',
  PANEL_USER_ADDED: 'deu acesso ao painel a',
  PANEL_USER_REMOVED: 'tirou o acesso ao painel de',
  SESSION_REVOKED: 'revogou a sessão de',
  USER_BLOCKED: 'bloqueou',
  SESSION_IDLE: 'sessão de vídeo em espera (ninguém usando)',
  SESSION_ACTIVATED: '▶sessão de vídeo ativada',
};

export interface OpsLoggerDeps {
  gateway: Pick<DiscordGateway, 'sendMessage'>;
  settings: SettingsRepo;
  guildId: string;
  logger: Logger;
}

/**
 * Manda para o canal de logs (escolhido no painel) o que a equipe precisa saber: ações dos
 * admins/mods e erros do sistema. Tudo best-effort e em fila: se o canal não está configurado ou
 * o bot não consegue escrever, só registra no log do servidor. Nunca menciona ninguém.
 */
export class DiscordOpsLogger {
  private chain: Promise<unknown> = Promise.resolve();
  /** Evita inundar o canal com o mesmo erro repetido. */
  private readonly recent = new Map<string, number>();

  constructor(
    private readonly deps: OpsLoggerDeps,
    private readonly now: () => number = Date.now,
  ) {}

  /** Ação auditada. */
  fromAudit = (entry: AuditEntry & { at: Date }): void => {
    const label = AUDIT_LABELS[entry.action] ?? entry.action;
    const actor = entry.actorId === 'system' ? 'O sistema' : `<@${entry.actorId}>`;
    const target = entry.targetId ? ` <@${entry.targetId}>` : '';
    const lines = [`${actor} ${label}${target}`];
    if (entry.reason) lines.push(`Motivo: ${entry.reason}`);
    const meta = entry.meta ?? {};
    if (typeof meta.reason === 'string') lines.push(`Motivo: ${meta.reason}`);
    this.enqueue({
      level: 'info',
      title: 'Registro',
      description: lines.join('\n'),
      ...(entry.roomId ? { fields: [{ name: 'Sala', value: entry.roomId }] } : {}),
    });
  };

  /** Erro ou aviso do sistema. */
  fromOps = (event: OpsEvent): void => {
    if (event.level !== 'info') {
      // Mesmo erro em menos de 5 minutos: só o primeiro vai para o Discord.
      const key = `${event.level}|${event.title}`;
      const last = this.recent.get(key);
      if (last !== undefined && this.now() - last < 5 * 60_000) return;
      this.recent.set(key, this.now());
    }
    this.enqueue(event);
  };

  private enqueue(event: OpsEvent): void {
    this.chain = this.chain.then(() => this.send(event)).catch(() => undefined);
  }

  private async send(event: OpsEvent): Promise<void> {
    try {
      const { logChannelId } = await this.deps.settings.get(this.deps.guildId);
      if (!logChannelId) return;
      await this.deps.gateway.sendMessage(logChannelId, {
        embeds: [
          {
            title: event.title.slice(0, 256),
            ...(event.description ? { description: event.description.slice(0, 2000) } : {}),
            color: COLORS[event.level],
            ...(event.fields?.length
              ? {
                  fields: event.fields.slice(0, 10).map((f) => ({
                    name: f.name.slice(0, 256),
                    value: f.value.slice(0, 1000),
                    inline: true,
                  })),
                }
              : {}),
            timestamp: new Date(this.now()).toISOString(),
            footer: { text: 'Screen' },
          },
        ],
        components: [],
        allowed_mentions: { parse: [] },
      });
    } catch (err) {
      this.deps.logger.warn({ err }, 'não consegui escrever no canal de logs');
    }
  }
}
