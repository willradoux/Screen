import { createHash } from 'node:crypto';
import { AccessToken, RoomServiceClient, TrackSource, WebhookReceiver } from 'livekit-server-sdk';
import type { Env } from '../../config/env.js';

/** Fontes de mídia que um participante pode publicar. */
export type MediaSource = 'microphone' | 'camera' | 'screen_share' | 'screen_share_audio';

export const ALL_SOURCES: MediaSource[] = [
  'microphone',
  'camera',
  'screen_share',
  'screen_share_audio',
];

export interface TokenRequest {
  roomName: string;
  /** ID do Discord: único e estável (uma conexão nova derruba a antiga). */
  identity: string;
  name: string;
  /** JSON com `role` e `avatarUrl`. */
  metadata: string;
  canPublish: boolean;
  canPublishSources: MediaSource[];
  roomAdmin: boolean;
  ttlSeconds: number;
}

/** Evento de webhook já validado e reduzido ao que usamos. */
export interface LiveKitEvent {
  event: string;
  roomName: string | null;
  participant: {
    identity: string;
    name: string;
    metadata: string;
    /**
     * Por que saiu (só em `participant_left`): `client` = pediu para sair;
     * `duplicate` = outra conexão com a mesma identidade a substituiu; `other` = queda ou remoção.
     */
    leaveCause: 'client' | 'duplicate' | 'other';
  } | null;
}

/** Participante conectado, com as faixas publicadas (para saber se alguém está transmitindo). */
export interface LiveKitParticipantInfo {
  identity: string;
  tracks: { source: MediaSource | 'unknown'; muted: boolean }[];
}

/** Falha de comunicação com o servidor de mídia. */
export class LiveKitUnavailableError extends Error {}
/** Webhook sem assinatura válida. */
export class InvalidWebhookError extends Error {}

/** Fronteira com o LiveKit. Em testes é substituída por um fake. */
export interface LiveKitGateway {
  createToken(req: TokenRequest): Promise<string>;
  /** Cria a sala no LiveKit (idempotente) com o limite de participantes. */
  ensureRoom(roomName: string, maxParticipants: number): Promise<void>;
  removeParticipant(roomName: string, identity: string): Promise<void>;
  /**
   * Troca o que a pessoa pode publicar, com a conexão já aberta. Revogar uma fonte
   * derruba o que estava no ar dela.
   */
  setPermissions(
    roomName: string,
    identity: string,
    permissions: { canPublish: boolean; canPublishSources: MediaSource[] },
  ): Promise<void>;
  /** Silencia as faixas já publicadas nessas fontes. Ignora quem já saiu. */
  muteSources(roomName: string, identity: string, sources: MediaSource[]): Promise<void>;
  deleteRoom(roomName: string): Promise<void>;
  /** Quem está conectado e o que está transmitindo. Sala que não existe = lista vazia. */
  listParticipants(roomName: string): Promise<LiveKitParticipantInfo[]>;
  /** Valida a assinatura e devolve o evento. Lança `InvalidWebhookError`. */
  verifyWebhook(rawBody: string, authHeader: string | undefined): Promise<LiveKitEvent>;
}

const SOURCE_TO_ENUM: Record<MediaSource, TrackSource> = {
  microphone: TrackSource.MICROPHONE,
  camera: TrackSource.CAMERA,
  screen_share: TrackSource.SCREEN_SHARE,
  screen_share_audio: TrackSource.SCREEN_SHARE_AUDIO,
};

const ENUM_TO_SOURCE = new Map<TrackSource, MediaSource>(
  (Object.entries(SOURCE_TO_ENUM) as [MediaSource, TrackSource][]).map(([k, v]) => [v, k]),
);

// DisconnectReason do protocolo do LiveKit.
const CLIENT_INITIATED = 1;
const DUPLICATE_IDENTITY = 2;

type LiveKitEnv = Pick<Env, 'LIVEKIT_URL' | 'LIVEKIT_API_KEY' | 'LIVEKIT_API_SECRET'>;

export function createLiveKitGateway(env: LiveKitEnv): LiveKitGateway {
  const rooms = new RoomServiceClient(env.LIVEKIT_URL, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const receiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

  const call = async <T>(what: string, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      throw new LiveKitUnavailableError(`LiveKit: falha ao ${what}: ${String(err)}`);
    }
  };

  return {
    async createToken(req) {
      const at = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
        identity: req.identity,
        name: req.name,
        metadata: req.metadata,
        ttl: req.ttlSeconds,
      });
      at.addGrant({
        room: req.roomName,
        roomJoin: true,
        canSubscribe: true,
        canPublish: req.canPublish,
        canPublishSources: req.canPublish
          ? req.canPublishSources.map((s) => SOURCE_TO_ENUM[s])
          : [],
        // O chat vai pelo Socket.IO, não pelo data channel.
        canPublishData: false,
        roomAdmin: req.roomAdmin,
      });
      return at.toJwt();
    },

    ensureRoom: (roomName, maxParticipants) =>
      call('criar a sala', async () => {
        await rooms.createRoom({
          name: roomName,
          maxParticipants,
          // Mantém a sala viva por um tempo após a última saída (reconexões).
          departureTimeout: 60,
          emptyTimeout: 300,
        });
      }),

    removeParticipant: (roomName, identity) =>
      call('remover participante', async () => {
        try {
          await rooms.removeParticipant(roomName, identity);
        } catch (err) {
          // Já saiu ou a sala já não existe: o resultado é o mesmo que queríamos.
          if (isNotFound(err)) return;
          throw err;
        }
      }),

    setPermissions: (roomName, identity, permissions) =>
      call('alterar permissões', async () => {
        try {
          await rooms.updateParticipant(roomName, identity, undefined, {
            canPublish: permissions.canPublish,
            canSubscribe: true,
            canPublishData: false,
            canPublishSources: permissions.canPublish
              ? permissions.canPublishSources.map((s) => SOURCE_TO_ENUM[s])
              : [],
          });
        } catch (err) {
          if (isNotFound(err)) return; // já saiu
          throw err;
        }
      }),

    muteSources: (roomName, identity, sources) =>
      call('silenciar faixas', async () => {
        try {
          const info = await rooms.getParticipant(roomName, identity);
          const wanted = new Set(sources.map((s) => SOURCE_TO_ENUM[s]));
          for (const track of info.tracks) {
            if (wanted.has(track.source) && !track.muted) {
              await rooms.mutePublishedTrack(roomName, identity, track.sid, true);
            }
          }
        } catch (err) {
          if (isNotFound(err)) return;
          throw err;
        }
      }),

    deleteRoom: (roomName) =>
      call('encerrar a sala', async () => {
        try {
          await rooms.deleteRoom(roomName);
        } catch (err) {
          if (isNotFound(err)) return;
          throw err;
        }
      }),

    listParticipants: (roomName) =>
      call('listar participantes', async () => {
        try {
          const list = await rooms.listParticipants(roomName);
          return list.map((p) => ({
            identity: p.identity,
            tracks: p.tracks.map((t) => ({
              source: ENUM_TO_SOURCE.get(t.source) ?? 'unknown',
              muted: t.muted,
            })),
          }));
        } catch (err) {
          if (isNotFound(err)) return [];
          throw err;
        }
      }),

    async verifyWebhook(rawBody, authHeader) {
      let event;
      try {
        event = await receiver.receive(rawBody, authHeader);
      } catch (err) {
        throw new InvalidWebhookError(`Webhook inválido: ${String(err)}`);
      }
      const p = event.participant;
      return {
        event: event.event,
        roomName: event.room?.name || null,
        participant: p
          ? {
              identity: p.identity,
              name: p.name,
              metadata: p.metadata,
              leaveCause:
                Number(p.disconnectReason) === CLIENT_INITIATED
                  ? 'client'
                  : Number(p.disconnectReason) === DUPLICATE_IDENTITY
                    ? 'duplicate'
                    : 'other',
            }
          : null,
      };
    },
  };
}

function isNotFound(err: unknown): boolean {
  const e = err as { status?: number; code?: string };
  return e?.status === 404 || e?.code === 'not_found';
}

/** Cabeçalho `Authorization` que o LiveKit enviaria. Usado nos testes. */
export async function signWebhookBody(
  body: string,
  apiKey: string,
  apiSecret: string,
): Promise<string> {
  const at = new AccessToken(apiKey, apiSecret);
  at.sha256 = createHash('sha256').update(body).digest('base64');
  return at.toJwt();
}
