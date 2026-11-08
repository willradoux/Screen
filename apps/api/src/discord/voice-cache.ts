import type { VoiceStateEntry } from './gateway.js';

/**
 * Quem está em qual canal de voz. É a base da regra "só entra na live quem está
 * na call". Reconstruído ao iniciar e mantido por `voiceStateUpdate`.
 */
export class VoiceCache {
  private readonly channelByUser = new Map<string, string>();

  /** `channelId = null` significa que o usuário saiu da voz. */
  set(userId: string, channelId: string | null): void {
    if (channelId) this.channelByUser.set(userId, channelId);
    else this.channelByUser.delete(userId);
  }

  replaceAll(entries: VoiceStateEntry[]): void {
    this.channelByUser.clear();
    for (const e of entries) this.channelByUser.set(e.userId, e.channelId);
  }

  channelOf(userId: string): string | null {
    return this.channelByUser.get(userId) ?? null;
  }

  isInChannel(userId: string, channelId: string): boolean {
    return this.channelByUser.get(userId) === channelId;
  }

  membersIn(channelId: string): string[] {
    const out: string[] = [];
    for (const [userId, ch] of this.channelByUser) if (ch === channelId) out.push(userId);
    return out;
  }

  count(channelId: string): number {
    return this.membersIn(channelId).length;
  }

  /** Canais que têm pelo menos uma pessoa. */
  occupiedChannels(): string[] {
    return [...new Set(this.channelByUser.values())];
  }
}
