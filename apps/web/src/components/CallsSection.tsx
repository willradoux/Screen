import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { CallInfo } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { EmptyState, Section } from './ui';
import { AvatarStack, CoverChip } from './Widget';

/**
 * Só as calls que têm gente agora. Call vazia não aparece (mesmo estando habilitada para live).
 * Sem nenhuma ativa, uma caixa simples avisa. Se não há calls configuradas, a seção some.
 *
 * `calls`: quem já buscou a lista passa aqui (evita buscar duas vezes); `null` = carregando.
 * Sem a prop, a seção busca sozinha.
 *
 * `shownRoomIds`: salas que a página já mostra em outro card (com os mesmos avatares). A call
 * dessas salas não se repete aqui; e, sem nada novo para mostrar, a seção some.
 */
export function CallsSection({
  calls,
  shownRoomIds,
}: {
  calls?: CallInfo[] | null;
  shownRoomIds?: string[];
}) {
  const own = useAsync(
    () => (calls === undefined ? api.calls.list() : Promise.resolve(calls ?? [])),
    [calls],
  );
  const list = calls === undefined ? (own.state.status === 'ready' ? own.state.data : null) : calls;
  if (!list || list.length === 0) return null;

  const withPeople = list.filter((c) => c.members.length > 0);
  const active = withPeople.filter((c) => !c.roomId || !shownRoomIds?.includes(c.roomId));
  if (shownRoomIds && active.length === 0) return null;

  return (
    <Section
      title="Calls agora"
      count={active.length > 0 ? active.length : undefined}
      description="Gente nos canais de voz do Discord."
    >
      {active.length === 0 ? (
        <EmptyState title="Não tem call ativa.">
          Quando alguém entrar numa call habilitada, ela aparece aqui.
        </EmptyState>
      ) : (
        <ul className="widget-grid stagger" aria-label="Calls agora">
          {active.map((call) => (
            <li key={call.id} className="sp-card" data-testid="call">
              <div className="sp-cover" data-tone={call.mediaState === 'IDLE' ? 'idle' : 'live'}>
                <span className="sp-cover-badge">
                  <CoverChip icon="mic">Na call</CoverChip>
                </span>
                <AvatarStack people={call.members} max={4} />
              </div>
              <h3 className="sp-card-title">{call.name}</h3>
              <p className="sp-card-sub">
                {call.members.length} {call.members.length === 1 ? 'pessoa' : 'pessoas'} no canal de
                voz
              </p>
              <div className="sp-card-actions">
                {call.roomId ? (
                  <Link to={`/r/${call.roomId}`} className="btn btn-secondary btn-sm">
                    Abrir a sala{call.mediaState === 'IDLE' ? ' (ativa a sessão)' : ''}
                  </Link>
                ) : (
                  <p className="sp-card-note">A sala abre em instantes.</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
