import { RoomModel } from '../../db/models.js';
import { randomToken } from '../../shared/crypto.js';
import type { NewMeeting, RoomRecord, RoomRepo } from './rooms.types.js';

type Doc = {
  _id: string;
  guildId: string;
  type: 'LIVE' | 'MEETING';
  status: 'SCHEDULED' | 'OPEN' | 'ENDED' | 'CANCELED';
  title: string;
  description?: string | null;
  voiceChannelId?: string | null;
  announceChannelId?: string | null;
  announceMessageId?: string | null;
  startsAt?: Date | null;
  openedAt?: Date | null;
  endedAt?: Date | null;
  createdBy: string;
  maxParticipants: number;
  allowedRoleIds?: string[];
  lectureMode?: boolean | null;
  speakerIds?: string[];
  reminders?: { minutesBefore?: number | null; sentAt?: Date | null }[];
  endReason?: string | null;
  createdAt?: Date;
};

const newRoomId = () => randomToken(16); // 22 caracteres base64url (128 bits)

function toRecord(d: Doc): RoomRecord {
  return {
    id: d._id,
    guildId: d.guildId,
    type: d.type,
    status: d.status,
    title: d.title,
    description: d.description ?? null,
    voiceChannelId: d.voiceChannelId ?? null,
    announceChannelId: d.announceChannelId ?? null,
    announceMessageId: d.announceMessageId ?? null,
    startsAt: d.startsAt ?? null,
    openedAt: d.openedAt ?? null,
    endedAt: d.endedAt ?? null,
    createdBy: d.createdBy,
    maxParticipants: d.maxParticipants,
    allowedRoleIds: d.allowedRoleIds ?? [],
    lectureMode: d.lectureMode ?? false,
    speakerIds: d.speakerIds ?? [],
    reminders: (d.reminders ?? []).map((r) => ({
      minutesBefore: r.minutesBefore ?? 0,
      sentAt: r.sentAt ?? null,
    })),
    endReason: d.endReason ?? null,
    createdAt: d.createdAt ?? new Date(0),
  };
}

const isDuplicateKey = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

export function createRoomRepo(): RoomRepo {
  const findOpenLiveByChannel = async (channelId: string) => {
    const doc = await RoomModel.findOne({
      type: 'LIVE',
      status: 'OPEN',
      voiceChannelId: channelId,
    }).lean();
    return doc ? toRecord(doc as Doc) : null;
  };

  return {
    findOpenLiveByChannel,

    async ensureOpenLive(input) {
      const existing = await findOpenLiveByChannel(input.channelId);
      if (existing) return { room: existing, created: false };

      const id = newRoomId();
      try {
        const doc = await RoomModel.create({
          _id: id,
          guildId: input.guildId,
          type: 'LIVE',
          status: 'OPEN',
          title: input.title,
          voiceChannelId: input.channelId,
          openedAt: input.now,
          createdBy: input.createdBy,
          maxParticipants: input.maxParticipants,
          livekitRoomName: id,
        });
        return { room: toRecord(doc.toObject() as Doc), created: true };
      } catch (err) {
        // Outro evento criou a sala no mesmo instante (índice único parcial).
        if (!isDuplicateKey(err)) throw err;
        const winner = await findOpenLiveByChannel(input.channelId);
        if (!winner) throw err;
        return { room: winner, created: false };
      }
    },

    async createMeeting(input: NewMeeting) {
      const id = newRoomId();
      const immediate = input.startsAt === null;
      const doc = await RoomModel.create({
        _id: id,
        guildId: input.guildId,
        type: 'MEETING',
        status: immediate ? 'OPEN' : 'SCHEDULED',
        title: input.title,
        description: input.description,
        startsAt: input.startsAt,
        openedAt: immediate ? input.now : null,
        createdBy: input.createdBy,
        maxParticipants: input.maxParticipants,
        allowedRoleIds: input.allowedRoleIds,
        reminders: input.reminders.map((minutesBefore) => ({ minutesBefore, sentAt: null })),
        livekitRoomName: id,
      });
      return toRecord(doc.toObject() as Doc);
    },

    async findById(id) {
      const doc = await RoomModel.findById(id).lean();
      return doc ? toRecord(doc as Doc) : null;
    },

    async listOpenLive(guildId) {
      const docs = await RoomModel.find({ guildId, type: 'LIVE', status: 'OPEN' }).lean();
      return docs.map((d) => toRecord(d as Doc));
    },

    async listMeetings(guildId, statuses) {
      const docs = await RoomModel.find({ guildId, type: 'MEETING', status: { $in: statuses } })
        .sort({ startsAt: 1, createdAt: 1 })
        .lean();
      return docs.map((d) => toRecord(d as Doc));
    },

    async list(guildId, filter, page) {
      const query: Record<string, unknown> = { guildId };
      if (filter.statuses?.length) query.status = { $in: filter.statuses };
      if (filter.type) query.type = filter.type;

      // Cursor opaco: base64url("<createdAtMs>|<id>"). Ordem estável por (createdAt, _id).
      if (page.cursor) {
        const [ms, id] = Buffer.from(page.cursor, 'base64url').toString('utf8').split('|');
        const at = new Date(Number(ms));
        if (!id || Number.isNaN(at.getTime())) throw new Error('cursor inválido');
        query.$or = [{ createdAt: { $lt: at } }, { createdAt: at, _id: { $lt: id } }];
      }

      const docs = await RoomModel.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .limit(page.limit + 1)
        .lean();
      const items = docs.slice(0, page.limit).map((d) => toRecord(d as Doc));
      const last = items.at(-1);
      const next =
        docs.length > page.limit && last
          ? Buffer.from(`${last.createdAt.getTime()}|${last.id}`).toString('base64url')
          : null;
      return { items, next };
    },

    async update(id, patch) {
      const doc = await RoomModel.findByIdAndUpdate(id, { $set: patch }, { new: true, lean: true });
      return doc ? toRecord(doc as Doc) : null;
    },

    async updateSpeakers(id, action, userId) {
      const op =
        action === 'add'
          ? { $addToSet: { speakerIds: userId } }
          : { $pull: { speakerIds: userId } };
      const doc = await RoomModel.findByIdAndUpdate(id, op, { new: true, lean: true });
      return doc ? toRecord(doc as Doc) : null;
    },

    async setAnnouncement(id, channelId, messageId) {
      await RoomModel.updateOne(
        { _id: id },
        { $set: { announceChannelId: channelId, announceMessageId: messageId } },
      );
    },

    async transition(id, from, to, patch) {
      const doc = await RoomModel.findOneAndUpdate(
        { _id: id, status: { $in: from } },
        { $set: { status: to, ...patch } },
        { new: true, lean: true },
      );
      return doc ? toRecord(doc as Doc) : null;
    },
  };
}
