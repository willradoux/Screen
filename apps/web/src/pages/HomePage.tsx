import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { CallsSection } from '../components/CallsSection';
import { Icon } from '../components/Icon';
import { RoomCard } from '../components/RoomCard';
import { Alert, Button, EmptyState, PageTitle, Section } from '../components/ui';
import { Loader } from '../components/Loader';
import { api } from '../lib/api';
import { describeError } from '../lib/errors';
import type { CallInfo, Room } from '../lib/types';
import { useAsync } from '../lib/useAsync';
import { usePolling } from '../lib/usePolling';
import { useCooldown } from '../lib/useCooldown';

/** Quantas colunas de card a seção ocupa (1 a 4). */
function cols4(n: number): CSSProperties {
  return { '--n': Math.min(4, Math.max(1, n)) } as CSSProperties;
}

/** Cards de salas numa grade; cada sala mostra quem está na call ligada a ela. */
function RoomGrid({
  rooms,
  calls,
  onChanged,
}: {
  rooms: Room[];
  calls: CallInfo[] | null;
  onChanged: () => void;
}) {
  return (
    <ul className="widget-grid stagger">
      {rooms.map((room) => (
        <li key={room.id} className="flex">
          <RoomCard
            room={room}
            onChanged={onChanged}
            members={calls?.find((c) => c.roomId === room.id)?.members}
          />
        </li>
      ))}
    </ul>
  );
}

/** Resumo de uma linha: "2 abertas · 1 agendada". */
function summary(open: number, scheduled: number) {
  const parts = [
    `${open} ${open === 1 ? 'aberta' : 'abertas'}`,
    `${scheduled} ${scheduled === 1 ? 'agendada' : 'agendadas'}`,
  ];
  return parts.join(' · ');
}

/**
 * Início: o que está acontecendo agora. Calls com gente, salas abertas e reuniões
 * agendadas, e nada mais (o "como funciona" mora no Guia).
 */
export function HomePage() {
  const { state, reload } = useAsync(async () => (await api.rooms.list({ limit: 50 })).data);
  // As calls são buscadas uma vez só e servem às duas seções (sem pedir de novo ao servidor).
  const callsReq = useAsync(() => api.calls.list());
  const calls = callsReq.state.status === 'ready' ? callsReq.state.data : null;
  // Atualiza sozinho (sem piscar): salas a cada 20 s (só banco); calls a cada 60 s (perguntam
  // ao Discord, que tem limite de pedidos). Aba escondida não consulta.
  usePolling(() => void reload({ silent: true }), 20_000);
  usePolling(() => void callsReq.reload({ silent: true }), 60_000);
  const cooldown = useCooldown(4000);
  const rooms = state.status === 'ready' ? state.data : [];
  const open = rooms.filter((room) => room.status === 'OPEN').length;
  const scheduled = rooms.filter((room) => room.status === 'SCHEDULED').length;
  const live = rooms.filter((room) => room.status === 'OPEN');
  const later = rooms.filter((room) => room.status !== 'OPEN');
  const roomIds = rooms.map((room) => room.id);
  const extraCalls = (calls ?? []).filter(
    (c) => c.members.length > 0 && (!c.roomId || !roomIds.includes(c.roomId)),
  ).length;
  // As seções ficam lado a lado, cada uma com a largura dos seus cards (até 4 por linha). O
  // bloco inteiro (título da página junto) tem a largura da fileira e fica no meio.
  const counts = [live.length, extraCalls, later.length].filter((n) => n > 0);
  const cols = counts.map((n) => Math.min(4, n));
  const cards = cols.reduce((sum, n) => sum + n, 0) || 1;
  const innerGaps = cols.reduce((sum, n) => sum + n - 1, 0);
  const sectionGaps = Math.max(0, cols.length - 1);
  const boardWidth = `calc(${cards} * var(--card) + ${innerGaps} * 14px + ${sectionGaps} * var(--board-gap))`;
  // Cards da mesma altura entre as seções só quando cada seção cabe numa linha só.
  const oneRow = counts.every((n) => n <= 4);

  return (
    <div
      className="board"
      style={counts.length > 0 ? ({ '--board-w': boardWidth } as CSSProperties) : undefined}
    >
      <PageTitle
        description={
          state.status === 'ready'
            ? summary(open, scheduled)
            : 'Lives das calls e reuniões da comunidade.'
        }
        action={
          <Button
            variant="ghost"
            size="sm"
            disabled={cooldown.active}
            onClick={() =>
              cooldown.run(() => {
                void reload();
                void callsReq.reload({ silent: true });
              })
            }
          >
            <Icon name="refresh" size="1rem" />
            Atualizar
          </Button>
        }
      >
        Salas
      </PageTitle>

      <div className="board-row" data-even={oneRow || undefined}>
        {state.status === 'loading' && <Loader label="Carregando salas…" />}

        {state.status === 'error' && (
          <Alert tone="error" title="Não foi possível carregar as salas">
            {describeError(state.error)}
          </Alert>
        )}

        {state.status === 'ready' && live.length > 0 && (
          <div className="board-col" style={cols4(live.length)}>
            <Section
              title="Ao vivo agora"
              count={live.length}
              description="Entre para falar, mostrar a tela ou só assistir."
            >
              <RoomGrid rooms={live} calls={calls} onChanged={reload} />
            </Section>
          </div>
        )}

        {state.status === 'ready' && (
          <div className="board-col" style={cols4(extraCalls)}>
            <CallsSection calls={calls} shownRoomIds={roomIds} />
          </div>
        )}

        {state.status === 'ready' && later.length > 0 && (
          <div className="board-col" style={cols4(later.length)}>
            <Section
              title="Agendadas"
              count={later.length}
              description="Reuniões marcadas. A sala abre no horário."
            >
              <RoomGrid rooms={later} calls={calls} onChanged={reload} />
            </Section>
          </div>
        )}

        {state.status === 'ready' && state.data.length === 0 && (
          <EmptyState title="Nenhuma sala aberta agora.">
            Entre num canal de voz da categoria de lives no Discord: o bot abre a sala e manda o
            link. Reuniões marcadas ficam em{' '}
            <Link to="/reunioes" className="link-quiet">
              Reuniões
            </Link>
            .
          </EmptyState>
        )}
      </div>
    </div>
  );
}
