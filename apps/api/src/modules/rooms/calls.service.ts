import type { DiscordGateway } from '../../discord/gateway.js';
import type { VoiceCache } from '../../discord/voice-cache.js';
import type { SettingsRepo } from '../settings/settings.types.js';
import type { RoomRepo } from './rooms.types.js';

export interface CallInfo {
  id: string;
  name: string;
  members: { userId: string; displayName: string | null; avatarUrl: string | null }[];
  /** Sala de live aberta nessa call, se houver. */
  roomId: string | null;
  mediaState: 'ACTIVE' | 'IDLE' | null;
}

/** Quem está em cada call com live: alimenta o "status das calls" do site. */
export class CallsService {
  constructor(
    private readonly deps: {
      gateway: Pick<DiscordGateway, 'listChannels' | 'getMemberProfile'>;
      settings: SettingsRepo;
      cache: Pick<VoiceCache, 'membersIn'>;
      rooms: Pick<RoomRepo, 'findOpenLiveByChannel'>;
      guildId: string;
    },
  ) {}

  async list(): Promise<CallInfo[]> {
    const s = await this.deps.settings.get(this.deps.guildId);
    if (!s.liveCategoryId && s.liveChannelIds.length === 0) return [];
    const channels = await this.deps.gateway.listChannels();
    const calls = channels.filter(
      (c) =>
        c.kind === 'voice' &&
        (s.liveChannelIds.includes(c.id) || (s.liveCategoryId && c.parentId === s.liveCategoryId)),
    );

    return Promise.all(
      calls.map(async (c) => {
        const ids = this.deps.cache.membersIn(c.id).slice(0, 30);
        const members = await Promise.all(
          ids.map(async (userId) => {
            const p = await this.deps.gateway.getMemberProfile(userId).catch(() => null);
            return { userId, displayName: p?.displayName ?? null, avatarUrl: p?.avatarUrl ?? null };
          }),
        );
        const room = await this.deps.rooms.findOpenLiveByChannel(c.id);
        return {
          id: c.id,
          name: c.name,
          members,
          roomId: room?.id ?? null,
          mediaState: room?.mediaState ?? null,
        };
      }),
    );
  }
}
