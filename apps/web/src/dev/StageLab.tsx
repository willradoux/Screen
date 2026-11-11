import type { TrackPublication } from 'livekit-client';
import { useMemo, useState } from 'react';
import { Creature } from '../components/Creature';
import { Stage, STAGE_LAYOUTS, type StageLayout } from '../room/Stage';
import type { Tile } from '../room/useParticipants';

/*
 * Laboratório do palco (SÓ em desenvolvimento, rota /__lab): pessoas falsas com vídeo gerado
 * num canvas (câmera em pé, deitada, sem câmera, tela compartilhada), para testar layouts e
 * responsividade sem precisar de várias pessoas numa chamada. Não entra no build de produção.
 */

function fakeStream(w: number, h: number, hue: number, label: string): MediaStream {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
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

function fakePub(w: number, h: number, hue: number, label: string): TrackPublication {
  const stream = fakeStream(w, h, hue, label);
  return {
    trackSid: `${label}-${w}x${h}`,
    track: {
      sid: `${label}-${w}x${h}`,
      attach: (el: HTMLVideoElement) => {
        el.srcObject = stream;
        void el.play().catch(() => undefined);
        return el;
      },
      detach: (el: HTMLVideoElement) => {
        el.srcObject = null;
        return el;
      },
    },
  } as unknown as TrackPublication;
}

function person(identity: string, name: string, extra: Partial<Tile> = {}): Tile {
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
  } as Tile;
}

const SCENES: { id: string; label: string; make: () => Tile[] }[] = [
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
      person('c', 'Caio', { isSpeaking: true }),
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
      ...Array.from({ length: 40 }, (_, i) =>
        person(`q${i}`, `P${i}`, { micOn: false, canPublish: false }),
      ),
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
  return new URLSearchParams(window.location.search).has('pet') ? (
    <div className="grid h-dvh place-items-center bg-[#121212] text-white">
      <Creature className="h-40" />
    </div>
  ) : (
    <StageLab />
  );
}

function StageLab() {
  const [scene, setScene] = useState(SCENES[0]!.id);
  const [layout, setLayout] = useState<StageLayout>('auto');
  const [lecture, setLecture] = useState(false);
  const [size, setSize] = useState(SIZES[0]!.id);
  const frame = SIZES.find((x) => x.id === size)!;
  const tiles = useMemo(() => SCENES.find((s) => s.id === scene)!.make(), [scene]);

  return (
    <div className="flex h-dvh flex-col gap-2 bg-zinc-950 p-2 text-sm text-zinc-200">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Cena"
          value={scene}
          onChange={(e) => setScene(e.target.value)}
          className="rounded bg-zinc-900 px-2 py-1"
        >
          {SCENES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Layout"
          value={layout}
          onChange={(e) => setLayout(e.target.value as StageLayout)}
          className="rounded bg-zinc-900 px-2 py-1"
        >
          {STAGE_LAYOUTS.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Tamanho"
          value={size}
          onChange={(e) => setSize(e.target.value)}
          className="rounded bg-zinc-900 px-2 py-1"
        >
          {SIZES.map((x) => (
            <option key={x.id} value={x.id}>
              {x.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={lecture} onChange={(e) => setLecture(e.target.checked)} />
          Palco ligado
        </label>
      </div>
      <div
        className="call-screen mx-auto min-h-0 flex-1"
        data-testid="lab-screen"
        style={frame.w ? { width: frame.w, height: frame.h, flex: 'none' } : { width: '100%' }}
      >
        <Stage tiles={tiles} layout={layout} lectureMode={lecture} />
      </div>
    </div>
  );
}
