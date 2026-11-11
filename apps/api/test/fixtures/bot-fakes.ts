import { randomToken } from '../../src/shared/crypto.js';
import { ConfigHandler } from '../../src/discord/commands/config-handler.js';
import { MeetingHandler } from '../../src/discord/commands/meeting-handler.js';
import { CommandRouter } from '../../src/discord/commands/router.js';
import type { CommandActor, CommandCall } from '../../src/discord/commands/types.js';
import type {
  ChannelInfo,
  DiscordGateway,
  MemberPermissions,
  MemberProfile,
  RoleInfo,
  MessagePayload,
  VoiceStateEntry,
} from '../../src/discord/gateway.js';
import { LiveVoiceHandler } from '../../src/discord/live-handler.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { buildReport, summarize } from '../../src/modules/meetings/report.js';
import { MeetingService } from '../../src/modules/meetings/meetings.service.js';
import { MeetingScheduler } from '../../src/modules/meetings/scheduler.js';
import { RoleResolver } from '../../src/modules/permissions/role-resolver.js';
import { VoiceCache } from '../../src/discord/voice-cache.js';
import { RoomAnnouncer } from '../../src/modules/rooms/announcer.js';
import { RoomService } from '../../src/modules/rooms/rooms.service.js';
import type { NewMeeting, RoomRecord, RoomRepo } from '../../src/modules/rooms/rooms.types.js';
import type { Scheduler } from '../../src/shared/scheduler.js';
import { createLogger } from '../../src/shared/logger.js';
import { MemoryAuditRepo } from './audit-fake.js';
import { MemoryParticipations } from './participations-fake.js';
import { ADMIN_ROLE, FakeClock, GUILD_ID, MOD_ROLE, MemorySettings } from './fakes.js';

export const CATEGORY = '500000000000000001';
export const LIVE_TEXT = '500000000000000002';
export const ANNOUNCE = '500000000000000003';
export const VOICE_1 = '500000000000000011';
export const VOICE_2 = '500000000000000012';
export const OUTSIDE_VOICE = '500000000000000099';
export const WEB_URL = 'https://app.exemplo.com';

/** Timers controlados pelo teste. */
export class FakeScheduler implements Scheduler {
  private tasks: { id: number; at: number; fn: () => void }[] = [];
  private nextId = 1;
  now = 0;

  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.tasks.push({ id, at: this.now + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown) {
    this.tasks = this.tasks.filter((t) => t.id !== handle);
  }
  get pending() {
    return this.tasks.length;
  }
  /** Avança o relógio e dispara o que venceu, deixando as promessas assentarem. */
  async advance(ms: number) {
    const target = this.now + ms;
    for (;;) {
      const due = this.tasks.filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.tasks = this.tasks.filter((t) => t.id !== due.id);
      this.now = due.at;
      due.fn();
      await flush();
    }
    this.now = target;
    await flush();
  }
}

/** Deixa as microtarefas e promessas pendentes terminarem. */
export const flush = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
};

export class FakeGateway implements DiscordGateway {
  channels = new Map<string, ChannelInfo>();
  roles = new Set<string>();
  voiceStates: VoiceStateEntry[] = [];
  permissions = new Map<string, MemberPermissions>();
  memberRoles = new Map<string, string[]>();
  messages = new Map<string, MessagePayload>();
  sent: { channelId: string; messageId: string; payload: MessagePayload }[] = [];
  edits: { channelId: string; messageId: string; payload: MessagePayload }[] = [];
  failSend = false;
  /** Canais onde enviar falha (ex.: bot sem permissão no chat da call). */
  failSendChannels = new Set<string>();
  profiles = new Map<string, MemberProfile>();
  private counter = 0;

  addChannel(info: ChannelInfo) {
    this.channels.set(info.id, info);
  }

  async sendMessage(channelId: string, payload: MessagePayload) {
    if (this.failSend || this.failSendChannels.has(channelId)) throw new Error('Missing Access');
    const messageId = `m${++this.counter}`;
    this.messages.set(`${channelId}/${messageId}`, payload);
    this.sent.push({ channelId, messageId, payload });
    return messageId;
  }

  async editMessage(channelId: string, messageId: string, payload: MessagePayload) {
    const key = `${channelId}/${messageId}`;
    if (!this.messages.has(key)) return 'not_found' as const;
    this.messages.set(key, payload);
    this.edits.push({ channelId, messageId, payload });
    return 'ok' as const;
  }

  deleteMessage(channelId: string, messageId: string) {
    this.messages.delete(`${channelId}/${messageId}`);
  }

  async getChannel(id: string) {
    return this.channels.get(id) ?? null;
  }
  async roleExists(id: string) {
    return this.roles.has(id);
  }
  async listVoiceStates() {
    return this.voiceStates;
  }
  async getMemberRoleIds(userId: string) {
    return this.memberRoles.get(userId) ?? [];
  }
  async getMemberPermissions(userId: string) {
    return this.permissions.get(userId) ?? { isOwner: false, isAdmin: false, isMod: false };
  }
  /** Simula o bot fora do servidor. */
  guildPresent = true;
  async guildAvailable() {
    return this.guildPresent;
  }
  async listChannels() {
    return [...this.channels.values()];
  }
  async listRoles(): Promise<RoleInfo[]> {
    return [...this.roles].map((id, i) => ({
      id,
      name: `cargo-${id.slice(-4)}`,
      color: 0,
      position: i,
    }));
  }
  async getMemberProfile(userId: string) {
    return this.profiles.get(userId) ?? null;
  }
}

export class MemoryRooms implements RoomRepo {
  rooms = new Map<string, RoomRecord>();

  private clone(r: RoomRecord | undefined | null) {
    return r ? structuredClone(r) : null;
  }
  async ensureOpenLive(input: Parameters<RoomRepo['ensureOpenLive']>[0]) {
    const existing = [...this.rooms.values()].find(
      (r) => r.type === 'LIVE' && r.status === 'OPEN' && r.voiceChannelId === input.channelId,
    );
    if (existing) return { room: structuredClone(existing), created: false };
    const room: RoomRecord = {
      id: randomToken(16),
      guildId: input.guildId,
      type: 'LIVE',
      status: 'OPEN',
      title: input.title,
      description: null,
      voiceChannelId: input.channelId,
      announceChannelId: null,
      announceMessageId: null,
      startsAt: null,
      openedAt: input.now,
      endedAt: null,
      createdBy: input.createdBy,
      maxParticipants: input.maxParticipants,
      allowedRoleIds: [],
      lectureMode: false,
      screenLock: false,
      spotlightId: null,
      mediaState: 'IDLE',
      speakerIds: [],
      reminders: [],
      endReason: null,
      createdAt: input.now,
    };
    this.rooms.set(room.id, room);
    return { room: structuredClone(room), created: true };
  }
  async createMeeting(input: NewMeeting) {
    const immediate = input.startsAt === null;
    const room: RoomRecord = {
      id: randomToken(16),
      guildId: input.guildId,
      type: 'MEETING',
      status: immediate ? 'OPEN' : 'SCHEDULED',
      title: input.title,
      description: input.description,
      voiceChannelId: null,
      announceChannelId: null,
      announceMessageId: null,
      startsAt: input.startsAt,
      openedAt: immediate ? input.now : null,
      endedAt: null,
      createdBy: input.createdBy,
      maxParticipants: input.maxParticipants,
      allowedRoleIds: input.allowedRoleIds,
      lectureMode: false,
      screenLock: false,
      spotlightId: null,
      mediaState: 'ACTIVE',
      speakerIds: [],
      reminders: input.reminders.map((m) => ({ minutesBefore: m, sentAt: null })),
      endReason: null,
      createdAt: input.now,
    };
    this.rooms.set(room.id, room);
    return structuredClone(room);
  }
  async findById(id: string) {
    return this.clone(this.rooms.get(id));
  }
  async findOpenLiveByChannel(channelId: string) {
    return this.clone(
      [...this.rooms.values()].find(
        (r) => r.type === 'LIVE' && r.status === 'OPEN' && r.voiceChannelId === channelId,
      ),
    );
  }
  async listOpenLive(guildId: string) {
    return [...this.rooms.values()]
      .filter((r) => r.guildId === guildId && r.type === 'LIVE' && r.status === 'OPEN')
      .map((r) => structuredClone(r));
  }
  async listMeetings(guildId: string, statuses: RoomRecord['status'][]) {
    return [...this.rooms.values()]
      .filter((r) => r.guildId === guildId && r.type === 'MEETING' && statuses.includes(r.status))
      .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0))
      .map((r) => structuredClone(r));
  }
  async list(
    guildId: string,
    filter: { statuses?: RoomRecord['status'][]; type?: RoomRecord['type'] },
    page: { limit: number; cursor?: string },
  ) {
    const all = [...this.rooms.values()]
      .filter(
        (r) =>
          r.guildId === guildId &&
          (!filter.statuses || filter.statuses.includes(r.status)) &&
          (!filter.type || r.type === filter.type),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1));
    const start = page.cursor
      ? all.findIndex(
          (r) => r.id === Buffer.from(page.cursor!, 'base64url').toString().split('|')[1],
        ) + 1
      : 0;
    const items = all.slice(start, start + page.limit).map((r) => structuredClone(r));
    const last = items.at(-1);
    const next =
      start + page.limit < all.length && last
        ? Buffer.from(`${last.createdAt.getTime()}|${last.id}`).toString('base64url')
        : null;
    return { items, next };
  }
  async update(id: string, patch: import('../../src/modules/rooms/rooms.types.js').RoomPatch) {
    const r = this.rooms.get(id);
    if (!r) return null;
    Object.assign(r, patch);
    return structuredClone(r);
  }
  async updateSpeakers(id: string, action: 'add' | 'remove', userId: string) {
    const r = this.rooms.get(id);
    if (!r) return null;
    r.speakerIds =
      action === 'add'
        ? [...new Set([...r.speakerIds, userId])]
        : r.speakerIds.filter((s) => s !== userId);
    return structuredClone(r);
  }
  async updateSchedule(id: string, input: { startsAt?: Date; reminders?: number[]; now: Date }) {
    const r = this.rooms.get(id);
    if (!r || r.status !== 'SCHEDULED') return null;
    const startsAt = input.startsAt ?? r.startsAt;
    if (!startsAt) return null;
    const wanted = input.reminders ?? r.reminders.map((x) => x.minutesBefore);
    const away = (startsAt.getTime() - input.now.getTime()) / 60_000;
    r.startsAt = startsAt;
    r.reminders = [...new Set(wanted)]
      .filter((m) => m > 0 && m < away)
      .sort((a, b) => b - a)
      .map((minutesBefore) => ({ minutesBefore, sentAt: null }));
    return structuredClone(r);
  }
  async claimReminder(id: string, minutesBefore: number, at: Date) {
    const r = this.rooms.get(id);
    const rem = r?.reminders.find((x) => x.minutesBefore === minutesBefore && x.sentAt === null);
    if (!r || r.status !== 'SCHEDULED' || !rem) return false;
    rem.sentAt = at;
    return true;
  }
  async releaseReminder(id: string, minutesBefore: number) {
    const rem = this.rooms.get(id)?.reminders.find((x) => x.minutesBefore === minutesBefore);
    if (rem) rem.sentAt = null;
  }
  async setAnnouncement(id: string, channelId: string, messageId: string) {
    const r = this.rooms.get(id);
    if (r) {
      r.announceChannelId = channelId;
      r.announceMessageId = messageId;
    }
  }
  async setMediaState(id: string, from: 'ACTIVE' | 'IDLE', to: 'ACTIVE' | 'IDLE', _at: Date) {
    const r = this.rooms.get(id);
    if (!r || r.status !== 'OPEN' || r.mediaState !== from) return null;
    r.mediaState = to;
    return structuredClone(r);
  }
  async transition(
    id: string,
    from: RoomRecord['status'][],
    to: RoomRecord['status'],
    patch: { openedAt?: Date; endedAt?: Date; endReason?: string },
  ) {
    const r = this.rooms.get(id);
    if (!r || !from.includes(r.status)) return null;
    r.status = to;
    if (patch.openedAt) r.openedAt = patch.openedAt;
    if (patch.endedAt) r.endedAt = patch.endedAt;
    if (patch.endReason) r.endReason = patch.endReason;
    return structuredClone(r);
  }
}

/** Monta o bot inteiro com dublês: gateway, banco em memória e relógio falso. */
export function buildBot(opts: { mentionRoleId?: string; timezone?: string } = {}) {
  const logger = createLogger({ LOG_LEVEL: 'error', NODE_ENV: 'test' });
  const clock = new FakeClock(Date.parse('2026-11-08T15:00:00Z'));
  const scheduler = new FakeScheduler();
  const gateway = new FakeGateway();
  const settings = new MemorySettings();
  const rooms = new MemoryRooms();
  const cache = new VoiceCache();
  const participations = new MemoryParticipations();
  const auditRepo = new MemoryAuditRepo();
  const audit = new AuditService({ repo: auditRepo, logger, now: clock.now });

  gateway.addChannel({ id: CATEGORY, name: 'Lives', kind: 'category', parentId: null });
  gateway.addChannel({ id: LIVE_TEXT, name: 'lives', kind: 'text', parentId: null });
  gateway.addChannel({ id: ANNOUNCE, name: 'avisos', kind: 'text', parentId: null });
  gateway.addChannel({ id: VOICE_1, name: 'Live 1', kind: 'voice', parentId: CATEGORY });
  gateway.addChannel({ id: VOICE_2, name: 'Live 2', kind: 'voice', parentId: CATEGORY });
  gateway.addChannel({ id: OUTSIDE_VOICE, name: 'Geral', kind: 'voice', parentId: null });
  gateway.roles.add(ADMIN_ROLE);
  gateway.roles.add(MOD_ROLE);

  const announcer = new RoomAnnouncer({
    gateway,
    rooms,
    settings,
    scheduler,
    logger,
    guildId: GUILD_ID,
    webUrl: WEB_URL,
    mentionRoleId: opts.mentionRoleId,
    countParticipants: (room) => (room.voiceChannelId ? cache.count(room.voiceChannelId) : 0),
    summary: async (room) =>
      summarize(buildReport(room, await participations.listAll(room.id), clock.now())),
  });
  const roomService = new RoomService({ rooms, announcer, logger, now: clock.now });
  const meetings = new MeetingService({
    rooms,
    roomService,
    announcer,
    settings,
    gateway,
    participations,
    audit,
    logger,
    guildId: GUILD_ID,
    now: clock.now,
  });
  const meetingScheduler = new MeetingScheduler({
    rooms,
    roomService,
    announcer,
    participations,
    audit,
    scheduler,
    logger,
    guildId: GUILD_ID,
    intervalMs: 15_000,
    emptyEndMinutes: 15,
    now: clock.now,
  });
  const live = new LiveVoiceHandler({
    gateway,
    settings,
    rooms,
    roomService,
    announcer,
    cache,
    scheduler,
    logger,
    guildId: GUILD_ID,
    emptyEndSeconds: 60,
  });
  const roles = new RoleResolver({ gateway, settings, guildId: GUILD_ID, bootstrapAdminIds: [] });
  const router = new CommandRouter({
    roles,
    config: new ConfigHandler({ settings, gateway, audit, guildId: GUILD_ID }),
    meetings: new MeetingHandler({
      rooms,
      meetings,
      guildId: GUILD_ID,
      webUrl: WEB_URL,
      timezone: opts.timezone ?? 'America/Sao_Paulo',
    }),
    logger,
  });

  /** Configura a categoria e os canais, como o admin faria com /config. */
  const configureLives = () => {
    settings.settings.liveCategoryId = CATEGORY;
    settings.settings.liveTextChannelId = LIVE_TEXT;
    settings.settings.announceChannelId = ANNOUNCE;
  };

  return {
    clock,
    scheduler,
    gateway,
    settings,
    rooms,
    cache,
    announcer,
    roomService,
    live,
    router,
    audit,
    auditRepo,
    roles,
    participations,
    meetings,
    meetingScheduler,
    configureLives,
  };
}

export const ADMIN: CommandActor = { userId: '700000000000000001', memberRoleIds: [ADMIN_ROLE] };
export const MOD: CommandActor = { userId: '700000000000000002', memberRoleIds: [MOD_ROLE] };
export const MEMBER: CommandActor = { userId: '700000000000000003', memberRoleIds: [] };

export const call = (
  command: string,
  sub: string,
  options: CommandCall['options'] = {},
): CommandCall => ({ command, sub, options });
