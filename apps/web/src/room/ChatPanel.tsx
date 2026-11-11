import { memo, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/ui';
import { ROLE_LABEL } from '../lib/moderation-rules';
import type { ChatAck, ChatMessage, Poll, Role } from '../lib/types';
import type { RoomChat } from './useRoomSession';

/** Uma mensagem a cada 3 s (o servidor confere; aqui é só para o botão esperar junto). */
const COOLDOWN_MS = 3_000;
const MAX_TEXT = 500;

const isStaff = (role: Role) => role === 'MOD' || role === 'ADMIN';
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/** Uma mensagem. Memorizada: chegar mensagem nova não redesenha as antigas. */
const MessageRow = memo(function MessageRow({
  m,
  mine,
  canDelete,
  onDelete,
}: {
  m: ChatMessage;
  mine: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <article
      className="chat-msg"
      data-mine={mine || undefined}
      tabIndex={canDelete ? 0 : undefined}
    >
      <Avatar name={m.displayName} url={m.avatarUrl} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="chat-msg-head">
          <span className="truncate font-semibold text-zinc-100">{m.displayName}</span>
          {m.role !== 'MEMBER' && <span className="chat-role">{ROLE_LABEL[m.role]}</span>}
          <time className="text-zinc-500" dateTime={m.at}>
            {time(m.at)}
          </time>
        </p>
        <p className="chat-msg-text">{m.text}</p>
      </div>
      {canDelete && (
        <button
          type="button"
          className="chat-msg-del"
          aria-label={`Apagar a mensagem de ${m.displayName}`}
          title="Apagar para todos (moderação)"
          onClick={() => onDelete(m.id)}
        >
          <Icon name="delete" size="0.85rem" />
        </button>
      )}
    </article>
  );
});

/** "Fulano está digitando..." (uma linha só; não mexe na lista de mensagens). */
function TypingLine({ names }: { names: string[] }) {
  if (names.length === 0) return <p className="chat-typing" aria-hidden="true" />;
  const text =
    names.length === 1
      ? `${names[0]} está digitando…`
      : names.length === 2
        ? `${names[0]} e ${names[1]} estão digitando…`
        : 'Várias pessoas estão digitando…';
  return (
    <p className="chat-typing" aria-live="polite">
      <span className="chat-typing-dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      {text}
    </p>
  );
}

/** Enquete fixada no topo do chat (como no YouTube): vota uma vez e vê o resultado ao vivo. */
function PollCard({
  poll,
  staff,
  chat,
  onError,
}: {
  poll: Poll;
  staff: boolean;
  chat: RoomChat;
  onError: (m: string) => void;
}) {
  const [voted, setVoted] = useState<number | null>(() => readVote(poll.id));
  const showResults = voted !== null || poll.status === 'closed' || staff;

  async function vote(option: number) {
    const res = await chat.vote(poll.id, option);
    if (res.ok || res.error?.code === 'ALREADY_VOTED') {
      setVoted(option);
      saveVote(poll.id, option);
    } else onError(res.error?.message ?? 'Não deu para votar.');
  }

  return (
    <section aria-label="Enquete" className="chat-poll">
      <p className="chat-poll-kind">
        <Icon name="campaign" size="0.95rem" />
        {poll.status === 'closed' ? 'Enquete encerrada' : 'Enquete'}
        <span className="ml-auto tabular">
          {poll.total} {poll.total === 1 ? 'voto' : 'votos'}
        </span>
      </p>
      <p className="chat-poll-question">{poll.question}</p>
      <ul className="chat-poll-options">
        {poll.options.map((o, i) => {
          const pct = poll.total ? Math.round((o.votes / poll.total) * 100) : 0;
          return (
            <li key={i}>
              {showResults ? (
                <div
                  className="chat-poll-result"
                  data-mine={voted === i || undefined}
                  style={{ '--pct': `${pct}%` } as React.CSSProperties}
                >
                  <span className="min-w-0 flex-1 truncate">{o.text}</span>
                  <span className="tabular">{pct}%</span>
                </div>
              ) : (
                <button type="button" className="chat-poll-option" onClick={() => void vote(i)}>
                  {o.text}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {staff && (
        <div className="chat-poll-actions">
          {poll.status === 'open' && (
            <button type="button" onClick={() => void chat.close(poll.id)}>
              Encerrar
            </button>
          )}
          <button type="button" onClick={() => void chat.clear(poll.id)}>
            Tirar do topo
          </button>
        </div>
      )}
    </section>
  );
}

/** Formulário de enquete: a moderação cria na hora; os outros sugerem. */
function PollForm({
  staff,
  onDone,
  chat,
  onError,
  onInfo,
}: {
  staff: boolean;
  onDone: () => void;
  chat: RoomChat;
  onError: (m: string) => void;
  onInfo: (m: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [busy, setBusy] = useState(false);
  const valid = question.trim() && options.filter((o) => o.trim()).length >= 2;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const res = await chat.propose(question.trim(), options.map((o) => o.trim()).filter(Boolean));
    setBusy(false);
    if (!res.ok) return onError(res.error?.message ?? 'Não deu para criar a enquete.');
    onInfo(staff ? 'Enquete no topo do chat.' : 'Sugestão enviada. A moderação decide.');
    onDone();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="chat-poll-form">
      <p className="text-sm font-bold text-zinc-50">{staff ? 'Nova enquete' : 'Sugerir enquete'}</p>
      <input
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        maxLength={200}
        placeholder="Pergunta"
        aria-label="Pergunta da enquete"
        className="chat-input"
      />
      {options.map((o, i) => (
        <input
          key={i}
          value={o}
          onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))}
          maxLength={80}
          placeholder={`Opção ${i + 1}`}
          aria-label={`Opção ${i + 1}`}
          className="chat-input"
        />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {options.length < 5 && (
          <button type="button" className="chat-link" onClick={() => setOptions([...options, ''])}>
            + opção
          </button>
        )}
        <span className="flex-1" />
        <button type="button" className="chat-link" onClick={onDone}>
          Cancelar
        </button>
        <button type="submit" disabled={!valid || busy} className="btn btn-primary chat-send-btn">
          {staff ? 'Publicar' : 'Sugerir'}
        </button>
      </div>
    </form>
  );
}

/**
 * Chat da sala, ao lado da chamada (como o painel de pessoas). As mensagens ficam no seu
 * navegador e somem quando a sala fecha; o servidor só repassa. Uma mensagem a cada 3 s.
 */
export function ChatPanel({
  chat,
  me,
  pollsEnabled = false,
  onError,
  onInfo,
}: {
  chat: RoomChat;
  me: { id: string; role: Role };
  /** Enquete só no modo live (reunião com o palco ligado). */
  pollsEnabled?: boolean;
  onError: (message: string) => void;
  onInfo: (message: string) => void;
}) {
  const staff = isStaff(me.role);
  const [text, setText] = useState('');
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [pollForm, setPollForm] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const waiting = waitUntil > now;
  // Função estável para as mensagens memorizadas não redesenharem.
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const [remove] = useState(() => (id: string) => void chatRef.current.remove(id));

  // Conta o tempo de espera para o botão (só enquanto há espera).
  useEffect(() => {
    if (!waiting) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [waiting]);

  // Chegou mensagem: desce até o fim, se a pessoa já estava no fim (não puxa quem está lendo).
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || waiting) return;
    const res: ChatAck & { retryInMs?: number } = await chat.send(value);
    if (res.ok) {
      setText('');
      stick.current = true;
      setNow(Date.now());
      setWaitUntil(Date.now() + COOLDOWN_MS);
    } else if (res.error?.code === 'RATE_LIMITED') {
      setNow(Date.now());
      setWaitUntil(Date.now() + (res.retryInMs ?? COOLDOWN_MS));
    } else {
      onError(res.error?.message ?? 'Não deu para mandar a mensagem.');
    }
  }

  const seconds = Math.ceil((waitUntil - now) / 1000);

  return (
    <section aria-label="Chat" className="chat-panel">
      {pollsEnabled && chat.poll && (
        <PollCard key={chat.poll.id} poll={chat.poll} staff={staff} chat={chat} onError={onError} />
      )}

      {pollsEnabled && staff && chat.pendingPolls.length > 0 && (
        <section aria-label="Enquetes sugeridas" className="chat-pending">
          <p className="chat-pending-title">Sugestões de enquete · {chat.pendingPolls.length}</p>
          {chat.pendingPolls.map((p) => (
            <div key={p.id} className="chat-pending-item">
              <p className="min-w-0 text-[13px] text-zinc-100">
                <strong>{p.question}</strong>
                <span className="block text-[11px] text-zinc-500">
                  {p.options.map((o) => o.text).join(' · ')} — de {p.proposedBy}
                </span>
              </p>
              <div className="flex gap-1">
                <button type="button" className="chat-link" onClick={() => void chat.approve(p.id)}>
                  Aceitar
                </button>
                <button type="button" className="chat-link" onClick={() => void chat.reject(p.id)}>
                  Recusar
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      <div
        ref={listRef}
        className="chat-list"
        role="log"
        aria-label="Mensagens"
        aria-live="polite"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {/* As mensagens começam embaixo e vão subindo; quando enche, a lista rola. */}
        <div className="chat-list-inner">
          {chat.messages.length === 0 ? (
            <p className="chat-empty">
              Ninguém escreveu ainda. As mensagens somem quando a sala fecha.
            </p>
          ) : (
            chat.messages.map((m) => (
              <MessageRow
                key={m.id}
                m={m}
                mine={m.userId === me.id}
                canDelete={staff}
                onDelete={remove}
              />
            ))
          )}
        </div>
      </div>

      <TypingLine names={chat.typing} />

      {pollsEnabled && pollForm ? (
        <PollForm
          staff={staff}
          chat={chat}
          onError={onError}
          onInfo={onInfo}
          onDone={() => setPollForm(false)}
        />
      ) : (
        <form onSubmit={(e) => void send(e)} className="chat-compose">
          {pollsEnabled && (
            <button
              type="button"
              className="chat-icon-btn"
              aria-label={staff ? 'Criar enquete' : 'Sugerir enquete'}
              title={staff ? 'Criar enquete' : 'Sugerir enquete'}
              onClick={() => setPollForm(true)}
            >
              <Icon name="campaign" size="1.1rem" />
            </button>
          )}
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (e.target.value.trim()) chat.notifyTyping();
            }}
            maxLength={MAX_TEXT}
            placeholder="Mensagem para a sala"
            aria-label="Mensagem para a sala"
            className="chat-compose-input"
          />
          <button
            type="submit"
            disabled={!text.trim() || waiting}
            className="chat-send"
            aria-label={waiting ? `Espere ${seconds} s` : 'Enviar'}
          >
            {waiting ? (
              <span className="tabular text-[12px] font-bold">{seconds}</span>
            ) : (
              <Icon name="arrow_forward" size="1.15rem" />
            )}
          </button>
        </form>
      )}
    </section>
  );
}

/** Lembra em que você votou (para mostrar o resultado ao voltar). */
function readVote(pollId: string): number | null {
  try {
    const v = sessionStorage.getItem(`screem-vote:${pollId}`);
    return v === null ? null : Number(v);
  } catch {
    return null;
  }
}

function saveVote(pollId: string, option: number) {
  try {
    sessionStorage.setItem(`screem-vote:${pollId}`, String(option));
  } catch {
    // nada a fazer
  }
}
