import { SlashCommandBuilder, ChannelType } from 'discord.js';

/**
 * Definição dos slash commands (registrados por guilda ao iniciar, o que é
 * instantâneo). A permissão real é checada no servidor; aqui só descrevemos.
 */
export function buildCommandDefinitions() {
  const config = new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configura o Screem (somente administradores)')
    .setContexts(0) // 0 = somente em servidores
    .addSubcommand((s) =>
      s
        .setName('categoria-live')
        .setDescription('Categoria cujos canais de voz abrem salas de live')
        .addChannelOption((o) =>
          o
            .setName('categoria')
            .setDescription('A categoria de lives')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('canal-live')
        .setDescription('Canal de texto onde o bot envia os embeds das lives')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal de texto')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('canal-avisos')
        .setDescription('Canal de texto dos avisos de reunião')
        .addChannelOption((o) =>
          o
            .setName('canal')
            .setDescription('Canal de texto')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    );

  for (const [name, description] of [
    ['cargo-admin', 'Cargos que são administradores do Screem'],
    ['cargo-mod', 'Cargos que são moderadores do Screem'],
    ['cargo-reuniao', 'Cargos que podem entrar nas reuniões (vazio = todos)'],
  ] as const) {
    config.addSubcommand((s) =>
      s
        .setName(name)
        .setDescription(description)
        .addStringOption((o) =>
          o
            .setName('acao')
            .setDescription('Adicionar ou remover')
            .addChoices(
              { name: 'adicionar', value: 'adicionar' },
              { name: 'remover', value: 'remover' },
            )
            .setRequired(true),
        )
        .addRoleOption((o) => o.setName('cargo').setDescription('O cargo').setRequired(true)),
    );
  }

  config
    .addSubcommand((s) =>
      s
        .setName('limite-live')
        .setDescription('Máximo de participantes por live')
        .addIntegerOption((o) =>
          o
            .setName('max')
            .setDescription('Entre 2 e 100')
            .setMinValue(2)
            .setMaxValue(100)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) => s.setName('ver').setDescription('Mostra a configuração atual'));

  const reuniao = new SlashCommandBuilder()
    .setName('reuniao')
    .setDescription('Reuniões no Screem')
    .setContexts(0)
    .addSubcommand((s) =>
      s
        .setName('criar')
        .setDescription('Cria e abre uma reunião agora')
        .addStringOption((o) =>
          o.setName('titulo').setDescription('Título').setRequired(true).setMaxLength(100),
        )
        .addStringOption((o) =>
          o.setName('descricao').setDescription('Pauta ou descrição').setMaxLength(1000),
        )
        .addBooleanOption((o) =>
          o.setName('avisar').setDescription('Enviar aviso no canal de avisos (padrão: sim)'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('agendar')
        .setDescription('Agenda uma reunião')
        .addStringOption((o) =>
          o.setName('titulo').setDescription('Título').setRequired(true).setMaxLength(100),
        )
        .addStringOption((o) =>
          o.setName('data').setDescription('DD/MM/AAAA').setRequired(true).setMaxLength(10),
        )
        .addStringOption((o) =>
          o
            .setName('hora')
            .setDescription('HH:mm (horário de Brasília)')
            .setRequired(true)
            .setMaxLength(5),
        )
        .addStringOption((o) =>
          o.setName('descricao').setDescription('Pauta ou descrição').setMaxLength(1000),
        )
        .addStringOption((o) =>
          o
            .setName('lembretes')
            .setDescription('Minutos antes, separados por vírgula (padrão: 1440,60,5; 0 = nenhum)')
            .setMaxLength(40),
        )
        .addBooleanOption((o) =>
          o.setName('avisar').setDescription('Enviar aviso no canal de avisos (padrão: sim)'),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('reagendar')
        .setDescription('Muda o horário de uma reunião agendada')
        .addStringOption((o) =>
          o.setName('reuniao').setDescription('A reunião').setRequired(true).setAutocomplete(true),
        )
        .addStringOption((o) =>
          o.setName('data').setDescription('DD/MM/AAAA').setRequired(true).setMaxLength(10),
        )
        .addStringOption((o) =>
          o
            .setName('hora')
            .setDescription('HH:mm (horário de Brasília)')
            .setRequired(true)
            .setMaxLength(5),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('cancelar')
        .setDescription('Cancela uma reunião agendada')
        .addStringOption((o) =>
          o.setName('reuniao').setDescription('A reunião').setRequired(true).setAutocomplete(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName('encerrar')
        .setDescription('Encerra uma reunião aberta')
        .addStringOption((o) =>
          o
            .setName('reuniao')
            .setDescription('A reunião (padrão: a única aberta)')
            .setAutocomplete(true),
        ),
    )
    .addSubcommand((s) => s.setName('listar').setDescription('Lista as próximas reuniões'));

  return [config.toJSON(), reuniao.toJSON()];
}
