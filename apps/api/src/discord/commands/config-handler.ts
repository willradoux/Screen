import type { SettingsRepo } from '../../modules/settings/settings.types.js';
import type { DiscordGateway } from '../gateway.js';
import { UserError, type CommandCall, type CommandContext, type CommandReply } from './types.js';

export interface ConfigHandlerDeps {
  settings: SettingsRepo;
  gateway: DiscordGateway;
  guildId: string;
}

const ROLE_FIELDS = {
  'cargo-admin': { field: 'adminRoleIds', label: 'administradores' },
  'cargo-mod': { field: 'modRoleIds', label: 'moderadores' },
  'cargo-reuniao': { field: 'meetingAllowedRoleIds', label: 'quem pode entrar em reuniões' },
} as const;

function requireString(call: CommandCall, name: string): string {
  const value = call.options[name];
  if (typeof value !== 'string' || !value) throw new UserError(`Faltou a opção "${name}".`);
  return value;
}

/** `/config ...` — só ADMIN (a checagem é feita pelo roteador). */
export class ConfigHandler {
  constructor(private readonly deps: ConfigHandlerDeps) {}

  async handle(ctx: CommandContext, call: CommandCall): Promise<CommandReply> {
    const { settings, gateway, guildId } = this.deps;

    switch (call.sub) {
      case 'categoria-live': {
        const id = requireString(call, 'categoria');
        const channel = await gateway.getChannel(id);
        if (channel?.kind !== 'category')
          throw new UserError('Escolha uma **categoria** de canais.');
        await settings.update(guildId, { liveCategoryId: id }, ctx.userId);
        return {
          content: `✅ Categoria de lives definida: **${channel.name}**. Os canais de voz dela passam a abrir salas.`,
        };
      }

      case 'canal-live': {
        const id = requireString(call, 'canal');
        const channel = await gateway.getChannel(id);
        if (channel?.kind !== 'text') throw new UserError('Escolha um **canal de texto**.');
        await settings.update(guildId, { liveTextChannelId: id }, ctx.userId);
        return { content: `✅ Os embeds das lives serão enviados em <#${id}>.` };
      }

      case 'canal-avisos': {
        const id = requireString(call, 'canal');
        const channel = await gateway.getChannel(id);
        if (channel?.kind !== 'text') throw new UserError('Escolha um **canal de texto**.');
        await settings.update(guildId, { announceChannelId: id }, ctx.userId);
        return { content: `✅ Os avisos de reunião serão enviados em <#${id}>.` };
      }

      case 'cargo-admin':
      case 'cargo-mod':
      case 'cargo-reuniao': {
        const { field, label } = ROLE_FIELDS[call.sub];
        const action = requireString(call, 'acao');
        if (action !== 'adicionar' && action !== 'remover') {
          throw new UserError('A ação deve ser "adicionar" ou "remover".');
        }
        const roleId = requireString(call, 'cargo');
        if (action === 'adicionar' && !(await gateway.roleExists(roleId))) {
          throw new UserError('Esse cargo não existe neste servidor.');
        }
        // Tirar a si mesmo do último cargo de admin não tranca ninguém para fora:
        // dono, permissões do Discord e BOOTSTRAP_ADMIN_IDS continuam valendo.
        const updated = await settings.modifyList(
          guildId,
          field,
          action === 'adicionar' ? 'add' : 'remove',
          roleId,
          ctx.userId,
        );
        const list = updated[field].map((r) => `<@&${r}>`).join(', ') || '_ninguém_';
        return {
          content: `✅ ${action === 'adicionar' ? 'Adicionado' : 'Removido'}: <@&${roleId}>.\n**${label}:** ${list}`,
        };
      }

      case 'limite-live': {
        const max = call.options.max;
        if (typeof max !== 'number' || !Number.isInteger(max) || max < 2 || max > 100) {
          throw new UserError('O limite deve ser um número inteiro entre 2 e 100.');
        }
        await settings.update(guildId, { maxParticipantsLive: max }, ctx.userId);
        return {
          content: `✅ Limite das lives: **${max}** participantes (vale para as próximas salas).`,
        };
      }

      case 'ver': {
        const s = await settings.get(guildId);
        const channel = (id: string | null) => (id ? `<#${id}>` : '_não definido_');
        const roles = (ids: string[]) => ids.map((r) => `<@&${r}>`).join(', ') || '_ninguém_';
        return {
          content: [
            '**Configuração do Screem**',
            `Categoria de lives: ${s.liveCategoryId ? `<#${s.liveCategoryId}>` : '_não definida_'}`,
            `Canal dos embeds de live: ${channel(s.liveTextChannelId)}`,
            `Canal de avisos: ${channel(s.announceChannelId)}`,
            `Administradores: ${roles(s.adminRoleIds)}`,
            `Moderadores: ${roles(s.modRoleIds)}`,
            `Podem entrar em reuniões: ${s.meetingAllowedRoleIds.length ? roles(s.meetingAllowedRoleIds) : '_todos os membros_'}`,
            `Limite das lives: ${s.maxParticipantsLive} · Tolerância ao sair da call: ${s.graceSeconds}s`,
          ].join('\n'),
        };
      }

      default:
        throw new UserError('Subcomando desconhecido.');
    }
  }
}
