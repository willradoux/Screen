/**
 * "O que fazer" para cada erro da API. A mensagem diz o que aconteceu e por quê; a dica diz
 * o próximo passo. Catálogo completo: docs/backend/erros.md
 */
const HINTS: Record<string, string> = {
  UNAUTHENTICATED: 'Entre com o Discord de novo.',
  FORBIDDEN: 'Peça a um administrador do servidor para liberar o acesso, se isso for um engano.',
  NOT_IN_GUILD: 'Entre no servidor do Discord e tente de novo.',
  ACCOUNT_BLOCKED: 'Fale com a administração do servidor.',
  INVALID_STATE:
    'Volte para a página inicial e clique em Entrar com Discord de novo. Se persistir, ative os cookies.',
  NOT_IN_VOICE: 'Entre no canal de voz da live no Discord e tente de novo.',
  ROLE_NOT_ALLOWED: 'Esta reunião é restrita a alguns cargos. Fale com quem organizou.',
  BANNED_FROM_ROOM: 'Você foi removido desta sala. Fale com quem organizou se foi engano.',
  ROOM_NOT_OPEN: 'Se for uma reunião agendada, volte no horário marcado.',
  ROOM_FULL: 'Aguarde alguém sair e tente de novo.',
  ROOM_NOT_FOUND: 'Confira o link ou volte para a página inicial.',
  RATE_LIMITED: 'Espere alguns segundos antes de tentar de novo.',
  LIVEKIT_UNAVAILABLE:
    'O servidor de vídeo está fora do ar. Tente de novo em instantes; se persistir, avise um administrador.',
  DISCORD_UNAVAILABLE: 'O Discord está instável. Tente de novo em instantes.',
  DISCORD_SEND_FAILED:
    'Dê ao bot as permissões Ver Canal, Enviar Mensagens e Inserir Links nesse canal.',
  ANNOUNCE_CHANNEL_NOT_SET: 'No painel, em Configurações, escolha o canal de avisos.',
  ALREADY_ANNOUNCED: 'Use Enviar de novo se quiser mandar outra mensagem.',
  MODERATION_ONLY_IN_MEETINGS: 'Para moderar uma call, use as ferramentas do próprio Discord.',
  HIERARCHY_VIOLATION: 'Peça a alguém com papel mais alto para fazer isso.',
  INVALID_DISCORD_REFERENCE: 'Escolha o item na lista; ele pode ter sido apagado no Discord.',
  VALIDATION_ERROR: 'Confira os campos destacados e tente de novo.',
  INVALID_JSON: 'Recarregue a página e tente de novo.',
  PAYLOAD_TOO_LARGE: 'Envie menos dados de uma vez.',
  INTERNAL_ERROR:
    'Tente de novo. Se continuar, avise um administrador informando o código do erro.',
};

export const errorHint = (code: string): string | undefined => HINTS[code];
