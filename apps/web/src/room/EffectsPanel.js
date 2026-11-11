import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Track } from 'livekit-client';
import { useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { applyBackground, BACKGROUND_IMAGES, backgroundSupported } from '../lib/videoEffects';
import { createVoiceProcessor, VOICE_PRESETS } from '../lib/voiceEffects';
import { speechSupported } from './captions';
function Chip({ active, children, onClick, disabled, }) {
    return (_jsx("button", { type: "button", disabled: disabled, "aria-pressed": active, onClick: onClick, className: `rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${active ? 'bg-zinc-50 text-zinc-950' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'}`, children: children }));
}
/** Efeitos: fundo da câmera, voz e legendas. Tudo acontece no seu navegador. */
export function EffectsPanel({ local, captionsOn, onToggleCaptions, onError }) {
    const [open, setOpen] = useState(false);
    const [bg, setBg] = useState('none');
    const [voice, setVoice] = useState('none');
    const [busy, setBusy] = useState(null);
    const fileRef = useRef(null);
    async function pickBackground(id, choice) {
        const cam = local.getTrackPublication(Track.Source.Camera)?.track;
        if (!cam)
            return onError('Ligue a câmera primeiro para usar um fundo.');
        setBusy(`bg-${id}`);
        try {
            if (choice.kind !== 'none' && !(await backgroundSupported())) {
                return onError('Este navegador não consegue recortar o fundo. Tente o Chrome ou o Edge atualizados.');
            }
            await applyBackground(cam, choice);
            setBg(id);
        }
        catch {
            onError('Não consegui aplicar o fundo. Seu aparelho pode ser fraco demais para esse efeito.');
        }
        finally {
            setBusy(null);
        }
    }
    async function pickVoice(preset) {
        const mic = local.getTrackPublication(Track.Source.Microphone)?.track;
        if (!mic)
            return onError('Ligue o microfone primeiro para mudar a voz.');
        setBusy(`voice-${preset}`);
        try {
            if (preset === 'none')
                await mic.stopProcessor();
            else
                await mic.setProcessor(createVoiceProcessor(preset));
            setVoice(preset);
        }
        catch {
            onError('Não consegui aplicar o efeito de voz neste navegador.');
        }
        finally {
            setBusy(null);
        }
    }
    function onFile(file) {
        if (!file)
            return;
        if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) {
            return onError('Escolha uma imagem (JPG ou PNG) de até 8 MB.');
        }
        void pickBackground('upload', { kind: 'image', url: URL.createObjectURL(file) });
    }
    return (_jsxs("div", { children: [_jsx("button", { type: "button", onClick: () => setOpen((v) => !v), "aria-expanded": open, "aria-label": "Efeitos", "data-tip": "Efeitos", className: "ctl-button", children: _jsx("span", { className: "ctl", "data-on": open || undefined, children: _jsx(Icon, { name: "wand_stars", size: "1.35rem" }) }) }), open && (_jsxs(Sheet, { title: "Efeitos", onClose: () => setOpen(false), children: [_jsxs("fieldset", { className: "space-y-2", children: [_jsx("legend", { className: "text-xs font-semibold text-zinc-500", children: "Fundo da c\u00E2mera" }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx(Chip, { active: bg === 'none', disabled: busy !== null, onClick: () => void pickBackground('none', { kind: 'none' }), children: "Nenhum" }), _jsx(Chip, { active: bg === 'blur', disabled: busy !== null, onClick: () => void pickBackground('blur', { kind: 'blur' }), children: "Desfocar" }), BACKGROUND_IMAGES.map((b) => (_jsx(Chip, { active: bg === b.id, disabled: busy !== null, onClick: () => void pickBackground(b.id, { kind: 'image', url: b.url }), children: b.label }, b.id))), _jsx(Chip, { active: bg === 'upload', disabled: busy !== null, onClick: () => fileRef.current?.click(), children: "Sua imagem\u2026" })] }), _jsx("input", { ref: fileRef, type: "file", accept: "image/*", hidden: true, "aria-label": "Enviar imagem de fundo", onChange: (e) => onFile(e.target.files?.[0]) }), _jsx("p", { className: "text-xs text-zinc-500", children: "Funciona no Chrome e no Edge. Pede um aparelho razo\u00E1vel." })] }), _jsxs("fieldset", { className: "space-y-2", children: [_jsx("legend", { className: "text-xs font-semibold text-zinc-500", children: "Voz" }), _jsx("div", { className: "flex flex-wrap gap-2", children: VOICE_PRESETS.map((v) => (_jsx(Chip, { active: voice === v.value, disabled: busy !== null, onClick: () => void pickVoice(v.value), children: v.label }, v.value))) }), _jsx("p", { className: "text-xs text-zinc-500", children: VOICE_PRESETS.find((v) => v.value === voice)?.hint })] }), _jsxs("fieldset", { className: "space-y-2", children: [_jsx("legend", { className: "text-xs font-semibold text-zinc-500", children: "Legendas ao vivo" }), _jsx(Chip, { active: captionsOn, onClick: onToggleCaptions, children: captionsOn ? 'Ligadas' : 'Desligadas' }), _jsx("p", { className: "text-xs text-zinc-500", children: speechSupported()
                                    ? 'Mostra o que os outros falam e transcreve a sua fala. No Chrome e no Edge, o áudio da sua fala é enviado ao serviço de voz do navegador (Google ou Microsoft) para virar texto.'
                                    : 'Este navegador não transcreve voz, então você só vê as legendas dos outros. Use o Chrome ou o Edge para legendar a sua fala.' })] })] }))] }));
}
