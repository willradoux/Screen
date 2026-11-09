import { Link } from 'react-router-dom';
import { Alert, Button, EmptyState, PageTitle, Section, Spinner } from '../components/ui';
import { CallsSection } from '../components/CallsSection';
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
        description="O que está acontecendo agora no servidor."
        action={
          <Button size="sm" onClick={() => void reload()}>
            Atualizar
          </Button>
        }
      >
        Salas
      </PageTitle>

      <div className="space-y-10">
        <CallsSection />

        <Section title="Abertas e agendadas">
          {state.status === 'loading' && <Spinner label="Carregando salas…" />}

          {state.status === 'error' && (
            <Alert tone="error" title="Não foi possível carregar as salas">
              {describeError(state.error)}
            </Alert>
          )}

          {state.status === 'ready' && state.data.length === 0 && (
            <EmptyState title="Nenhuma sala aberta agora.">
              Entre em um canal de voz da categoria de lives no Discord: o bot abre a sala e envia o
              link. Reuniões agendadas aparecem em{' '}
              <Link to="/reunioes" className="text-brand-300 underline underline-offset-2">
                Reuniões
              </Link>
              .
            </EmptyState>
          )}

          {state.status === 'ready' && state.data.length > 0 && (
            <ul className="divide-y divide-zinc-800 border-y border-zinc-800">
              {state.data.map((room) => (
                <li key={room.id}>
                  <RoomCard room={room} onChanged={reload} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
