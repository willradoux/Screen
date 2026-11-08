import { describe, expect, it } from 'vitest';
import { parseReminders } from '../../src/discord/commands/meeting-handler.js';
import { ADMIN_ROLE, MOD_ROLE } from '../fixtures/fakes.js';
import {
  ADMIN,
  ANNOUNCE,
  CATEGORY,
  LIVE_TEXT,
  MEMBER,
  MOD,
  VOICE_1,
  WEB_URL,
  buildBot,
  call,
} from '../fixtures/bot-fakes.js';

describe('permissões dos comandos', () => {
  it.each([
    ['config', 'ver'],
    ['reuniao', 'criar'],
    ['reuniao', 'agendar'],
    ['reuniao', 'cancelar'],
    ['reuniao', 'listar'],
  ])('MEMBER e MOD não podem /%s %s', async (command, sub) => {
    const b = buildBot();
    for (const actor of [MEMBER, MOD]) {
      const r = await b.router.handle(actor, call(command, sub, { titulo: 'Teste' }));
      expect(r.content).toContain('não tem permissão');
    }
    expect(b.rooms.rooms.size).toBe(0);
  });

  it('MOD pode encerrar reunião; MEMBER não', async () => {
    const b = buildBot();
    b.settings.settings.announceChannelId = ANNOUNCE;
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));

    expect((await b.router.handle(MEMBER, call('reuniao', 'encerrar'))).content).toContain(
      'não tem permissão',
    );
    expect((await b.router.handle(MOD, call('reuniao', 'encerrar'))).content).toContain(
      'encerrada',
    );
  });

  it('dono do servidor e quem tem Administrator no Discord viram ADMIN, mesmo sem cargo', async () => {
    const b = buildBot();
    const owner = { userId: '711', memberRoleIds: [] };
    const manager = { userId: '712', memberRoleIds: [] };
    b.gateway.permissions.set('711', { isOwner: true, isAdmin: false, isMod: false });
    b.gateway.permissions.set('712', { isOwner: false, isAdmin: true, isMod: false });

    for (const actor of [owner, manager]) {
      expect((await b.router.handle(actor, call('config', 'ver'))).content).toContain(
        'Configuração',
      );
    }
  });

  it('permissão de mutar no Discord vira MOD (encerra reunião, mas não configura)', async () => {
    const b = buildBot();
    b.settings.settings.announceChannelId = ANNOUNCE;
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));
    const muter = { userId: '713', memberRoleIds: [] };
    b.gateway.permissions.set('713', { isOwner: false, isAdmin: false, isMod: true });

    expect((await b.router.handle(muter, call('config', 'ver'))).content).toContain(
      'não tem permissão',
    );
    expect((await b.router.handle(muter, call('reuniao', 'encerrar'))).content).toContain(
      'encerrada',
    );
  });

  it('falha ao consultar permissões no Discord não libera nada', async () => {
    const b = buildBot();
    b.gateway.getMemberPermissions = async () => {
      throw new Error('Unknown Member');
    };
    expect((await b.router.handle(MEMBER, call('config', 'ver'))).content).toContain(
      'não tem permissão',
    );
    // mas o cargo configurado continua valendo
    expect((await b.router.handle(ADMIN, call('config', 'ver'))).content).toContain('Configuração');
  });

  it('comando desconhecido não executa nada', async () => {
    const b = buildBot();
    const r = await b.router.handle(ADMIN, call('outro', 'x'));
    expect(r.content).toContain('desconhecido');
  });
});

describe('/config', () => {
  it('categoria-live aceita só categorias', async () => {
    const b = buildBot();
    const ok = await b.router.handle(
      ADMIN,
      call('config', 'categoria-live', { categoria: CATEGORY }),
    );
    expect(ok.content).toContain('✅');
    expect(b.settings.settings.liveCategoryId).toBe(CATEGORY);

    const bad = await b.router.handle(
      ADMIN,
      call('config', 'categoria-live', { categoria: VOICE_1 }),
    );
    expect(bad.content).toContain('❌');
    expect(b.settings.settings.liveCategoryId).toBe(CATEGORY);
  });

  it('canal-live e canal-avisos aceitam só canais de texto', async () => {
    const b = buildBot();
    await b.router.handle(ADMIN, call('config', 'canal-live', { canal: LIVE_TEXT }));
    await b.router.handle(ADMIN, call('config', 'canal-avisos', { canal: ANNOUNCE }));
    expect(b.settings.settings.liveTextChannelId).toBe(LIVE_TEXT);
    expect(b.settings.settings.announceChannelId).toBe(ANNOUNCE);

    const bad = await b.router.handle(ADMIN, call('config', 'canal-avisos', { canal: VOICE_1 }));
    expect(bad.content).toContain('❌');
    expect(b.settings.settings.announceChannelId).toBe(ANNOUNCE);

    const missing = await b.router.handle(ADMIN, call('config', 'canal-live', { canal: '999' }));
    expect(missing.content).toContain('❌');
  });

  it('cargos: adicionar, remover, evitar duplicata e recusar cargo inexistente', async () => {
    const b = buildBot();
    b.gateway.roles.add('600');
    const add = () =>
      b.router.handle(ADMIN, call('config', 'cargo-mod', { acao: 'adicionar', cargo: '600' }));
    await add();
    await add();
    expect(b.settings.settings.modRoleIds.filter((r) => r === '600')).toHaveLength(1);

    const rm = await b.router.handle(
      ADMIN,
      call('config', 'cargo-mod', { acao: 'remover', cargo: '600' }),
    );
    expect(rm.content).toContain('✅');
    expect(b.settings.settings.modRoleIds).not.toContain('600');

    const ghost = await b.router.handle(
      ADMIN,
      call('config', 'cargo-admin', { acao: 'adicionar', cargo: '31337' }),
    );
    expect(ghost.content).toContain('não existe');
    expect(b.settings.settings.adminRoleIds).not.toContain('31337');

    // remover cargo que já foi apagado do Discord precisa funcionar
    const removeGhost = await b.router.handle(
      ADMIN,
      call('config', 'cargo-admin', { acao: 'remover', cargo: ADMIN_ROLE }),
    );
    expect(removeGhost.content).toContain('✅');
  });

  it('cargo-reuniao define quem pode entrar nas reuniões', async () => {
    const b = buildBot();
    b.gateway.roles.add('601');
    await b.router.handle(
      ADMIN,
      call('config', 'cargo-reuniao', { acao: 'adicionar', cargo: '601' }),
    );
    expect(b.settings.settings.meetingAllowedRoleIds).toEqual(['601']);
  });

  it('ação inválida é recusada', async () => {
    const b = buildBot();
    const r = await b.router.handle(
      ADMIN,
      call('config', 'cargo-mod', { acao: 'trocar', cargo: ADMIN_ROLE }),
    );
    expect(r.content).toContain('❌');
  });

  it.each([
    [1, false],
    [2, true],
    [100, true],
    [101, false],
    [2.5, false],
  ])('limite-live %s -> aceito: %s', async (max, ok) => {
    const b = buildBot();
    const r = await b.router.handle(ADMIN, call('config', 'limite-live', { max }));
    expect(r.content.startsWith('✅')).toBe(ok);
    expect(b.settings.settings.maxParticipantsLive).toBe(ok ? max : 25);
  });

  it('ver mostra a configuração', async () => {
    const b = buildBot();
    b.configureLives();
    const r = await b.router.handle(ADMIN, call('config', 'ver'));
    expect(r.content).toContain(`<#${CATEGORY}>`);
    expect(r.content).toContain(`<#${ANNOUNCE}>`);
    expect(r.content).toContain(`<@&${ADMIN_ROLE}>`);
    expect(r.content).toContain(`<@&${MOD_ROLE}>`);
  });
});

describe('/reuniao criar', () => {
  it('abre a reunião agora, avisa no canal com @everyone e botão', async () => {
    const b = buildBot();
    b.configureLives();
    const r = await b.router.handle(
      ADMIN,
      call('reuniao', 'criar', { titulo: 'Reunião mensal', descricao: 'Pauta do mês' }),
    );

    const room = [...b.rooms.rooms.values()][0]!;
    expect(room).toMatchObject({ type: 'MEETING', status: 'OPEN', createdBy: ADMIN.userId });
    expect(r.content).toContain(`${WEB_URL}/r/${room.id}`);

    expect(b.gateway.sent).toHaveLength(1);
    const msg = b.gateway.sent[0]!;
    expect(msg.channelId).toBe(ANNOUNCE);
    expect(msg.payload.content).toBe('@everyone');
    expect(msg.payload.allowed_mentions).toEqual({ parse: ['everyone'] });
    expect(msg.payload.embeds[0]!.title).toBe('🟢 Reunião aberta agora: Reunião mensal');
    expect(msg.payload.embeds[0]!.description).toBe('Pauta do mês');
    expect(JSON.stringify(msg.payload.components)).toContain(`${WEB_URL}/r/${room.id}`);
  });

  it('usa o cargo configurado em vez de @everyone', async () => {
    const b = buildBot({ mentionRoleId: '650000000000000001' });
    b.configureLives();
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));
    const payload = b.gateway.sent[0]!.payload;
    expect(payload.content).toBe('<@&650000000000000001>');
    expect(payload.allowed_mentions).toEqual({ roles: ['650000000000000001'] });
  });

  it('avisar: não -> cria sem mandar nada', async () => {
    const b = buildBot();
    const r = await b.router.handle(
      ADMIN,
      call('reuniao', 'criar', { titulo: 'Reunião mensal', avisar: false }),
    );
    expect(b.rooms.rooms.size).toBe(1);
    expect(b.gateway.sent).toHaveLength(0);
    expect(r.content).toContain('Nenhum aviso');
  });

  it('sem canal de avisos configurado: recusa e NÃO cria a reunião', async () => {
    const b = buildBot();
    const r = await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));
    expect(r.content).toContain('/config canal-avisos');
    expect(b.rooms.rooms.size).toBe(0);
  });

  it('título curto demais é recusado', async () => {
    const b = buildBot();
    b.configureLives();
    const r = await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'ab' }));
    expect(r.content).toContain('❌');
    expect(b.rooms.rooms.size).toBe(0);
  });

  it('falha ao enviar o aviso: a reunião existe e o admin é avisado', async () => {
    const b = buildBot();
    b.configureLives();
    b.gateway.failSend = true;
    const r = await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));
    expect(b.rooms.rooms.size).toBe(1);
    expect(r.content).toContain('não consegui enviar o aviso');
  });

  it('copia para a reunião quem pode entrar (cargo-reuniao)', async () => {
    const b = buildBot();
    b.configureLives();
    b.settings.settings.meetingAllowedRoleIds = ['601'];
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Reunião mensal' }));
    expect([...b.rooms.rooms.values()][0]!.allowedRoleIds).toEqual(['601']);
    expect(JSON.stringify(b.gateway.sent[0]!.payload.embeds)).toContain('<@&601>');
  });
});

describe('/reuniao agendar', () => {
  // "agora" nos testes é 2026-11-08 15:00Z = 12:00 em Brasília (UTC-3)
  const base = { titulo: 'Reunião de dezembro', data: '05/12/2026', hora: '20:00' };

  it('agenda no fuso de Brasília (20:00 -> 23:00Z), avisa e define lembretes', async () => {
    const b = buildBot();
    b.configureLives();
    const r = await b.router.handle(ADMIN, call('reuniao', 'agendar', base));

    const room = [...b.rooms.rooms.values()][0]!;
    expect(room.status).toBe('SCHEDULED');
    expect(room.startsAt?.toISOString()).toBe('2026-12-05T23:00:00.000Z');
    expect(room.openedAt).toBeNull();
    expect(room.reminders.map((x) => x.minutesBefore)).toEqual([1440, 60, 5]);
    expect(r.content).toContain('<t:1796511600:F>');

    const msg = b.gateway.sent[0]!.payload;
    expect(msg.embeds[0]!.title).toBe('📅 Reunião: Reunião de dezembro');
    expect(JSON.stringify(msg.embeds)).toContain('<t:1796511600:F>');
    expect(JSON.stringify(msg.embeds)).toContain('<t:1796511600:R>');
  });

  it('recusa horário no passado e a menos de 2 minutos', async () => {
    const b = buildBot();
    b.configureLives();
    const past = await b.router.handle(
      ADMIN,
      call('reuniao', 'agendar', { ...base, data: '01/11/2026' }),
    );
    expect(past.content).toContain('futuro');
    // agora = 12:00 em Brasília
    const soon = await b.router.handle(
      ADMIN,
      call('reuniao', 'agendar', { ...base, data: '08/11/2026', hora: '12:01' }),
    );
    expect(soon.content).toContain('futuro');
    expect(b.rooms.rooms.size).toBe(0);
  });

  it.each([
    ['31/02/2027', '20:00'],
    ['29/02/2027', '20:00'],
    ['2026-12-05', '20:00'],
    ['05/12/2026', '25:00'],
    ['05/12/2026', '20h'],
    ['05/12/26', '20:00'],
  ])('recusa data/hora inválida: %s %s', async (data, hora) => {
    const b = buildBot();
    b.configureLives();
    const r = await b.router.handle(ADMIN, call('reuniao', 'agendar', { ...base, data, hora }));
    expect(r.content).toContain('❌');
    expect(b.rooms.rooms.size).toBe(0);
  });

  it('descarta lembretes que já passaram (reunião daqui a 30 min só recebe o de 5 min)', async () => {
    const b = buildBot();
    b.configureLives();
    await b.router.handle(
      ADMIN,
      call('reuniao', 'agendar', { ...base, data: '08/11/2026', hora: '12:30' }),
    );
    expect([...b.rooms.rooms.values()][0]!.reminders.map((x) => x.minutesBefore)).toEqual([5]);
  });

  it('lembretes personalizados e "0" para nenhum', async () => {
    const b = buildBot();
    b.configureLives();
    await b.router.handle(ADMIN, call('reuniao', 'agendar', { ...base, lembretes: '10, 120' }));
    await b.router.handle(
      ADMIN,
      call('reuniao', 'agendar', { ...base, titulo: 'Outra reunião', lembretes: '0' }),
    );
    const [a, c] = [...b.rooms.rooms.values()];
    expect(a!.reminders.map((x) => x.minutesBefore)).toEqual([120, 10]);
    expect(c!.reminders).toEqual([]);
  });

  it('lembretes inválidos são recusados', async () => {
    const b = buildBot();
    b.configureLives();
    const r = await b.router.handle(
      ADMIN,
      call('reuniao', 'agendar', { ...base, lembretes: 'abc' }),
    );
    expect(r.content).toContain('Lembretes');
    expect(b.rooms.rooms.size).toBe(0);
  });
});

describe('parseReminders', () => {
  it.each([
    [undefined, [1440, 60, 5]],
    ['', [1440, 60, 5]],
    ['0', []],
    ['5,60,1440', [1440, 60, 5]],
    ['10,10,20', [20, 10]],
  ])('%j -> %j', (input, expected) => {
    expect(parseReminders(input)).toEqual(expected);
  });
  it.each(['-5', '1.5', 'a', '1,,2', '50000', '1,2,3,4,5,6'])('recusa %j', (input) => {
    expect(() => parseReminders(input)).toThrow();
  });
});

describe('/reuniao cancelar, encerrar, listar', () => {
  const setup = async () => {
    const b = buildBot();
    b.configureLives();
    await b.router.handle(
      ADMIN,
      call('reuniao', 'agendar', { titulo: 'Futura', data: '05/12/2026', hora: '20:00' }),
    );
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Aberta agora' }));
    const rooms = [...b.rooms.rooms.values()];
    return {
      b,
      scheduled: rooms.find((r) => r.status === 'SCHEDULED')!,
      open: rooms.find((r) => r.status === 'OPEN')!,
    };
  };

  it('cancelar reunião agendada: estado CANCELED e embed atualizado sem botão', async () => {
    const { b, scheduled } = await setup();
    const r = await b.router.handle(ADMIN, call('reuniao', 'cancelar', { reuniao: scheduled.id }));
    expect(r.content).toContain('cancelada');
    expect(b.rooms.rooms.get(scheduled.id)!.status).toBe('CANCELED');
    const edit = b.gateway.edits.at(-1)!.payload;
    expect(edit.embeds[0]!.title).toBe('🚫 Reunião cancelada: Futura');
    expect(edit.components).toEqual([]);
  });

  it('não cancela reunião aberta nem inexistente, nem a já cancelada', async () => {
    const { b, scheduled, open } = await setup();
    expect(
      (await b.router.handle(ADMIN, call('reuniao', 'cancelar', { reuniao: open.id }))).content,
    ).toContain('encerrar');
    expect(
      (await b.router.handle(ADMIN, call('reuniao', 'cancelar', { reuniao: 'nada' }))).content,
    ).toContain('Não encontrei');
    await b.router.handle(ADMIN, call('reuniao', 'cancelar', { reuniao: scheduled.id }));
    expect(
      (await b.router.handle(ADMIN, call('reuniao', 'cancelar', { reuniao: scheduled.id })))
        .content,
    ).toContain('❌');
  });

  it('encerrar sem informar pega a única aberta; embed vira "encerrada"', async () => {
    const { b, open } = await setup();
    const r = await b.router.handle(ADMIN, call('reuniao', 'encerrar'));
    expect(r.content).toContain('encerrada');
    expect(b.rooms.rooms.get(open.id)).toMatchObject({
      status: 'ENDED',
      endReason: 'ENDED_BY_ADMIN',
    });
    expect(b.gateway.edits.at(-1)!.payload.embeds[0]!.title).toContain('Reunião encerrada');
  });

  it('encerrar sem reunião aberta, ou com várias abertas sem escolher', async () => {
    const b = buildBot();
    b.configureLives();
    expect((await b.router.handle(ADMIN, call('reuniao', 'encerrar'))).content).toContain(
      'nenhuma reunião aberta',
    );

    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Primeira reunião' }));
    await b.router.handle(ADMIN, call('reuniao', 'criar', { titulo: 'Segunda reunião' }));
    expect((await b.router.handle(ADMIN, call('reuniao', 'encerrar'))).content).toContain(
      'mais de uma',
    );
  });

  it('encerrar uma agendada (não aberta) é recusado', async () => {
    const { b, scheduled } = await setup();
    const r = await b.router.handle(ADMIN, call('reuniao', 'encerrar', { reuniao: scheduled.id }));
    expect(r.content).toContain('não está aberta');
  });

  it('listar mostra abertas e agendadas com link', async () => {
    const { b, scheduled, open } = await setup();
    const r = await b.router.handle(ADMIN, call('reuniao', 'listar'));
    expect(r.content).toContain('Futura');
    expect(r.content).toContain('Aberta agora');
    expect(r.content).toContain(`${WEB_URL}/r/${scheduled.id}`);
    expect(r.content).toContain(`${WEB_URL}/r/${open.id}`);
  });

  it('listar vazio', async () => {
    const b = buildBot();
    expect((await b.router.handle(ADMIN, call('reuniao', 'listar'))).content).toContain(
      'Nenhuma reunião',
    );
  });

  it('autocomplete sugere reuniões só para MOD+ e filtra pelo texto', async () => {
    const { b, scheduled } = await setup();
    const all = await b.router.autocomplete(ADMIN, { command: 'reuniao', sub: 'cancelar' }, '');
    expect(all.map((c) => c.value)).toContain(scheduled.id);
    const filtered = await b.router.autocomplete(
      MOD,
      { command: 'reuniao', sub: 'encerrar' },
      'futu',
    );
    expect(filtered).toHaveLength(1);
    expect(
      await b.router.autocomplete(MEMBER, { command: 'reuniao', sub: 'cancelar' }, ''),
    ).toEqual([]);
    expect(await b.router.autocomplete(ADMIN, { command: 'config', sub: 'ver' }, '')).toEqual([]);
  });
});
