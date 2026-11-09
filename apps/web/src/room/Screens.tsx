import { Link } from 'react-router-dom';
import { Alert, Button, Card, Spinner } from '../components/ui';
import { formatDateTime, formatDuration, timeUntil } from '../lib/format';
import { messageFor } from '../lib/errors';
import type { AccessResult, EndReason, Room } from '../lib/types';
import { useNow } from '../pages/MeetingsPage';

function Center({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-lg space-y-4 py-12">{children}</div>;
}

const BackHome = () => (
  <Link to="/" className="inline-block text-sm text-brand-300 underline">
    Voltar para as salas
  </Link>
);

export function CheckingScreen() {
  return (
    <Center>
      <Spinner label="Verificando seu acesso…" />
    </Center>
  );
}

/** Por que não dá para entrar agora, e o que fazer. */
export function BlockedScreen({ access, room }: { access: AccessResult; room: Room | null }) {
  const now = useNow();
  const left = timeUntil(access.startsAt, now);

  switch (access.reason) {
    case 'NOT_IN_VOICE':
      return (
        <Center>
          <Card className="space-y-3">
            <h2 className="text-xl font-semibold text-zinc-50">Entre na call para participar</h2>
            <p className="text-zinc-300">
              {access.voiceChannelName
                ? `Entre no canal de voz “${access.voiceChannelName}” no Discord.`
                : 'Entre no canal de voz desta live no Discord.'}{' '}
              Só quem está na call pode assistir e transmitir.
            </p>
            <Spinner
              size="sm"
              label="Verificando a cada poucos segundos — você entra sozinho assim que estiver na call."
            />
          </Card>
          <BackHome />
        </Center>
      );

    case 'ROOM_NOT_OPEN':
      if (access.status === 'SCHEDULED') {
        return (
          <Center>
            <Card className="space-y-3">
              <h2 className="text-xl font-semibold text-zinc-50">{room?.title ?? 'Reunião'}</h2>
              <p className="text-zinc-300">
                Começa em {formatDateTime(access.startsAt)}
                {left !== null && (
                  <strong className="text-zinc-50"> · faltam {formatDuration(left)}</strong>
                )}
                .
              </p>
              <Spinner size="sm" label="A sala abre sozinha no horário." />
            </Card>
            <BackHome />
          </Center>
        );
      }
      return (
        <Center>
          <Alert
            tone="warning"
            title={access.status === 'CANCELED' ? 'Reunião cancelada' : 'Sala encerrada'}
          >
            {access.status === 'CANCELED'
              ? 'Esta reunião foi cancelada.'
              : 'Esta sala já foi encerrada.'}
          </Alert>
          <BackHome />
        </Center>
      );

    case 'BANNED_FROM_ROOM':
      return (
        <Center>
          <Alert tone="error" title="Você foi removido desta sala">
            {access.expiresAt
              ? `Você poderá voltar depois de ${formatDateTime(access.expiresAt)}.`
              : 'Você não poderá voltar a esta sala.'}
          </Alert>
          <BackHome />
        </Center>
      );

    case 'ROLE_NOT_ALLOWED':
      return (
        <Center>
          <Alert tone="warning" title="Reunião restrita">
            {messageFor('ROLE_NOT_ALLOWED')}
          </Alert>
          <BackHome />
        </Center>
      );

    case 'ROOM_FULL':
      return (
        <Center>
          <Card className="space-y-3">
            <h2 className="text-xl font-semibold text-zinc-50">A sala está lotada</h2>
            <p className="text-zinc-300">
              Limite de {access.maxParticipants ?? room?.maxParticipants} pessoas.
            </p>
            <Spinner size="sm" label="Tentando de novo a cada poucos segundos." />
          </Card>
          <BackHome />
        </Center>
      );

    default:
      return (
        <Center>
          <Alert tone="warning" title="Não é possível entrar agora">
            {access.hint ?? 'Tente novamente em instantes.'}
          </Alert>
          <BackHome />
        </Center>
      );
  }
}

/** Antes de conectar: o clique em "Entrar" libera o áudio e a captura no navegador. */
export function ReadyScreen({ room, onJoin }: { room: Room; onJoin: () => void }) {
  return (
    <Center>
      <Card className="space-y-4 text-center">
        <p className="text-sm font-medium text-brand-300">
          {room.type === 'LIVE' ? 'Live' : 'Reunião'}
        </p>
        <h2 className="text-2xl font-bold text-zinc-50">{room.title}</h2>
        {room.description && <p className="text-zinc-400">{room.description}</p>}
        <p className="text-sm text-zinc-500">
          {room.participantCount} {room.participantCount === 1 ? 'pessoa' : 'pessoas'} na sala.
          Câmera e microfone começam desligados.
        </p>
        {room.type === 'LIVE' && room.mediaState === 'IDLE' && (
          <p className="text-sm text-amber-300">
            A sessão está em espera. Ao entrar você a ativa; comece a transmitir em alguns minutos
            para ela não voltar para a espera.
          </p>
        )}
        <Button variant="primary" className="w-full py-3 text-lg" onClick={onJoin}>
          Entrar na sala
        </Button>
      </Card>
      <BackHome />
    </Center>
  );
}

/** Conectando. Se a live estava em espera, o próprio clique ativa a sessão: avisa isso. */
export function JoiningScreen({ activating = false }: { activating?: boolean }) {
  return (
    <Center>
      <Spinner label={activating ? 'Ativando sessão…' : 'Conectando à sala…'} />
      {activating && (
        <p className="text-center text-sm text-zinc-500">
          A sessão estava em espera porque ninguém estava usando. Em instantes você entra.
        </p>
      )}
    </Center>
  );
}

/** A sessão ficou em espera: o link continua valendo, é só ativar de novo. */
export function IdleScreen({
  reason,
  onActivate,
}: {
  reason: 'NOBODY_CONNECTED' | 'NOBODY_STREAMING' | null;
  onActivate: () => void;
}) {
  return (
    <Center>
      <Card className="space-y-4 text-center">
        <h2 className="text-xl font-semibold text-zinc-50">Sessão em espera</h2>
        <p className="text-zinc-300">
          {reason === 'NOBODY_CONNECTED'
            ? 'Ninguém estava conectado, então a sessão de vídeo foi pausada.'
            : 'Ninguém estava transmitindo câmera ou tela, então a sessão de vídeo foi pausada.'}{' '}
          A live continua aberta no Discord.
        </p>
        <p className="text-sm text-zinc-500">
          Ao ativar de novo, alguém precisa começar a transmitir em alguns minutos, senão ela volta
          para a espera.
        </p>
        <Button variant="primary" className="w-full py-3 text-lg" onClick={onActivate}>
          Ativar sessão
        </Button>
      </Card>
      <BackHome />
    </Center>
  );
}

const END_TEXT: Record<EndReason, string> = {
  ENDED_BY_MOD: 'Um moderador encerrou a sala.',
  ENDED_BY_ADMIN: 'Um administrador encerrou a sala.',
  VOICE_EMPTY: 'Todo mundo saiu do canal de voz, então a live foi encerrada.',
  MEETING_FINISHED: 'A reunião terminou.',
  CANCELED: 'A reunião foi cancelada.',
};

export function EndedScreen({ reason }: { reason: EndReason }) {
  return (
    <Center>
      <Alert tone="info" title="Sala encerrada">
        {END_TEXT[reason] ?? 'A sala foi encerrada.'}
      </Alert>
      <BackHome />
    </Center>
  );
}

export function RemovedScreen({
  action,
  reason,
  expiresAt,
}: {
  action: 'KICKED' | 'BANNED';
  reason: string | null;
  expiresAt: string | null;
}) {
  return (
    <Center>
      <Alert
        tone="error"
        title={action === 'BANNED' ? 'Você foi banido desta sala' : 'Você foi removido da sala'}
      >
        {reason && <p>Motivo: {reason}</p>}
        {action === 'BANNED' && (
          <p>
            {expiresAt
              ? `Você poderá voltar depois de ${formatDateTime(expiresAt)}.`
              : 'Você não poderá voltar a esta sala.'}
          </p>
        )}
        {action === 'KICKED' && <p>Você pode entrar de novo, se ainda tiver acesso.</p>}
      </Alert>
      <BackHome />
    </Center>
  );
}

export function ErrorScreen({
  code,
  message,
  onRetry,
}: {
  code: string;
  message: string;
  onRetry: () => void;
}) {
  const retryable = !['ROOM_NOT_FOUND', 'UNAUTHENTICATED'].includes(code);
  return (
    <Center>
      <Alert tone="error" title="Não foi possível entrar na sala">
        {message}
      </Alert>
      <div className="flex items-center gap-3">
        {retryable && (
          <Button variant="primary" onClick={onRetry}>
            Tentar de novo
          </Button>
        )}
        <BackHome />
      </div>
    </Center>
  );
}
