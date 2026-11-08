import { Link } from 'react-router-dom';
import { Alert, Button, Card, PageTitle, Spinner } from '../components/ui';
import { RoomCard } from '../components/RoomCard';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import { useAsync } from '../lib/useAsync';

/** Salas abertas e reuniões agendadas. */
export function HomePage() {
  const { state, reload } = useAsync(async () => (await api.rooms.list({ limit: 50 })).data);

  return (
    <>
      <PageTitle
        action={
          <Button size="sm" onClick={() => void reload()}>
            Atualizar
          </Button>
        }
      >
        Salas
      </PageTitle>

      {state.status === 'loading' && <Spinner label="Carregando salas…" />}

      {state.status === 'error' && (
        <Alert tone="error" title="Não foi possível carregar as salas">
          {describeError(state.error)}
        </Alert>
      )}

      {state.status === 'ready' && state.data.length === 0 && (
        <Card className="space-y-2 text-center">
          <p className="text-zinc-200">Nenhuma sala aberta agora.</p>
          <p className="text-sm text-zinc-500">
            Entre em um canal de voz da categoria de lives no Discord: o bot abre a sala e envia o
            link. Reuniões agendadas aparecem em{' '}
            <Link to="/reunioes" className="text-brand-300 underline">
              Reuniões
            </Link>
            .
          </p>
        </Card>
      )}

      {state.status === 'ready' && state.data.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {state.data.map((room) => (
            <li key={room.id}>
              <RoomCard room={room} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
