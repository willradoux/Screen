import { describe, expect, it } from 'vitest';
import {
  ADMIN,
  ANNOUNCE,
  MEMBER,
  OUTSIDE_VOICE,
  VOICE_1,
  WEB_URL,
  buildBot,
  call,
} from '../fixtures/bot-fakes.js';

/* /screen: qualquer membro pede o link da sala da própria call, as salas abertas e ajuda. */

const join = (b: ReturnType<typeof buildBot>, userId: string, channelId: string) =>
  b.live.handle({ userId, oldChannelId: null, newChannelId: channelId });

describe('/screen', () => {
  it('qualquer membro pode usar (é só leitura)', async () => {
    const b = buildBot();
    for (const sub of ['link', 'salas', 'ajuda']) {
      const r = await b.router.handle(MEMBER, call('screen', sub));
      expect(r.content).not.toContain('não tem permissão');
    }
  });

  it('link: na call de lives, devolve o link da live dessa call', async () => {
    const b = buildBot();
    b.configureLives();
    await join(b, MEMBER.userId, VOICE_1);
    const room = [...b.rooms.rooms.values()][0]!;

    const r = await b.router.handle(MEMBER, call('screen', 'link'));
    expect(r.content).toContain(`${WEB_URL}/call/${room.id}`);
    expect(r.content).toContain(`<#${VOICE_1}>`);
  });

  it('link: fora de call, explica como abrir; numa call sem live, diz que ela não é de lives', async () => {
    const b = buildBot();
    b.configureLives();
    const out = await b.router.handle(MEMBER, call('screen', 'link'));
    expect(out.content).toContain('não está numa call');

    await join(b, MEMBER.userId, OUTSIDE_VOICE);
    const other = await b.router.handle(MEMBER, call('screen', 'link'));
    expect(other.content).toContain('não tem live aberta');
    expect(other.content).not.toContain('/call/');
  });

  it('salas: lives abertas e reuniões, cada uma com o link', async () => {
    const b = buildBot();
    b.configureLives();
    b.settings.settings.announceChannelId = ANNOUNCE;
    await join(b, ADMIN.userId, VOICE_1);
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));

    const r = await b.router.handle(MEMBER, call('screen', 'salas'));
    expect(r.content).toContain('**Ao vivo agora**');
    expect(r.content).toContain('**Reuniões**');
    expect(r.content).toContain('Reunião mensal (aberta agora)');
    for (const room of b.rooms.rooms.values()) expect(r.content).toContain(`/call/${room.id}`);
  });

  it('salas: sem nada aberto, diz como abrir', async () => {
    const b = buildBot();
    const r = await b.router.handle(MEMBER, call('screen', 'salas'));
    expect(r.content).toContain('Nada aberto agora');
  });

  it('ajuda: o site e o guia', async () => {
    const b = buildBot();
    const r = await b.router.handle(MEMBER, call('screen', 'ajuda'));
    expect(r.content).toContain(WEB_URL);
    expect(r.content).toContain(`${WEB_URL}/features`);
  });
});
