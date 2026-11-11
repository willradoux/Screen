import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Icon } from '../components/Icon';
import { NORMAL_PROFILE } from '../lib/bigRoom';
import { canShareScreen, mediaErrorMessage, SCREEN_REFUSED_AT_ONCE } from '../lib/media';
import { canUseSource } from './publish-rules';
import { EffectsPanel } from './EffectsPanel';
import { DeviceMenu, usePermission } from './DeviceMenu';
import { LayoutPicker } from './LayoutPicker';
import { VideoSettings } from './VideoSettings';
import { ThemeToggle } from '../components/ThemeToggle';
const SCREEN_UNSUPPORTED_SHORT = 'Compartilhar tela só funciona no computador.';
/** Botão redondo de controle: ícone, rótulo curto e nome completo para leitores de tela. */
function RoundButton({ icon, short, fullLabel, active = false, danger = false, off = false, disabled = false, busy = false, title, onClick, }) {
    return (_jsx("button", { type: "button", onClick: onClick, disabled: disabled || busy, "aria-label": fullLabel, "aria-pressed": danger ? undefined : active, "aria-busy": busy || undefined, "data-tip": title ?? short, className: "ctl-button disabled:cursor-not-allowed", children: _jsx("span", { className: "ctl", "data-on": active || undefined, "data-off": off || undefined, "data-danger": danger || undefined, children: _jsx(Icon, { name: busy ? 'progress_activity' : icon, size: "1.35rem", className: busy ? 'animate-spin' : '' }) }) }));
}
/**
 * Barra de controles. Microfone, câmera e tela são independentes: dá para transmitir só a
 * câmera, só a tela, ou as duas ao mesmo tempo. Tudo começa desligado.
 */
export function Controls({ local, allowedSources, restriction, panelOpen, onTogglePanel, onLeave, onError, hand, captions, layout, variant = 'media', room, profile = NORMAL_PROFILE, }) {
    const [menu, setMenu] = useState(null);
    const micPermission = usePermission('microphone');
    const camPermission = usePermission('camera');
    const [busy, setBusy] = useState(null);
    const screenSupported = canShareScreen();
    async function toggle(kind) {
        setBusy(kind);
        const startedAt = Date.now();
        try {
            if (kind === 'microphone')
                await local.setMicrophoneEnabled(!local.isMicrophoneEnabled, profile.microphone.capture, profile.microphone.publish);
            else if (kind === 'camera') {
                await local.setCameraEnabled(!local.isCameraEnabled, profile.camera.capture, profile.camera.publish);
            }
            else {
                await local.setScreenShareEnabled(!local.isScreenShareEnabled, profile.screen.capture, profile.screen.publish);
            }
        }
        catch (err) {
            let message = mediaErrorMessage(err, kind);
            // Fechar a janela de escolha da tela não é erro; recusar na hora (sem janela) é.
            if (!message &&
                kind === 'screen' &&
                err instanceof Error &&
                err.name === 'NotAllowedError' &&
                Date.now() - startedAt < 500) {
                message = SCREEN_REFUSED_AT_ONCE;
            }
            if (message)
                onError(message);
        }
        finally {
            setBusy(null);
        }
    }
    const blocked = restriction !== null;
    const disabled = (source) => blocked || !canUseSource(allowedSources, source);
    const mic = local.isMicrophoneEnabled;
    const cam = local.isCameraEnabled;
    const screen = local.isScreenShareEnabled;
    // Trilho da esquerda ("Mais opções"): conversa, pessoas e ajustes, um embaixo do outro.
    if (variant === 'rail') {
        return (_jsxs("div", { role: "group", "aria-label": "Op\u00E7\u00F5es da sala", className: "rail-tools", children: [_jsx(RoundButton, { icon: "group", short: "Pessoas", fullLabel: "Pessoas", active: panelOpen, onClick: onTogglePanel }), hand && (_jsx(RoundButton, { icon: "front_hand", short: hand.raised ? 'Abaixar a mão' : 'Pedir a palavra', fullLabel: hand.raised ? 'Abaixar a mão' : 'Pedir a palavra', active: hand.raised, busy: hand.busy, onClick: hand.onToggle })), layout && _jsx(LayoutPicker, { value: layout.value, onChange: layout.onChange }), _jsx(VideoSettings, {}), _jsx(ThemeToggle, { variant: "ctl" })] }));
    }
    // Pílula de baixo: só a voz, a imagem e a tela, "Mais opções" e sair.
    return (_jsxs("div", { role: "toolbar", "aria-label": "Controles da sala", className: "relative flex flex-col items-center", children: [menu && room && (_jsx(DeviceMenu, { room: room, kind: menu, onClose: () => setMenu(null), onError: onError })), _jsxs("div", { className: "ctl-row", children: [_jsxs("div", { className: "ctl-group", role: "group", "aria-label": "M\u00EDdia", children: [_jsxs("span", { className: "ctl-split", children: [room && (_jsx(DeviceToggle, { label: "Trocar aparelho de \u00E1udio", open: menu === 'audio', onClick: () => setMenu((m) => (m === 'audio' ? null : 'audio')) })), _jsxs("span", { className: "relative", children: [_jsx(RoundButton, { icon: mic ? 'mic' : 'mic_off', short: micPermission === 'denied'
                                                    ? 'Permissão necessária'
                                                    : mic
                                                        ? 'Desligar microfone'
                                                        : 'Ligar microfone', fullLabel: `Microfone: ${mic ? 'ligado' : 'desligado'}${micPermission === 'denied' ? ' (permissão necessária no navegador)' : ''}`, active: mic, off: !mic, disabled: disabled('microphone'), title: restriction ?? undefined, busy: busy === 'microphone', onClick: () => void toggle('microphone') }), micPermission === 'denied' && _jsx(PermissionBadge, {})] })] }), _jsxs("span", { className: "ctl-split", children: [room && (_jsx(DeviceToggle, { label: "Trocar aparelho de v\u00EDdeo", open: menu === 'video', onClick: () => setMenu((m) => (m === 'video' ? null : 'video')) })), _jsxs("span", { className: "relative", children: [_jsx(RoundButton, { icon: cam ? 'videocam' : 'videocam_off', short: camPermission === 'denied'
                                                    ? 'Permissão necessária'
                                                    : cam
                                                        ? 'Desligar câmera'
                                                        : 'Ligar câmera', fullLabel: `Câmera: ${cam ? 'ligada' : 'desligada'}${camPermission === 'denied' ? ' (permissão necessária no navegador)' : ''}`, active: cam, off: !cam, disabled: disabled('camera'), title: restriction ?? undefined, busy: busy === 'camera', onClick: () => void toggle('camera') }), camPermission === 'denied' && _jsx(PermissionBadge, {})] })] }), captions && (_jsx(EffectsPanel, { local: local, captionsOn: captions.on, onToggleCaptions: captions.onToggle, onError: onError })), _jsx(RoundButton, { icon: screen ? 'stop_screen_share' : 'screen_share', short: screen ? 'Parar de compartilhar' : 'Compartilhar tela', fullLabel: `Tela: ${screen ? 'compartilhando' : 'parada'}`, active: screen, disabled: !screenSupported || disabled('screen_share'), title: screenSupported ? (restriction ?? undefined) : SCREEN_UNSUPPORTED_SHORT, busy: busy === 'screen', onClick: () => void toggle('screen') })] }), _jsx(RoundButton, { icon: "call_end", short: "Sair da sala", fullLabel: "Sair da sala", danger: true, onClick: onLeave })] }), restriction && (_jsx("p", { className: "mt-1.5 px-3 text-center text-[11px] text-amber-300", role: "status", children: restriction }))] }));
}
/** Setinha colada no botão: abre a escolha de aparelho (como no Meet). */
function DeviceToggle({ label, open, onClick, }) {
    return (_jsx("button", { type: "button", "aria-label": label, "aria-haspopup": "dialog", "aria-expanded": open, "data-tip": label, onClick: onClick, className: "ctl-button ctl-chevron", "data-open": open || undefined, children: _jsx(Icon, { name: open ? 'keyboard_arrow_down' : 'keyboard_arrow_up', size: "1.05rem" }) }));
}
/** "!" amarelo: o navegador bloqueou o acesso. */
function PermissionBadge() {
    return (_jsx("span", { "aria-hidden": "true", className: "perm-badge", title: "Permiss\u00E3o necess\u00E1ria", children: "!" }));
}
