import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Avatar, EmptyState, Section, StatusDot } from './ui';

/**
 * Só as calls que têm gente agora. Call vazia não aparece (mesmo estando habilitada para live).
 * Sem nenhuma ativa, uma caixa simples avisa. Se não há calls configuradas, a seção some.
 */
export function CallsSection() {
  const { state } = useAsync(() => api.calls.list());
  if (state.status !== 'ready' || state.data.length === 0) return null;

  const active = state.data.filter((c) => c.members.length > 0);

  return (
    <Section title="Calls agora">
      {active.length === 0 ? (
        <EmptyState title="Não tem call ativa.">
          Quando alguém entrar numa call habilitada, ela aparece aqui.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-zinc-800 border-y border-zinc-800" aria-label="Calls agora">
          {active.map((call) => (
            <li key={call.id} className="flex items-center gap-4 py-3" data-testid="call">
              <StatusDot tone="open" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-zinc-50">{call.name}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {call.members.map((m) => (
                    <li key={m.userId} title={m.displayName ?? m.userId}>
                      <Avatar name={m.displayName ?? '?'} url={m.avatarUrl} size="sm" />
                    </li>
                  ))}
                </ul>
              </div>
              {call.roomId ? (
                <Link
                  to={`/r/${call.roomId}`}
                  className="text-sm font-medium text-brand-400 underline underline-offset-2"
                >
                  Abrir a sala{call.mediaState === 'IDLE' ? ' (ativa a sessão)' : ''}
                </Link>
              ) : (
                <p className="max-w-[14rem] text-right text-xs text-zinc-500">
                  A sala abre em instantes.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
