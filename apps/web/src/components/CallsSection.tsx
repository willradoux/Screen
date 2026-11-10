import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { CallInfo } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { EmptyState, Section } from './ui';
import { CoverChip, WidgetCover, WidgetStat } from './Widget';

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
            <li key={call.id} className="widget" data-testid="call">
              <WidgetCover
                tone={call.mediaState === 'IDLE' ? 'idle' : 'live'}
                people={call.members}
                left={<CoverChip icon="mic">Na call</CoverChip>}
              />
              <div className="widget-body">
                <div className="widget-head">
                  <h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-zinc-50">
                    {call.name}
                  </h3>
                </div>
                <div className="mt-auto">
                  <WidgetStat
                    icon="group"
                    value={`${call.members.length} ${call.members.length === 1 ? 'pessoa' : 'pessoas'}`}
                    label="no canal de voz"
                  />
                </div>
                <div className="widget-note" />
                <div className="flex justify-center pt-1">
                  {call.roomId ? (
                    <Link to={`/r/${call.roomId}`} className="btn btn-secondary">
                      Abrir a sala{call.mediaState === 'IDLE' ? ' (ativa a sessão)' : ''}
                    </Link>
                  ) : (
                    <p className="text-xs text-zinc-500">A sala abre em instantes.</p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
