import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Badge, Button, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { ALL_SOURCES_LABEL } from '../lib/labels';
import {
  ROLE_LABEL,
  banOptions,
  canModerateTarget,
  isAdmin,
  isStaff,
} from '../lib/moderation-rules';
import type { Participant, RaisedHand, Role, Room } from '../lib/types';
import { RecordingControl } from './RecordingControl';
import { Icon } from '../components/Icon';
import { cameraPin, parsePin, screenPin } from './pin';
import { PersonAudio } from './PersonAudio';

interface Props {
  room: Room;
  me: { id: string; role: Role };
  /** Muda quando alguém entra, sai ou é alterado: recarrega a lista. */
  version: number;
  lectureMode: boolean;
  /** Quem pediu a palavra, por ordem. */
  hands?: RaisedHand[];
  recording?: boolean;
  onInfo: (message: string) => void;
  onError: (message: string) => void;
  /** Fixar no palco (só na sua tela): o que está fixado e quem está compartilhando a tela. */
  pinnedId?: string | null;
  onPin?: (value: string) => void;
  sharingIds?: ReadonlySet<string>;
}

/** Botão pequeno de fixar (câmera ou tela) na linha da pessoa. */
function PinToggle({
  label,
  on,
  icon,
  onClick,
}: {
  label: string;
  on: boolean;
  icon: 'keep' | 'screen_share';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={`${on ? 'Desafixar' : 'Fixar'} ${label}`}
      title={`${on ? 'Desafixar' : 'Fixar'} ${label}`}
      className="person-pin"
      data-on={on || undefined}
    >
      <Icon name={on && icon === 'keep' ? 'keep_off' : icon} size="1rem" />
    </button>
  );
}

/** Quantas pessoas a lista desenha por vez (salas de 500 não travam). */
const PAGE = 60;

type Pending = { userId: string; action: 'kick' | 'ban' } | null;

/**
 * Lista de quem está na sala. Para moderação, cada pessoa tem as ações permitidas pela
 * hierarquia (a interface só esconde o que o servidor recusaria; ele confere de novo).
 */
export function ParticipantsPanel({
  room,
  me,
  version,
  lectureMode,
  hands = [],
  recording = false,
  onInfo,
  onError,
  pinnedId = null,
  onPin,
  sharingIds,
}: Props) {
  const pin = parsePin(pinnedId);
  const [people, setPeople] = useState<Participant[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [banMinutes, setBanMinutes] = useState(60);
  const [busy, setBusy] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const id = ++seq.current;
    try {
      const list = await api.rooms.participants(room.id);
      if (id !== seq.current) return;
      setPeople(list);
      setFailed(null);
    } catch (err) {
      if (id === seq.current) setFailed(describeError(err));
    }
  }, [room.id]);

  // A primeira carga é na hora; depois, com muita gente entrando e saindo, recarrega no máximo
  // a cada 1,2 s (500 entradas seguidas não viram 500 pedidos).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load();
      return;
    }
    const id = setTimeout(() => void load(), 1200);
    return () => clearTimeout(id);
  }, [load, version]);

  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try {
      await fn();
      onInfo(done);
      setPending(null);
      void load();
    } catch (err) {
      onError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  const filtered = people?.filter(
    (p) => !query.trim() || p.displayName.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const canStage = isAdmin(me.role) && room.type === 'MEETING';

  // Moderação só existe em reuniões; nas lives todo mundo é igual.
  const staff = isStaff(me.role) && room.type === 'MEETING';
  const options = banOptions(me.role);

  async function toggleLecture() {
    await run(
      'lecture',
      () => api.rooms.update(room.id, { lectureMode: !lectureMode }),
      lectureMode
        ? 'Palco desligado: todo mundo pode transmitir.'
        : 'Palco ligado: ninguém transmite até um admin subir a pessoa.',
    );
  }

  async function toggleScreenLock() {
    await run(
      'screen-lock',
      () => api.rooms.update(room.id, { screenLock: !room.screenLock }),
      room.screenLock
        ? 'Tela liberada: todo mundo pode compartilhar.'
        : 'Tela travada: só o palco compartilha.',
    );
  }

  /** Destaque para todos: a pessoa aparece grande para a sala inteira. */
  function spotlightButton(p: Participant) {
    const on = room.spotlightId === p.userId;
    return (
      <Button
        size="sm"
        variant={on ? 'primary' : 'secondary'}
        aria-pressed={on}
        loading={busy === `spot:${p.userId}`}
        onClick={() =>
          void run(
            `spot:${p.userId}`,
            () => api.rooms.update(room.id, { spotlightId: on ? null : p.userId }),
            on ? 'Destaque removido.' : `${p.displayName} está em destaque para todos.`,
          )
        }
      >
        {on ? 'Tirar destaque' : 'Destacar para todos'}
      </Button>
    );
  }

  async function endRoom() {
    await run('end', () => api.rooms.end(room.id), 'Sala encerrada.');
  }

  async function muteAll() {
    await run(
      'mute-all',
      async () => {
        const { affected } = await api.moderation.muteAll(room.id);
        onInfo(`Microfone desligado para ${affected} ${affected === 1 ? 'pessoa' : 'pessoas'}.`);
      },
      'Pronto.',
    );
  }

  async function camerasOff() {
    await run(
      'cameras-off',
      async () => {
        const { affected } = await api.moderation.camerasOff(room.id);
        onInfo(
          `Câmera e tela desligadas para ${affected} ${affected === 1 ? 'pessoa' : 'pessoas'}.`,
        );
      },
      'Pronto.',
    );
  }

  return (
    <section aria-label="Pessoas na sala" className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 className="font-semibold text-zinc-100">
          Pessoas {people ? `(${people.length})` : ''}
        </h2>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          Atualizar
        </Button>
      </header>

      {staff && (
        <div className="flex flex-wrap gap-2 pb-4">
          <Button
            size="sm"
            variant={lectureMode ? 'primary' : 'secondary'}
            aria-pressed={lectureMode}
            loading={busy === 'lecture'}
            onClick={() => void toggleLecture()}
          >
            Palco: {lectureMode ? 'ligado' : 'desligado'}
          </Button>
          <Button
            size="sm"
            variant={room.screenLock ? 'primary' : 'secondary'}
            aria-pressed={room.screenLock}
            loading={busy === 'screen-lock'}
            onClick={() => void toggleScreenLock()}
          >
            Tela: {room.screenLock ? 'só no palco' : 'liberada'}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'mute-all'}
            onClick={() => void muteAll()}
          >
            Silenciar todos
          </Button>
          <Button
            size="sm"
            variant="secondary"
            loading={busy === 'cameras-off'}
            onClick={() => void camerasOff()}
          >
            Desligar câmeras
          </Button>
          <Button
            size="sm"
            variant="danger"
            loading={busy === 'end'}
            onClick={() => void endRoom()}
          >
            Encerrar sala
          </Button>
        </div>
      )}

      {staff && isAdmin(me.role) && (
        <RecordingControl
          roomId={room.id}
          recording={recording}
          people={people ?? []}
          onInfo={onInfo}
          onError={onError}
        />
      )}

      {staff && hands.length > 0 && (
        <section aria-label="Querem falar" className="space-y-2 rounded-xl bg-brand-500/10 p-3">
          <h3 className="text-sm font-semibold text-brand-300">Querem falar ({hands.length})</h3>
          <ol className="space-y-2">
            {hands.map((h, i) => (
              <li key={h.userId} className="flex items-center gap-2" data-testid="hand">
                <span className="w-5 text-xs text-zinc-500">{i + 1}.</span>
                <Avatar name={h.displayName} url={h.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                  {h.displayName}
                </span>
                {isAdmin(me.role) && (
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === `hand-${h.userId}`}
                    onClick={() =>
                      void run(
                        `hand-${h.userId}`,
                        () => api.moderation.promote(room.id, h.userId),
                        `${h.displayName} subiu ao palco.`,
                      )
                    }
                  >
                    Subir ao palco
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {people === null && !failed && <Spinner label="Carregando…" />}
      {failed && <Alert tone="error">{failed}</Alert>}

      {people && people.length > PAGE && (
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
          placeholder="Buscar pessoa"
          aria-label="Buscar pessoa"
          className="h-9 w-full rounded-lg border border-zinc-700 bg-transparent px-3 text-sm text-zinc-50 placeholder:text-zinc-500"
        />
      )}

      <ul className="space-y-2">
        {filtered?.slice(0, shown).map((p) => {
          const mayModerate = staff && canModerateTarget(me, { id: p.userId, role: p.role });
          const isPending = pending?.userId === p.userId;
          return (
            <li key={p.userId} className="rounded-xl bg-white/5 p-2" data-testid="person">
              <div className="flex items-center gap-2">
                <Avatar name={p.displayName} url={p.avatarUrl} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                  {p.displayName}
                  {p.userId === me.id && <span className="text-zinc-500"> (você)</span>}
                </span>
                {p.role !== 'MEMBER' && <Badge tone="scheduled">{ROLE_LABEL[p.role]}</Badge>}
                {p.isSpeaker && <Badge tone="open">No palco</Badge>}
                {p.mutedByModeration && <Badge tone="warn">Silenciado</Badge>}
                {onPin && (
                  <span className="flex flex-none items-center gap-1">
                    {sharingIds?.has(p.userId) && (
                      <PinToggle
                        label={`tela de ${p.displayName}`}
                        icon="screen_share"
                        on={pin?.identity === p.userId && !pin.camera}
                        onClick={() => onPin(screenPin(p.userId))}
                      />
                    )}
                    <PinToggle
                      label={`câmera de ${p.displayName}`}
                      icon="keep"
                      on={pin?.identity === p.userId && (pin.camera || !sharingIds?.has(p.userId))}
                      onClick={() => onPin(cameraPin(p.userId))}
                    />
                  </span>
                )}
              </div>

              {p.userId !== me.id && <PersonAudio id={p.userId} name={p.displayName} />}

              {canStage && p.userId === me.id && (
                <div className="mt-2 pl-9">
                  <Button
                    size="sm"
                    variant={p.isSpeaker ? 'secondary' : 'primary'}
                    loading={busy === `self-stage`}
                    onClick={() =>
                      void run(
                        'self-stage',
                        () =>
                          p.isSpeaker
                            ? api.moderation.demote(room.id, me.id)
                            : api.moderation.promote(room.id, me.id),
                        p.isSpeaker ? 'Você saiu do palco.' : 'Você subiu ao palco.',
                      )
                    }
                  >
                    {p.isSpeaker ? 'Sair do palco' : 'Subir ao palco'}
                  </Button>{' '}
                  {spotlightButton(p)}
                </div>
              )}

              {p.mutedSources.length > 0 && (
                <p className="mt-1 pl-9 text-xs text-zinc-500">
                  Bloqueado: {p.mutedSources.map((s) => ALL_SOURCES_LABEL[s]).join(', ')}
                </p>
              )}

              {mayModerate && !isPending && (
                <div className="mt-2 flex flex-wrap gap-1.5 pl-9">
                  {p.mutedByModeration ? (
                    <Button
                      size="sm"
                      loading={busy === `unmute:${p.userId}`}
                      onClick={() =>
                        void run(
                          `unmute:${p.userId}`,
                          () => api.moderation.unmute(room.id, p.userId),
                          `${p.displayName} liberado(a).`,
                        )
                      }
                    >
                      Liberar
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      loading={busy === `mute:${p.userId}`}
                      onClick={() =>
                        void run(
                          `mute:${p.userId}`,
                          () => api.moderation.mute(room.id, p.userId),
                          `${p.displayName} silenciado(a).`,
                        )
                      }
                    >
                      Silenciar
                    </Button>
                  )}
                  {canStage && spotlightButton(p)}
                  {!canStage ? null : p.isSpeaker ? (
                    <Button
                      size="sm"
                      loading={busy === `demote:${p.userId}`}
                      onClick={() =>
                        void run(
                          `demote:${p.userId}`,
                          () => api.moderation.demote(room.id, p.userId),
                          `${p.displayName} saiu do palco.`,
                        )
                      }
                    >
                      Tirar do palco
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      loading={busy === `promote:${p.userId}`}
                      onClick={() =>
                        void run(
                          `promote:${p.userId}`,
                          () => api.moderation.promote(room.id, p.userId),
                          `${p.displayName} subiu ao palco.`,
                        )
                      }
                    >
                      Subir ao palco
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setPending({ userId: p.userId, action: 'kick' })}
                  >
                    Expulsar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => setPending({ userId: p.userId, action: 'ban' })}
                  >
                    Banir
                  </Button>
                </div>
              )}

              {mayModerate && isPending && pending && (
                <div
                  className="mt-2 space-y-2 pl-9"
                  role="group"
                  aria-label={`Confirmar ${pending.action === 'kick' ? 'expulsão' : 'banimento'}`}
                >
                  <p className="text-sm text-amber-200">
                    {pending.action === 'kick'
                      ? `Expulsar ${p.displayName}? A pessoa pode voltar.`
                      : `Banir ${p.displayName} desta sala?`}
                  </p>
                  {pending.action === 'ban' && (
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      Por quanto tempo
                      <select
                        value={banMinutes}
                        onChange={(e) => setBanMinutes(Number(e.target.value))}
                        className="rounded bg-zinc-950 px-2 py-1"
                      >
                        {options.map((o) => (
                          <option key={o.minutes} value={o.minutes}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      loading={busy === `${pending.action}:${p.userId}`}
                      onClick={() =>
                        void run(
                          `${pending.action}:${p.userId}`,
                          () =>
                            pending.action === 'kick'
                              ? api.moderation.kick(room.id, p.userId)
                              : api.moderation.ban(room.id, p.userId, {
                                  durationMinutes: options.some((o) => o.minutes === banMinutes)
                                    ? banMinutes
                                    : 60,
                                }),
                          pending.action === 'kick'
                            ? `${p.displayName} expulso(a).`
                            : `${p.displayName} banido(a).`,
                        )
                      }
                    >
                      Confirmar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setPending(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {filtered && filtered.length > shown && (
        <Button size="sm" variant="ghost" onClick={() => setShown((n) => n + PAGE)}>
          Mostrar mais ({filtered.length - shown})
        </Button>
      )}

      {staff && isAdmin(me.role) === false && (
        <p className="text-xs text-zinc-500">
          Moderadores não podem moderar outros moderadores ou admins.
        </p>
      )}
    </section>
  );
}
