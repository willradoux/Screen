import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Track, } from 'livekit-client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/ui';
import { cameraQualityFor, screenQualityFor } from '../lib/bigRoom';
import { POSITION_CLASS, aspectRatioNumber, useVideoPrefs } from '../lib/videoPrefs';
import { ROLE_LABEL } from '../lib/moderation-rules';
import { screenSharers } from './useParticipants';
function Video({ pub, mirror = false, fit = 'cover', label, onNaturalAspect, quality, }) {
    const ref = useRef(null);
    const track = pub.track;
    const prefs = useVideoPrefs();
    useEffect(() => {
        if (quality !== undefined && 'setVideoQuality' in pub) {
            pub.setVideoQuality(quality);
        }
    }, [pub, track, quality]);
    useEffect(() => {
        const el = ref.current;
        if (!track || !el)
            return;
        track.attach(el);
        const report = () => {
            if (el.videoWidth > 0 && el.videoHeight > 0) {
                onNaturalAspect?.(el.videoWidth / el.videoHeight);
            }
        };
        el.addEventListener('loadedmetadata', report);
        el.addEventListener('resize', report);
        report();
        return () => {
            el.removeEventListener('loadedmetadata', report);
            el.removeEventListener('resize', report);
            track.detach(el);
        };
    }, [track, onNaturalAspect]);
    return (_jsx("video", { ref: ref, autoPlay: true, playsInline: true, muted // o áudio é tocado à parte (RemoteAudio); aqui só a imagem
        : true, "aria-label": label, className: `h-full w-full ${fit === 'contain' ? 'object-contain' : `object-cover ${POSITION_CLASS[prefs.position]}`} ${mirror ? '-scale-x-100' : ''}` }));
}
/** Variáveis do quadro: a proporção real (número) que o CSS usa para caber sem faixas. */
const fitStyle = (ratio) => ({ '--ar': ratio });
/**
 * Botão de fixar no canto do vídeo: aparece ao passar o mouse ou com o foco do teclado; quando
 * fixado, fica sempre à vista.
 */
function PinButton({ tile, pinned, onPin, }) {
    return (_jsx("button", { type: "button", onClick: () => onPin(tile.identity), "aria-pressed": pinned, "aria-label": `${pinned ? 'Desafixar' : 'Fixar'} ${tile.name}`, title: pinned ? 'Desafixar' : 'Fixar em destaque', className: "stage-pin", "data-pinned": pinned || undefined, children: _jsx(Icon, { name: pinned ? 'keep_off' : 'keep', size: "1rem" }) }));
}
/**
 * No toque não existe "passar o mouse": tocar no vídeo mostra o botão de fixar por 3 s.
 * Devolve as props para o quadro (`data-reveal` e o toque).
 */
function useTouchReveal() {
    const [reveal, setReveal] = useState(false);
    const timer = useRef(undefined);
    useEffect(() => () => window.clearTimeout(timer.current), []);
    return {
        'data-reveal': reveal || undefined,
        onPointerUp: (e) => {
            if (e.pointerType !== 'touch')
                return;
            setReveal(true);
            window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setReveal(false), 3000);
        },
    };
}
function PersonTile({ tile, size = 'normal', pinned = false, onPin, quality, }) {
    const prefs = useVideoPrefs();
    const [natural, setNatural] = useState(null);
    const ratio = aspectRatioNumber(prefs.shape, tile.cameraPub ? natural : null);
    const reveal = useTouchReveal();
    return (_jsxs("figure", { ...(onPin ? reveal : {}), "data-testid": "tile", "data-speaking": tile.isSpeaking || undefined, "data-size": size, style: fitStyle(ratio), className: `stage-tile ${tile.cameraPub ? '' : 'stage-tile-empty'} ${tile.isSpeaking ? 'speaking-glow' : ''}`, children: [tile.cameraPub ? (_jsx(Video, { pub: tile.cameraPub, mirror: tile.isLocal, fit: prefs.fit, label: `Câmera de ${tile.name}`, onNaturalAspect: setNatural, quality: quality })) : (_jsx("div", { className: "flex h-full items-center justify-center", children: _jsx(Avatar, { name: tile.name, url: tile.avatarUrl, size: size === 'small' ? 'md' : 'lg' }) })), onPin && _jsx(PinButton, { tile: tile, pinned: pinned, onPin: onPin }), _jsxs("figcaption", { className: "stage-caption", children: [_jsxs("span", { className: "truncate font-medium text-white", children: [tile.name, tile.isLocal && ' (você)'] }), tile.role !== 'MEMBER' && size !== 'small' && (_jsx("span", { className: "rounded-full bg-white/15 px-1.5 text-[10px] font-semibold text-white", children: ROLE_LABEL[tile.role] })), _jsxs("span", { className: `ml-auto ${tile.micOn ? 'text-emerald-300' : 'text-red-300'}`, title: tile.micOn ? 'Microfone ligado' : 'Microfone desligado', children: [_jsx(Icon, { name: tile.micOn ? 'mic' : 'mic_off', size: "1.05rem" }), _jsx("span", { className: "sr-only", children: tile.micOn ? 'Microfone ligado' : 'Microfone desligado' })] })] })] }));
}
function ScreenTile({ tile, pinned = false, onPin, quality }) {
    const [natural, setNatural] = useState(null);
    const reveal = useTouchReveal();
    if (!tile.screenPub)
        return null;
    return (_jsxs("figure", { ...(onPin ? reveal : {}), "data-testid": "screen-tile", style: fitStyle(natural ?? 16 / 9), className: "stage-tile stage-tile-screen", children: [_jsx(Video, { pub: tile.screenPub, fit: "contain", label: `Tela de ${tile.name}`, onNaturalAspect: setNatural, quality: quality }), onPin && _jsx(PinButton, { tile: tile, pinned: pinned, onPin: onPin }), _jsxs("figcaption", { className: "absolute left-2.5 top-2.5 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-medium text-white", children: ["Tela de ", tile.name, tile.isLocal && ' (você)'] })] }));
}
export const STAGE_LAYOUTS = [
    { value: 'auto', label: 'Automático' },
    { value: 'mosaic', label: 'Mosaico' },
    { value: 'focus', label: 'Destaque' },
];
function pieces(tiles) {
    const screens = screenSharers(tiles).map((t) => ({
        kind: 'screen',
        tile: t,
        key: `s:${t.identity}`,
    }));
    const people = tiles.map((t) => ({ kind: 'person', tile: t, key: `p:${t.identity}` }));
    return [...screens, ...people];
}
function PieceView({ piece, small = false, extras, }) {
    const pinned = piece.tile.identity === extras.pinnedId;
    return piece.kind === 'screen' ? (_jsx(ScreenTile, { tile: piece.tile, pinned: pinned, onPin: extras.onPin, quality: extras.screenQuality })) : (_jsx(PersonTile, { tile: piece.tile, size: small ? 'small' : 'normal', pinned: pinned, onPin: extras.onPin, quality: extras.cameraQuality }));
}
function featuredPiece(all) {
    return (all.find((p) => p.kind === 'screen') ??
        all.find((p) => p.kind === 'person' && p.tile.isSpeaking && !p.tile.isLocal) ??
        all.find((p) => p.kind === 'person' && !p.tile.isLocal) ??
        all[0]);
}
/** Colunas do mosaico: o mais perto de um quadrado (1, 2, 2, 2, 3, 3, ...). */
const columnsFor = (count) => Math.max(1, Math.ceil(Math.sqrt(count)));
/** Acima disto, quem está só ouvindo (sem câmera, tela ou voz) deixa de ter um quadrado. */
const CROWD = 6;
const isActive = (t) => t.isLocal || t.isSpeaking || t.micOn || Boolean(t.cameraPub) || Boolean(t.screenPub);
/**
 * O palco. Com o palco ligado (modo palestra) só aparece quem foi colocado nele e a plateia vira
 * um número; salas grandes mostram só quem está transmitindo ou falando. Qualquer pessoa pode
 * fixar uma câmera ou tela para vê-la grande.
 */
export function Stage({ tiles, layout = 'auto', lectureMode = false, onStageSelf, pinnedId: controlledPin, onPinnedChange, }) {
    const [innerPin, setInnerPin] = useState(null);
    const pinnedId = onPinnedChange ? (controlledPin ?? null) : innerPin;
    const setPinned = onPinnedChange ?? setInnerPin;
    const extras = {
        pinnedId,
        onPin: (identity) => setPinned(pinnedId === identity ? null : identity),
        cameraQuality: cameraQualityFor(tiles.length),
        screenQuality: screenQualityFor(tiles.length),
    };
    const visible = lectureMode
        ? tiles.filter((t) => t.canPublish)
        : tiles.length > CROWD
            ? tiles.filter(isActive)
            : tiles;
    const hidden = tiles.length - visible.length;
    const pinnedTile = visible.find((t) => t.identity === pinnedId);
    const audience = hidden > 0 ? (_jsxs("p", { className: "stage-audience tabular", "data-testid": "audience-count", children: [_jsx(Icon, { name: "group", size: "0.95rem" }), lectureMode ? 'Na plateia' : 'Só ouvindo', ": ", hidden, " ", hidden === 1 ? 'pessoa' : 'pessoas'] })) : null;
    if (lectureMode && visible.length === 0) {
        return (_jsxs("div", { className: "stage-empty", "data-testid": "empty-stage", children: [_jsx(Icon, { name: "stadium", size: "2.5rem" }), _jsx("p", { className: "text-lg font-bold text-zinc-50", children: "O palco est\u00E1 vazio." }), _jsx("p", { className: "max-w-md text-sm text-zinc-400", children: "Ningu\u00E9m transmite at\u00E9 um admin subir algu\u00E9m ao palco, pela lista de pessoas." }), onStageSelf && (_jsxs("button", { type: "button", onClick: onStageSelf, className: "btn btn-primary", children: [_jsx(Icon, { name: "person_add", size: "1.1rem" }), "Subir ao palco"] })), audience] }));
    }
    const all = pieces(visible);
    const autoMode = screenSharers(visible).length > 0 ? 'focus' : 'mosaic';
    const mode = pinnedTile ? 'focus' : layout === 'auto' ? autoMode : layout;
    if (mode === 'focus') {
        // Fixado: a tela da pessoa (se compartilha) ou a câmera dela, grande; na faixa, as câmeras.
        const pinnedKind = pinnedTile?.screenPub ? 'screen' : 'person';
        const main = pinnedTile
            ? all.find((p) => p.tile === pinnedTile && p.kind === pinnedKind)
            : featuredPiece(all);
        const rest = pinnedTile
            ? all.filter((p) => p.kind === 'person' && p !== main)
            : all.filter((p) => p !== main);
        return (_jsxs("div", { className: "stage-focus", "data-layout": "focus", "data-strip": rest.length > 0 || undefined, children: [main && (_jsx("div", { className: "stage-cell", children: _jsx(PieceView, { piece: main, extras: extras }) })), rest.length > 0 && (_jsx("div", { className: "stage-strip", children: rest.map((p) => (_jsx("div", { className: "stage-cell stage-thumb", children: _jsx(PieceView, { piece: p, small: true, extras: extras }) }, p.key))) })), audience] }));
    }
    const cols = columnsFor(all.length);
    return (_jsxs("div", { className: "stage-mosaic", "data-layout": "mosaic", "data-dense": all.length >= 3 || undefined, style: {
            '--cols': cols,
            '--cols-sm': all.length <= 2 ? 1 : 2,
        }, children: [all.map((p) => (_jsx("div", { className: "stage-cell", children: _jsx(PieceView, { piece: p, extras: extras }) }, p.key))), audience] }));
}
/** Identifica as faixas de áudio de cada pessoa: só muda quando alguém liga/desliga o som. */
function audioSignature(participants) {
    return participants
        .map((p) => [Track.Source.Microphone, Track.Source.ScreenShareAudio]
        .map((source) => p.getTrackPublication(source)?.track?.sid ?? '')
        .join(','))
        .join('|');
}
/**
 * Toca o áudio de quem está na sala (microfone e áudio de tela). Os elementos de áudio
 * ficam escondidos e só são recriados quando as faixas mudam (não a cada re-render, o que
 * cortaria o som).
 */
export function RemoteAudio({ participants }) {
    const container = useRef(null);
    const latest = useRef(participants);
    latest.current = participants;
    const signature = audioSignature(participants);
    useEffect(() => {
        const root = container.current;
        if (!root)
            return;
        const cleanups = [];
        for (const p of latest.current) {
            for (const source of [Track.Source.Microphone, Track.Source.ScreenShareAudio]) {
                const track = p.getTrackPublication(source)?.track;
                if (!track)
                    continue;
                const el = track.attach();
                root.appendChild(el);
                cleanups.push(() => {
                    track.detach(el);
                    el.remove();
                });
            }
        }
        return () => cleanups.forEach((fn) => fn());
    }, [signature]);
    return _jsx("div", { ref: container, hidden: true, "aria-hidden": "true", "data-testid": "remote-audio" });
}
