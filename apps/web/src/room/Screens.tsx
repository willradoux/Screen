import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { QrCode } from '../components/QrCode';
import { Button } from '../components/ui';
import { StatusCard } from '../components/StatusCard';
import { CoverChip, WidgetCover, WidgetStat } from '../components/Widget';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { formatDateTime, formatDuration, timeUntil } from '../lib/format';
import { messageFor } from '../lib/errors';
import type { AccessResult, CallInfo, EndReason, Room } from '../lib/types';
import { useNow } from '../pages/MeetingsPage';

/** Centraliza os estados da sala na área do painel, com respiro em cima e embaixo. */
function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="rise mx-auto flex min-h-[calc(100dvh-10rem)] w-full max-w-md flex-col justify-center gap-4 py-6">
      {children}
    </div>
  );
}

const BackHome = () => (
  <Link to="/" className="btn btn-ghost btn-sm w-fit">
    <Icon name="arrow_back" size="1rem" />
    Voltar para as salas
  </Link>
);

export function CheckingScreen() {
  return (
    <Center>
      <StatusCard icon="lock" tone="wait" title="Só um instante" waiting="Verificando seu acesso…">
        Conferindo se você pode entrar nesta sala.
      </StatusCard>
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
          <StatusCard
            icon="mic"
            tone="wait"
            title="Entre na call para participar"
            waiting="Verificando a cada poucos segundos — você entra sozinho assim que estiver na call."
            actions={<BackHome />}
          >
            <p>
              {access.voiceChannelName
                ? `Entre no canal de voz “${access.voiceChannelName}” no Discord.`
                : 'Entre no canal de voz desta live no Discord.'}{' '}
              Só quem está na call pode assistir e transmitir.
            </p>
          </StatusCard>
        </Center>
      );

    case 'ROOM_NOT_OPEN':
      if (access.status === 'SCHEDULED') {
        return (
          <Center>
            <StatusCard
              icon="schedule"
              tone="info"
              title={room?.title ?? 'Reunião'}
              waiting="A sala abre sozinha no horário."
              actions={<BackHome />}
            >
              <p>
                Começa em {formatDateTime(access.startsAt)}
                {left !== null && (
                  <strong className="text-zinc-50"> · faltam {formatDuration(left)}</strong>
                )}
                .
              </p>
            </StatusCard>
          </Center>
        );
      }
      return (
        <Center>
          <StatusCard
            icon={access.status === 'CANCELED' ? 'cancel' : 'call_end'}
            tone="warning"
            title={access.status === 'CANCELED' ? 'Reunião cancelada' : 'Sala encerrada'}
            actions={<BackHome />}
          >
            <p>
              {access.status === 'CANCELED'
                ? 'Esta reunião foi cancelada.'
                : 'Esta sala já foi encerrada.'}
            </p>
          </StatusCard>
        </Center>
      );

    case 'BANNED_FROM_ROOM':
      return (
        <Center>
          <StatusCard
            icon="block"
            tone="error"
            title="Você foi removido desta sala"
            actions={<BackHome />}
          >
            <p>
              {access.expiresAt
                ? `Você poderá voltar depois de ${formatDateTime(access.expiresAt)}.`
                : 'Você não poderá voltar a esta sala.'}
            </p>
          </StatusCard>
        </Center>
      );

    case 'ROLE_NOT_ALLOWED':
      return (
        <Center>
          <StatusCard icon="lock" tone="warning" title="Reunião restrita" actions={<BackHome />}>
            <p>{messageFor('ROLE_NOT_ALLOWED')}</p>
          </StatusCard>
        </Center>
      );

    case 'ROOM_FULL':
      return (
        <Center>
          <StatusCard
            icon="group"
            tone="wait"
            title="A sala está lotada"
            waiting="Tentando de novo a cada poucos segundos."
            actions={<BackHome />}
          >
            <p>Limite de {access.maxParticipants ?? room?.maxParticipants} pessoas.</p>
          </StatusCard>
        </Center>
      );

    default:
      return (
        <Center>
          <StatusCard
            icon="warning"
            tone="warning"
            title="Não é possível entrar agora"
            actions={<BackHome />}
          >
            <p>{access.hint ?? 'Tente novamente em instantes.'}</p>
          </StatusCard>
        </Center>
      );
  }
}

/**
 * Antes de conectar: uma peça só, com o que a pessoa precisa saber e um botão. O clique em
 * "Entrar" é o gesto que libera áudio e captura no navegador.
 */
export function ReadyScreen({ room, onJoin }: { room: Room; onJoin: () => void }) {
  const link = room.url || (typeof location !== 'undefined' ? location.href : '');
  const [qr, setQr] = useState(false);
  const idle = room.type === 'LIVE' && room.mediaState === 'IDLE';
  const people = room.participantCount;
  // Quem está na call do Discord agora (só lives). Busca uma vez, sem repetir.
  const calls = useAsync(() =>
    room.type === 'LIVE' ? api.calls.list() : Promise.resolve([] as CallInfo[]),
  );
  const members =
    calls.state.status === 'ready'
      ? calls.state.data.find((c) => c.roomId === room.id)?.members
      : undefined;

  return (
    <Center>
      <article className="widget widget-hero">
        <WidgetCover
          tone={idle ? 'idle' : 'live'}
          people={members}
          left={
            <CoverChip icon={room.type === 'LIVE' ? 'videocam' : 'calendar_month'}>
              {room.type === 'LIVE' ? 'Live' : 'Reunião'}
            </CoverChip>
          }
          right={<CoverChip icon="lock">Acesso verificado</CoverChip>}
        />
        <div
          className="widget-body"
          data-people={members && members.length > 0 ? 'true' : undefined}
        >
          <div>
            <h2 className="text-xl font-bold leading-tight text-zinc-50 sm:text-2xl">
              {room.title}
            </h2>
            {room.description && (
              <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-400">{room.description}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <WidgetStat
              icon="group"
              value={
                people === 0 ? 'ninguém ainda' : `${people} ${people === 1 ? 'pessoa' : 'pessoas'}`
              }
              label="na sala"
            />
            <WidgetStat icon="videocam_off" value="Tudo desligado" label="ao entrar" />
          </div>

          <p className="text-xs leading-relaxed text-zinc-500">
            <strong className="text-zinc-300">Câmera e microfone começam desligados.</strong> Você
            liga o que quiser lá dentro.
          </p>

          {idle && (
            <p className="rounded-xl bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-200">
              <strong>Sessão em espera:</strong> ao entrar você a ativa. Comece a transmitir em
              alguns minutos para ela não voltar para a espera.
            </p>
          )}

          <Button variant="primary" size="lg" className="w-full" onClick={onJoin}>
            Entrar na sala
          </Button>

          <div className="flex items-center justify-between gap-2">
            <BackHome />
            <button
              type="button"
              aria-expanded={qr}
              onClick={() => setQr((v) => !v)}
              className="btn btn-ghost btn-sm"
            >
              <Icon name="qr_code_2" size="1rem" />
              Abrir no celular
            </button>
          </div>

          {qr && (
            <div className="pop-in flex flex-col items-center gap-2 pt-1">
              <QrCode value={link} size={160} />
              <p className="text-xs text-zinc-500">Aponte a câmera do celular para o código.</p>
            </div>
          )}
        </div>
      </article>
    </Center>
  );
}

/** Conectando. Se a live estava em espera, o próprio clique ativa a sessão: avisa isso. */
export function JoiningScreen({ activating = false }: { activating?: boolean }) {
  return (
    <Center>
      <StatusCard
        icon="videocam"
        tone="wait"
        title={activating ? 'Ativando a sessão' : 'Entrando na sala'}
        waiting={activating ? 'Ativando sessão…' : 'Conectando à sala…'}
      >
        {activating && (
          <p>A sessão estava em espera porque ninguém estava usando. Em instantes você entra.</p>
        )}
      </StatusCard>
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
      <StatusCard
        icon="bedtime"
        tone="info"
        title="Sessão em espera"
        actions={
          <>
            <Button variant="primary" size="lg" onClick={onActivate}>
              Ativar sessão
            </Button>
            <BackHome />
          </>
        }
      >
        <p>
          {reason === 'NOBODY_CONNECTED'
            ? 'Ninguém estava conectado, então a sessão de vídeo foi pausada.'
            : 'Ninguém estava transmitindo câmera ou tela, então a sessão de vídeo foi pausada.'}{' '}
          A live continua aberta no Discord.
        </p>
        <p className="text-[13px] text-zinc-500">
          Ao ativar de novo, alguém precisa começar a transmitir em alguns minutos, senão ela volta
          para a espera.
        </p>
      </StatusCard>
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
      <StatusCard icon="call_end" tone="info" title="Sala encerrada" actions={<BackHome />}>
        <p>{END_TEXT[reason] ?? 'A sala foi encerrada.'}</p>
      </StatusCard>
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
      <StatusCard
        icon={action === 'BANNED' ? 'block' : 'person_remove'}
        tone="error"
        title={action === 'BANNED' ? 'Você foi banido desta sala' : 'Você foi removido da sala'}
        actions={<BackHome />}
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
      </StatusCard>
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
      <StatusCard
        icon={code === 'NETWORK_ERROR' ? 'wifi_off' : 'error'}
        tone="error"
        title="Não foi possível entrar na sala"
        actions={
          <>
            {retryable && (
              <Button variant="primary" onClick={onRetry}>
                Tentar de novo
              </Button>
            )}
            <BackHome />
          </>
        }
      >
        <p>{message}</p>
      </StatusCard>
    </Center>
  );
}
