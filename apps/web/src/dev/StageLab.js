import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useMemo, useState } from 'react';
import { Creature } from '../components/Creature';
import { Stage, STAGE_LAYOUTS } from '../room/Stage';
/*
 * Laboratório do palco (SÓ em desenvolvimento, rota /__lab): pessoas falsas com vídeo gerado
 * num canvas (câmera em pé, deitada, sem câmera, tela compartilhada), para testar layouts e
 * responsividade sem precisar de várias pessoas numa chamada. Não entra no build de produção.
 */
function fakeStream(w, h, hue, label) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    let t = 0;
    const draw = () => {
        t += 1;
        ctx.fillStyle = `hsl(${hue} 45% 30%)`;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = `hsl(${hue} 60% 60%)`;
        ctx.beginPath();
        ctx.arc(w / 2 + Math.sin(t / 20) * w * 0.1, h * 0.45, Math.min(w, h) * 0.18, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = `${Math.round(Math.min(w, h) / 12)}px sans-serif`;
        ctx.fillText(`${label} ${w}×${h}`, 16, h - 20);
    };
    draw();
    window.setInterval(draw, 100);
    return canvas.captureStream(10);
}
function fakePub(w, h, hue, label) {
    const stream = fakeStream(w, h, hue, label);
    return {
        trackSid: `${label}-${w}x${h}`,
        track: {
            sid: `${label}-${w}x${h}`,
            attach: (el) => {
                el.srcObject = stream;
                void el.play().catch(() => undefined);
                return el;
            },
            detach: (el) => {
                el.srcObject = null;
                return el;
            },
        },
    };
}
function person(identity, name, extra = {}) {
    return {
        identity,
        name,
        avatarUrl: null,
        role: 'MEMBER',
        isLocal: false,
        isSpeaking: false,
        micOn: true,
        canPublish: true,
        cameraPub: undefined,
        screenPub: undefined,
        screenPublished: Boolean(extra.screenPub),
        ...extra,
    };
}
const SCENES = [
    {
        id: 'screen',
        label: 'Tela + câmera em pé + sem câmera',
        make: () => [
            person('v', 'Vinicius', { screenPub: fakePub(1920, 1080, 330, 'Tela') }),
            person('b', 'Barbara', { cameraPub: fakePub(720, 1280, 200, 'Cam') }),
            person('me', 'Você', { isLocal: true }),
        ],
    },
    {
        id: 'two',
        label: '2 câmeras (deitada e em pé)',
        make: () => [
            person('a', 'Ana', { cameraPub: fakePub(1280, 720, 20, 'Cam') }),
            person('b', 'Beto', { cameraPub: fakePub(720, 1280, 140, 'Cam') }),
        ],
    },
    {
        id: 'six',
        label: '6 pessoas variadas',
        make: () => [
            person('a', 'Ana', { cameraPub: fakePub(1280, 720, 20, 'Cam'), isSpeaking: true }),
            person('b', 'Beto', { cameraPub: fakePub(720, 1280, 140, 'Cam') }),
            person('c', 'Caio'),
            person('d', 'Duda', { cameraPub: fakePub(1280, 720, 260, 'Cam') }),
            person('e', 'Edu', { micOn: false }),
            person('me', 'Você', { isLocal: true, cameraPub: fakePub(1280, 720, 90, 'Cam') }),
        ],
    },
    {
        id: 'crowd',
        label: 'Sala grande (40 ouvindo)',
        make: () => [
            person('a', 'Ana', { cameraPub: fakePub(1280, 720, 20, 'Cam') }),
            person('me', 'Você', { isLocal: true }),
            ...Array.from({ length: 40 }, (_, i) => person(`q${i}`, `P${i}`, { micOn: false, canPublish: false })),
        ],
    },
];
const SIZES = [
    { id: 'desk', label: 'Computador', w: 0, h: 0 },
    { id: 'phone', label: 'Celular em pé (360×640)', w: 360, h: 640 },
    { id: 'phone-land', label: 'Celular deitado (720×340)', w: 720, h: 340 },
    { id: 'tablet', label: 'Tablet (768×900)', w: 768, h: 900 },
];
/** /__lab?pet mostra só o bichinho, grande, para ver a animação. */
export default function Lab() {
    return new URLSearchParams(window.location.search).has('pet') ? (_jsx("div", { className: "grid h-dvh place-items-center bg-[#121212] text-white", children: _jsx(Creature, { className: "h-40" }) })) : (_jsx(StageLab, {}));
}
function StageLab() {
    const [scene, setScene] = useState(SCENES[0].id);
    const [layout, setLayout] = useState('auto');
    const [lecture, setLecture] = useState(false);
    const [size, setSize] = useState(SIZES[0].id);
    const frame = SIZES.find((x) => x.id === size);
    const tiles = useMemo(() => SCENES.find((s) => s.id === scene).make(), [scene]);
    return (_jsxs("div", { className: "flex h-dvh flex-col gap-2 bg-zinc-950 p-2 text-sm text-zinc-200", children: [_jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [_jsx("select", { "aria-label": "Cena", value: scene, onChange: (e) => setScene(e.target.value), className: "rounded bg-zinc-900 px-2 py-1", children: SCENES.map((s) => (_jsx("option", { value: s.id, children: s.label }, s.id))) }), _jsx("select", { "aria-label": "Layout", value: layout, onChange: (e) => setLayout(e.target.value), className: "rounded bg-zinc-900 px-2 py-1", children: STAGE_LAYOUTS.map((l) => (_jsx("option", { value: l.value, children: l.label }, l.value))) }), _jsx("select", { "aria-label": "Tamanho", value: size, onChange: (e) => setSize(e.target.value), className: "rounded bg-zinc-900 px-2 py-1", children: SIZES.map((x) => (_jsx("option", { value: x.id, children: x.label }, x.id))) }), _jsxs("label", { className: "flex items-center gap-1", children: [_jsx("input", { type: "checkbox", checked: lecture, onChange: (e) => setLecture(e.target.checked) }), "Palco ligado"] })] }), _jsx("div", { className: "call-screen mx-auto min-h-0 flex-1", "data-testid": "lab-screen", style: frame.w ? { width: frame.w, height: frame.h, flex: 'none' } : { width: '100%' }, children: _jsx(Stage, { tiles: tiles, layout: layout, lectureMode: lecture }) })] }));
}
