/**
 * Traduz o erro do navegador ao ligar câmera, microfone ou tela em um texto útil.
 * Devolve `null` quando não vale mostrar nada (ex.: a pessoa só fechou a janela de
 * escolha da tela).
 */
export function mediaErrorMessage(err, kind) {
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
/**
 * Celular ou tablet? Nesses aparelhos os navegadores NÃO conseguem compartilhar tela: no Chrome para
 * Android a função existe mas sempre recusa, e no iPhone/iPad não existe. Nenhum ajuste no site muda isso.
 */
export function isMobileDevice() {
    if (typeof navigator === 'undefined')
        return false;
    const nav = navigator;
    if (nav.userAgentData?.mobile)
        return true;
    if (/Android|iPhone|iPad|iPod/i.test(nav.userAgent))
        return true;
    // iPad que se apresenta como Mac.
    return /Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1;
}
/** Compartilhar tela: só em navegadores de computador. */
export function canShareScreen() {
    return (typeof navigator !== 'undefined' &&
        Boolean(navigator.mediaDevices?.getDisplayMedia) &&
        !isMobileDevice());
}
/** Texto para quando a recusa da tela é imediata (sem a pessoa ter visto a janela de escolha). */
export const SCREEN_REFUSED_AT_ONCE = 'O navegador recusou o compartilhamento de tela na hora. Em celular e tablet isso não é possível; no computador, confira se a permissão de tela do site não está bloqueada no cadeado da barra de endereço.';
