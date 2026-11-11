import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Room } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
const SECTIONS = {
    audio: [
        { kind: 'audioinput', label: 'Microfone', icon: 'mic' },
        { kind: 'audiooutput', label: 'Saída de som', icon: 'record_voice_over' },
    ],
    video: [{ kind: 'videoinput', label: 'Câmera', icon: 'videocam' }],
};
/** O navegador deixa escolher a saída de som? (Firefox e Safari, em geral, não.) */
const canPickOutput = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
/**
 * Menu para trocar de aparelho sem sair da sala: microfone e saída de som (áudio) ou câmera
 * (vídeo). Mostra o nome que o sistema dá a cada aparelho e marca o que está em uso.
 * Fecha com Esc ou clicando fora.
 */
export function DeviceMenu({ room, kind, onClose, onError, }) {
    const ref = useRef(null);
    const [devices, setDevices] = useState({});
    const [active, setActive] = useState({});
    useEffect(() => {
        let alive = true;
        const load = async () => {
            const next = {};
            const current = {};
            for (const section of SECTIONS[kind]) {
                if (section.kind === 'audiooutput' && !canPickOutput())
                    continue;
                try {
                    next[section.kind] = await Room.getLocalDevices(section.kind, false);
                }
                catch {
                    next[section.kind] = [];
                }
                current[section.kind] = room.getActiveDevice(section.kind);
            }
            if (alive) {
                setDevices(next);
                setActive(current);
            }
        };
        void load();
        // Plugou ou tirou um fone/câmera: atualiza a lista.
        navigator.mediaDevices?.addEventListener?.('devicechange', load);
        return () => {
            alive = false;
            navigator.mediaDevices?.removeEventListener?.('devicechange', load);
        };
    }, [kind, room]);
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose();
        const onDown = (e) => {
            if (ref.current && !ref.current.contains(e.target))
                onClose();
        };
        window.addEventListener('keydown', onKey);
        window.addEventListener('pointerdown', onDown, true);
        return () => {
            window.removeEventListener('keydown', onKey);
            window.removeEventListener('pointerdown', onDown, true);
        };
    }, [onClose]);
    async function choose(deviceKind, deviceId) {
        try {
            await room.switchActiveDevice(deviceKind, deviceId);
            setActive((a) => ({ ...a, [deviceKind]: deviceId }));
        }
        catch {
            onError('Não foi possível trocar de aparelho. Veja se ele está ligado e livre.');
        }
    }
    return (_jsx("div", { ref: ref, role: "dialog", "aria-label": kind === 'audio' ? 'Aparelhos de áudio' : 'Aparelhos de vídeo', className: "device-menu", children: SECTIONS[kind].map((section) => {
            const list = devices[section.kind];
            if (!list)
                return null;
            return (_jsxs("div", { className: "space-y-1", children: [_jsxs("p", { className: "flex items-center gap-1.5 px-2 text-[11px] font-semibold text-zinc-500", children: [_jsx(Icon, { name: section.icon, size: "0.95rem" }), section.label] }), list.length === 0 ? (_jsx("p", { className: "px-2 pb-1 text-xs text-zinc-500", children: "Nenhum aparelho encontrado. Permita o acesso no navegador e tente de novo." })) : (_jsx("div", { role: "radiogroup", "aria-label": section.label, className: "space-y-0.5", children: list.map((d, i) => {
                            const on = active[section.kind] === d.deviceId ||
                                (!active[section.kind] && d.deviceId === 'default');
                            return (_jsxs("button", { type: "button", role: "radio", "aria-checked": on, onClick: () => void choose(section.kind, d.deviceId), className: "device-option", "data-on": on || undefined, children: [_jsx("span", { className: "min-w-0 flex-1 truncate text-left", children: d.label || `${section.label} ${i + 1}` }), on && _jsx(Icon, { name: "check", size: "1rem", className: "text-brand-300" })] }, d.deviceId || i));
                        }) }))] }, section.kind));
        }) }));
}
/** Estado da permissão do navegador para microfone ou câmera (`denied` mostra o aviso). */
export function usePermission(name) {
    const [state, setState] = useState(null);
    useEffect(() => {
        let status = null;
        const update = () => status && setState(status.state);
        navigator.permissions
            ?.query({ name: name })
            .then((s) => {
            status = s;
            update();
            s.addEventListener('change', update);
        })
            .catch(() => undefined); // navegador sem essa consulta: sem aviso
        return () => status?.removeEventListener('change', update);
    }, [name]);
    return state;
}
