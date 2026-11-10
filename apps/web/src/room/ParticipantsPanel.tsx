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
}

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
}: Props) {
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

  useEffect(() => {
    void load();
  }, [load, version]);

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

  // Moderação só existe em reuniões; nas lives todo mundo é igual.
  const staff = isStaff(me.role) && room.type === 'MEETING';
  const options = banOptions(me.role);

  async function toggleLecture() {
    await run(
      'lecture',
      () => api.rooms.update(room.id, { lectureMode: !lectureMode }),
      lectureMode
        ? 'Modo palestra desligado.'
        : 'Modo palestra ligado: só palestrantes transmitem.',
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
            Modo palestra: {lectureMode ? 'ligado' : 'desligado'}
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
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy === `hand-${h.userId}`}
                  onClick={() =>
                    void run(
                      `hand-${h.userId}`,
                      () => api.moderation.promote(room.id, h.userId),
                      `${h.displayName} recebeu a palavra.`,
                    )
                  }
                >
                  Dar a palavra
                </Button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {people === null && !failed && <Spinner label="Carregando…" />}
      {failed && <Alert tone="error">{failed}</Alert>}

      <ul className="space-y-2">
        {people?.map((p) => {
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
                {p.isSpeaker && <Badge tone="open">Palestrante</Badge>}
                {p.mutedByModeration && <Badge tone="warn">Silenciado</Badge>}
              </div>

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
                  {p.isSpeaker ? (
                    <Button
                      size="sm"
                      loading={busy === `demote:${p.userId}`}
                      onClick={() =>
                        void run(
                          `demote:${p.userId}`,
                          () => api.moderation.demote(room.id, p.userId),
                          `${p.displayName} não é mais palestrante.`,
                        )
                      }
                    >
                      Tirar de palestrante
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      loading={busy === `promote:${p.userId}`}
                      onClick={() =>
                        void run(
                          `promote:${p.userId}`,
                          () => api.moderation.promote(room.id, p.userId),
                          `${p.displayName} agora é palestrante.`,
                        )
                      }
                    >
                      Tornar palestrante
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

      {staff && isAdmin(me.role) === false && (
        <p className="text-xs text-zinc-500">
          Moderadores não podem moderar outros moderadores ou admins.
        </p>
      )}
    </section>
  );
}
