import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Avatar, Section, StatusDot } from './ui';

/** Quem está em cada call com live agora. Some se não houver calls configuradas. */
export function CallsSection() {
  const { state } = useAsync(() => api.calls.list());
  if (state.status !== 'ready' || state.data.length === 0) return null;

  return (
    <Section title="Calls agora" description="Quem está em cada call com live neste momento.">
      <ul className="divide-y divide-zinc-800 border-y border-zinc-800" aria-label="Calls agora">
        {state.data.map((call) => (
          <li key={call.id} className="flex items-center gap-4 py-3" data-testid="call">
            <StatusDot tone={call.members.length > 0 ? 'open' : 'off'} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-50">{call.name}</p>
              {call.members.length > 0 ? (
                <ul className="mt-1.5 flex flex-wrap gap-1">
                  {call.members.map((m) => (
                    <li key={m.userId} title={m.displayName ?? m.userId}>
                      <Avatar name={m.displayName ?? '?'} url={m.avatarUrl} size="sm" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">vazia</p>
              )}
            </div>
            {call.roomId ? (
              <Link
                to={`/r/${call.roomId}`}
                className="text-sm font-medium text-brand-300 underline underline-offset-2"
              >
                Abrir a sala{call.mediaState === 'IDLE' ? ' (ativa a sessão)' : ''}
              </Link>
            ) : (
              <p className="hidden max-w-[14rem] text-right text-xs text-zinc-500 sm:block">
                Entre na call no Discord para abrir a sala.
              </p>
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}
