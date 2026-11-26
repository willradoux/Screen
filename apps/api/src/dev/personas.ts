/*
 * Modo de desenvolvimento (DEV_FAKE_DISCORD=true): um "servidor do Discord" de mentira, com
 * pessoas, cargos e canais fixos, para rodar o Screen inteiro no computador sem Discord, sem bot e
 * sem internet. Nunca é usado em produção (o env recusa).
 */

/** IDs no formato do Discord (snowflake), fixos para o banco local continuar valendo. */
export const DEV_GUILD_ID = '900000000000000000';
export const DEV_CLIENT_ID = '900000000000000001';
export const DEV_ADMIN_ROLE = '900000000000000010';
export const DEV_MOD_ROLE = '900000000000000011';
export const DEV_CATEGORY = '900000000000000020';
/** A call de voz que vira live quando alguém "entra" nela. */
export const DEV_VOICE_CHANNEL = '900000000000000021';
export const DEV_VOICE_CHANNEL_2 = '900000000000000022';
/** Chat de texto (avisos de reunião e logs). */
export const DEV_TEXT_CHANNEL = '900000000000000023';

export interface DevPersona {
  id: string;
  username: string;
  name: string;
  roles: string[];
  /** Dono do servidor (como o Will no Acelera). */
  owner?: boolean;
}

export const DEV_PERSONAS: DevPersona[] = [
  {
    id: '910000000000000001',
    username: 'will',
    name: 'Will',
    roles: [DEV_ADMIN_ROLE],
    owner: true,
  },
  { id: '910000000000000002', username: 'ana', name: 'Ana', roles: [DEV_MOD_ROLE] },
  { id: '910000000000000003', username: 'beto', name: 'Beto', roles: [] },
  { id: '910000000000000004', username: 'caio', name: 'Caio', roles: [] },
  { id: '910000000000000005', username: 'duda', name: 'Duda', roles: [] },
];

export const devPersona = (id: string) => DEV_PERSONAS.find((p) => p.id === id) ?? null;

export const DEV_CHANNELS = [
  { id: DEV_CATEGORY, name: 'Calls', kind: 'category' as const, parentId: null },
  { id: DEV_VOICE_CHANNEL, name: 'call-geral', kind: 'voice' as const, parentId: DEV_CATEGORY },
  { id: DEV_VOICE_CHANNEL_2, name: 'estudos', kind: 'voice' as const, parentId: DEV_CATEGORY },
  { id: DEV_TEXT_CHANNEL, name: 'avisos', kind: 'text' as const, parentId: DEV_CATEGORY },
];
