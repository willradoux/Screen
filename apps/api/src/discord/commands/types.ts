import type { Role } from '@screem/shared';

/** Quem executou o comando. */
export interface CommandActor {
  userId: string;
  memberRoleIds: string[];
}

/** Comando já "achatado" a partir da interação do discord.js. */
export interface CommandCall {
  /** Nome do comando: `config` ou `reuniao`. */
  command: string;
  /** Subcomando, ex.: `canal-avisos`, `agendar`. */
  sub: string;
  /** Opções por nome. Canais e cargos chegam como ID. */
  options: Record<string, string | number | boolean | undefined>;
}

export interface CommandReply {
  content: string;
}

/** Erro para o usuário: vira a resposta do comando, sem stack trace. */
export class UserError extends Error {}

export interface CommandContext extends CommandActor {
  role: Role;
}

export interface AutocompleteChoice {
  name: string;
  value: string;
}
