import { ApiError } from './api';

/**
 * Mensagens para a pessoa, por código de erro. O frontend decide pelo `code`
 * (o `message` da API é só um reserva). Catálogo: docs/backend/erros.md.
 */
const MESSAGES: Record<string, string> = {
  // login
  NOT_IN_GUILD: 'Você precisa estar no servidor Acelera DEV para usar o Screen.',
  ACCOUNT_BLOCKED: 'Sua conta está bloqueada.',
  ACCESS_DENIED: 'Você cancelou a autorização no Discord.',
  INVALID_STATE: 'A sessão de login expirou. Tente entrar de novo.',
  DISCORD_OAUTH_FAILED: 'O Discord recusou o login. Tente novamente.',
  DISCORD_UNAVAILABLE: 'O Discord está indisponível no momento. Tente novamente em instantes.',
  // sessão e permissões
  UNAUTHENTICATED: 'Faça login para continuar.',
  FORBIDDEN: 'Você não tem permissão para isso.',
  HIERARCHY_VIOLATION: 'Você não pode moderar alguém com papel igual ou superior ao seu.',
  CANNOT_TARGET_SELF: 'Você não pode fazer isso consigo mesmo.',
  // salas
  ROOM_NOT_FOUND: 'Essa sala não existe.',
  ROOM_NOT_OPEN: 'Essa sala não está aberta.',
  ROOM_FULL: 'A sala está lotada.',
  ROOM_ALREADY_ENDED: 'A sala já foi encerrada.',
  NOT_IN_VOICE: 'Entre no canal de voz da live no Discord para participar.',
  ROLE_NOT_ALLOWED: 'Seu cargo não tem acesso a esta reunião.',
  BANNED_FROM_ROOM: 'Você foi removido desta sala.',
  PARTICIPANT_NOT_IN_ROOM: 'Essa pessoa não está mais na sala.',
  LIVEKIT_UNAVAILABLE: 'O servidor de vídeo está indisponível. Tente novamente em instantes.',
  // reuniões e configuração
  STARTS_AT_IN_PAST: 'O horário precisa estar pelo menos 2 minutos no futuro.',
  ANNOUNCE_CHANNEL_NOT_SET: 'Configure o canal de avisos antes de criar uma reunião com aviso.',
  MEETING_NOT_EDITABLE: 'Essa reunião não pode mais ser alterada.',
  REPORT_NOT_AVAILABLE: 'O relatório só fica pronto depois que a reunião termina.',
  INVALID_DISCORD_REFERENCE: 'Esse canal ou cargo não existe no servidor (ou é do tipo errado).',
  VALIDATION_ERROR: 'Confira os campos e tente de novo.',
  RATE_LIMITED: 'Muitas tentativas. Aguarde um instante.',
  MODERATION_ONLY_IN_MEETINGS:
    'Moderação só existe em reuniões. Nas lives cada pessoa controla a própria transmissão.',
  ALREADY_ANNOUNCED: 'Esta reunião já foi divulgada.',
  DISCORD_SEND_FAILED: 'Não consegui enviar a mensagem no Discord.',
  // rede
  NETWORK_ERROR: 'Sem conexão com o servidor. Verifique sua internet.',
  INTERNAL_ERROR: 'Erro interno. Tente novamente.',
};

/** Texto amigável para um código; se desconhecido, usa o `fallback` (ou uma frase genérica). */
export function messageFor(code: string | null | undefined, fallback?: string): string {
  return (code && MESSAGES[code]) || fallback || 'Algo deu errado. Tente novamente.';
}

/** Texto para qualquer erro capturado (`ApiError` ou não). */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const base = messageFor(err.code, err.message);
    // A API diz também o que fazer a respeito; sem isso a pessoa fica sem saber o próximo passo.
    return err.hint && !base.includes(err.hint) ? `${base} ${err.hint}` : base;
  }
  return 'Algo deu errado. Tente novamente.';
}

/** Código do erro para a pessoa passar ao suporte (aparece nos logs do servidor). */
export const supportCode = (err: unknown): string | null =>
  err instanceof ApiError ? (err.requestId ?? null) : null;

export const errorCode = (err: unknown): string | null =>
  err instanceof ApiError ? err.code : null;
