/**
 * Traduz o erro do navegador ao ligar câmera, microfone ou tela em um texto útil.
 * Devolve `null` quando não vale mostrar nada (ex.: a pessoa só fechou a janela de
 * escolha da tela).
 */
export function mediaErrorMessage(
  err: unknown,
  kind: 'microphone' | 'camera' | 'screen',
): string | null {
  const name = err instanceof Error ? err.name : '';
  const label = { microphone: 'o microfone', camera: 'a câmera', screen: 'a tela' }[kind];

  if (kind === 'screen' && (name === 'NotAllowedError' || name === 'AbortError')) {
    // Fechar o seletor de tela não é erro.
    return null;
  }
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return `O navegador bloqueou ${label}. Libere a permissão no cadeado da barra de endereço e tente de novo.`;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return `Não encontrei ${label} neste dispositivo.`;
    case 'NotReadableError':
      return `Não consegui usar ${label}: outro programa pode estar usando.`;
    default:
      return `Não foi possível ligar ${label}.`;
  }
}

/** Compartilhar tela só existe em navegadores de computador. */
export function canShareScreen(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getDisplayMedia);
}
