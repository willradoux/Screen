import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from './Icon';
import { Avatar, Badge, Card } from './ui';

/** Quem está em cada call com live agora. Some se não houver calls configuradas. */
export function CallsSection() {
  const { state } = useAsync(() => api.calls.list());
  if (state.status !== 'ready' || state.data.length === 0) return null;

  return (
    <section aria-label="Calls agora" className="mb-8">
      <h2 className="mb-3 font-display text-lg font-semibold text-zinc-50">Calls agora</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {state.data.map((call) => (
          <li key={call.id}>
            <Card className="space-y-3 p-4" data-testid="call">
              <div className="flex items-center gap-2">
                <Icon name="mic" className="text-zinc-400" />
                <h3 className="flex-1 truncate font-semibold text-zinc-50">{call.name}</h3>
                {call.members.length > 0 ? (
                  <Badge tone="live">{call.members.length}</Badge>
                ) : (
                  <Badge>vazia</Badge>
                )}
              </div>
              {call.members.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {call.members.map((m) => (
                    <li key={m.userId} title={m.displayName ?? m.userId}>
                      <Avatar name={m.displayName ?? '?'} url={m.avatarUrl} size="sm" />
                    </li>
                  ))}
                </ul>
              )}
              {call.roomId ? (
                <Link
                  to={`/r/${call.roomId}`}
                  className="text-sm font-medium text-brand-300 underline"
                >
                  Abrir a sala{call.mediaState === 'IDLE' ? ' (ativa a sessão)' : ''}
                </Link>
              ) : (
                <p className="text-xs text-zinc-500">Entre na call no Discord para abrir a sala.</p>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}
