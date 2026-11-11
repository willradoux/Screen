import { isAdmin, isStaff } from '../lib/moderation-rules';
/**
 * Se a pessoa pode ligar câmera, microfone e tela agora. O LiveKit é quem impede de
 * verdade (as permissões do token e as mudanças da moderação); isto só evita botões
 * que não funcionariam e explica o motivo.
 */
export function publishRestriction(state, role, allowedSources) {
    // Palco ligado: ninguém transmite por padrão, nem a moderação, até um admin subir a pessoa.
    if (state.lectureMode && !state.isSpeaker) {
        return isAdmin(role)
            ? 'Palco ligado: suba você mesmo ao palco (em Pessoas) para transmitir.'
            : 'Palco ligado: só quem está no palco pode transmitir.';
    }
    if (isStaff(role))
        return null; // moderação publica fora do palco
    if (state.mutedByModeration)
        return 'A moderação silenciou você.';
    if (allowedSources && allowedSources.length === 0)
        return 'Você não tem permissão para transmitir.';
    return null;
}
/** Cada botão depende de fontes diferentes. Tela precisa de `screen_share`. */
export function canUseSource(allowedSources, source) {
    return !allowedSources || allowedSources.includes(source);
}
