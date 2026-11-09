import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../lib/api';
import { isoToLocalInput } from '../../lib/format';
import type { AuditEntry, Settings } from '../../lib/types';
import { apiError, makeMeeting } from '../../test/helpers';
import {
  AdminMeetingsPage,
  buildMeetingInput,
  emptyForm,
  type MeetingFormValues,
} from './AdminMeetingsPage';
import { AuditPage, actionLabel, actorLabel } from './AuditPage';
import { SettingsPage, buildSettingsPatch, toForm } from './SettingsPage';

const NOW = Date.parse('2026-11-08T15:00:00Z');

describe('buildMeetingInput', () => {
  const base = { ...emptyForm, title: 'Reunião mensal' };

  it('sem data: abre agora, sem lembretes', () => {
    const r = buildMeetingInput(base, NOW);
    expect(r).toEqual({
      input: { title: 'Reunião mensal', description: null, startsAt: null, announce: false },
    });
  });

  it('com data: converte para ISO (UTC) e manda os lembretes do maior para o menor', () => {
    const r = buildMeetingInput({ ...base, when: '2026-12-05T20:00', reminders: [5, 1440] }, NOW);
    expect(r).toEqual({
      input: {
        title: 'Reunião mensal',
        description: null,
        startsAt: new Date(2026, 11, 5, 20, 0).toISOString(),
        announce: false,
        reminders: [1440, 5],
      },
    });
  });

  it('lembretes todos desmarcados mandam lista vazia (nenhum lembrete)', () => {
    const r = buildMeetingInput({ ...base, when: '2026-12-05T20:00', reminders: [] }, NOW);
    expect('input' in r && r.input.reminders).toEqual([]);
  });

  it('apara espaços e transforma descrição vazia em null', () => {
    const r = buildMeetingInput({ ...base, title: '  Reunião mensal  ', description: '   ' }, NOW);
    expect('input' in r && r.input).toMatchObject({ title: 'Reunião mensal', description: null });
  });

  // Relógio local do navegador: monta o valor do campo a partir de um instante, sem depender do fuso da máquina.
  const localAt = (ms: number) => isoToLocalInput(new Date(ms).toISOString());

  it.each([
    ['título curto', { title: 'ab' }, /pelo menos 3/],
    ['título longo', { title: 'x'.repeat(101) }, /no máximo 100/],
    ['descrição longa', { description: 'x'.repeat(1001) }, /1000/],
    ['a 1 minuto de agora', { when: localAt(NOW + 60_000) }, /2 minutos no futuro/],
    ['no passado', { when: localAt(NOW - 3_600_000) }, /2 minutos no futuro/],
  ])('recusa %s', (_nome, over, message) => {
    const r = buildMeetingInput({ ...base, ...over } as MeetingFormValues, NOW);
    expect(r).toHaveProperty('error');
    expect((r as { error: string }).error).toMatch(message);
  });

  it('aceita 3 minutos no futuro', () => {
    const r = buildMeetingInput({ ...base, when: localAt(NOW + 3 * 60_000) }, NOW);
    expect(r).toHaveProperty('input');
  });
});

describe('AdminMeetingsPage', () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <AdminMeetingsPage />
      </MemoryRouter>,
    );

  const scheduled = makeMeeting({ id: 'AAAAAAAAAAAAAAAAAAAAAA', title: 'Reunião agendada' });
  const open = makeMeeting({
    id: 'BBBBBBBBBBBBBBBBBBBBBB',
    title: 'Reunião aberta',
    status: 'OPEN',
    startsAt: null,
    reminders: [],
  });
  const ended = makeMeeting({
    id: 'CCCCCCCCCCCCCCCCCCCCCC',
    title: 'Reunião antiga',
    status: 'ENDED',
  });

  function list() {
    return vi
      .spyOn(api.meetings, 'list')
      .mockImplementation(async (q) => (q?.status === 'ENDED' ? [ended] : [scheduled, open]));
  }
  const rowOf = (title: string) =>
    screen.getByText(title).closest('[data-testid="meeting-row"]') as HTMLElement;

  it('lista abertas/agendadas e encerradas, com os lembretes', async () => {
    list();
    renderPage();
    expect(await screen.findByText('Reunião agendada')).toBeInTheDocument();
    expect(screen.getByText('Reunião aberta')).toBeInTheDocument();
    expect(screen.getByText('Reunião antiga')).toBeInTheDocument();
    expect(within(rowOf('Reunião agendada')).getByText('1 d')).toBeInTheDocument();
  });

  it('cria uma reunião imediata', async () => {
    list();
    const create = vi.spyOn(api.meetings, 'create').mockResolvedValue(open);
    renderPage();
    await screen.findByText('Reunião agendada');

    await userEvent.type(screen.getByLabelText('Título'), 'Reunião mensal');
    expect(screen.getByRole('button', { name: /criar e abrir agora/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /criar e abrir agora/i }));

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith({
        title: 'Reunião mensal',
        description: null,
        startsAt: null,
        announce: false,
      }),
    );
    expect(screen.getByLabelText('Título')).toHaveValue(''); // formulário limpo
  });

  it('agendar muda o botão, mostra os lembretes e manda a data', async () => {
    list();
    const create = vi.spyOn(api.meetings, 'create').mockResolvedValue(scheduled);
    renderPage();
    await screen.findByText('Reunião agendada');

    await userEvent.type(screen.getByLabelText('Título'), 'Reunião de dezembro');
    await userEvent.type(screen.getByLabelText(/Quando/), '2099-12-05T20:00');
    expect(screen.getByRole('checkbox', { name: /24 h antes/i })).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /1 h antes/i })); // desmarca
    await userEvent.click(screen.getByRole('button', { name: /agendar reunião/i }));

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]![0]).toMatchObject({
      title: 'Reunião de dezembro',
      startsAt: new Date(2099, 11, 5, 20, 0).toISOString(),
      reminders: [1440, 5],
    });
  });

  it('validação do formulário aparece sem chamar a API', async () => {
    list();
    const create = vi.spyOn(api.meetings, 'create');
    renderPage();
    await screen.findByText('Reunião agendada');
    await userEvent.type(screen.getByLabelText('Título'), 'ab');
    await userEvent.click(screen.getByRole('button', { name: /criar e abrir agora/i }));
    expect(await screen.findByText(/pelo menos 3 caracteres/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('erro da API aparece no formulário (canal de avisos faltando)', async () => {
    list();
    vi.spyOn(api.meetings, 'create').mockRejectedValue(apiError(409, 'ANNOUNCE_CHANNEL_NOT_SET'));
    renderPage();
    await screen.findByText('Reunião agendada');
    await userEvent.type(screen.getByLabelText('Título'), 'Reunião mensal');
    await userEvent.click(screen.getByRole('button', { name: /criar e abrir agora/i }));
    expect(await screen.findByText(/Configure o canal de avisos/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Título')).toHaveValue('Reunião mensal'); // não perde o que digitou
  });

  it('abrir agora, reagendar e cancelar (com confirmação)', async () => {
    list();
    const openFn = vi.spyOn(api.meetings, 'open').mockResolvedValue(open);
    const update = vi.spyOn(api.meetings, 'update').mockResolvedValue(scheduled);
    const cancel = vi.spyOn(api.meetings, 'cancel').mockResolvedValue(undefined);
    renderPage();
    await screen.findByText('Reunião agendada');
    const row = rowOf('Reunião agendada');

    await userEvent.click(within(row).getByRole('button', { name: 'Abrir agora' }));
    await waitFor(() => expect(openFn).toHaveBeenCalledWith(scheduled.id));

    await userEvent.click(within(row).getByRole('button', { name: 'Reagendar' }));
    const input = within(row).getByLabelText('Novo horário');
    await userEvent.clear(input);
    await userEvent.type(input, '2099-01-10T19:30');
    await userEvent.click(within(row).getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith(scheduled.id, {
        startsAt: new Date(2099, 0, 10, 19, 30).toISOString(),
      }),
    );

    await userEvent.click(within(row).getByRole('button', { name: 'Cancelar' }));
    expect(cancel).not.toHaveBeenCalled(); // pede confirmação
    expect(within(row).getByText(/O canal será avisado/)).toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Sim, cancelar' }));
    await waitFor(() => expect(cancel).toHaveBeenCalledWith(scheduled.id));
  });

  it('reagendar para o passado é barrado antes de chamar a API', async () => {
    list();
    const update = vi.spyOn(api.meetings, 'update');
    renderPage();
    await screen.findByText('Reunião agendada');
    const row = rowOf('Reunião agendada');
    await userEvent.click(within(row).getByRole('button', { name: 'Reagendar' }));
    const input = within(row).getByLabelText('Novo horário');
    await userEvent.clear(input);
    await userEvent.type(input, '2020-01-10T19:30');
    await userEvent.click(within(row).getByRole('button', { name: 'Salvar' }));
    expect(await within(row).findByText(/2 minutos no futuro/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('encerrar reunião aberta e ver o relatório da encerrada', async () => {
    list();
    const end = vi.spyOn(api.rooms, 'end').mockResolvedValue(undefined);
    vi.spyOn(api.meetings, 'report').mockResolvedValue({
      durationMinutes: 62,
      peakParticipants: 41,
      attendees: [
        {
          userId: '1',
          displayName: 'Ana Souza',
          joinedAt: '2026-12-05T23:00:00Z',
          leftAt: '2026-12-06T00:02:00Z',
          minutes: 58,
        },
      ],
    });
    renderPage();
    await screen.findByText('Reunião aberta');

    await userEvent.click(
      within(rowOf('Reunião aberta')).getByRole('button', { name: 'Encerrar' }),
    );
    await waitFor(() => expect(end).toHaveBeenCalledWith(open.id));

    await userEvent.click(
      within(rowOf('Reunião antiga')).getByRole('button', { name: 'Ver relatório' }),
    );
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
    expect(screen.getByText('58')).toBeInTheDocument();
    expect(screen.getByText(/Pico:/).textContent).toContain('41');
  });

  it('erro de uma ação aparece na própria reunião', async () => {
    list();
    vi.spyOn(api.meetings, 'open').mockRejectedValue(apiError(409, 'MEETING_NOT_EDITABLE'));
    renderPage();
    await screen.findByText('Reunião agendada');
    await userEvent.click(
      within(rowOf('Reunião agendada')).getByRole('button', { name: 'Abrir agora' }),
    );
    expect(
      await within(rowOf('Reunião agendada')).findByText(/não pode mais ser alterada/i),
    ).toBeInTheDocument();
  });

  it('falha ao carregar a lista mostra o erro', async () => {
    vi.spyOn(api.meetings, 'list').mockRejectedValue(apiError(403, 'FORBIDDEN'));
    renderPage();
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument();
  });
});

const CH = {
  category: '500000000000000001',
  voice1: '500000000000000011',
  voice2: '500000000000000012',
  voice3: '500000000000000013',
  announce: '500000000000000003',
  logs: '500000000000000004',
};
const ROLE = {
  admin: '600000000000000001',
  mod: '600000000000000002',
  mention: '600000000000000003',
};

const channels = [
  { id: CH.category, name: 'Lives', kind: 'category' as const, parentId: null },
  { id: CH.voice1, name: 'Sala 1', kind: 'voice' as const, parentId: CH.category },
  { id: CH.voice2, name: 'Sala 2', kind: 'voice' as const, parentId: CH.category },
  { id: CH.voice3, name: 'Papo', kind: 'voice' as const, parentId: null },
  { id: CH.announce, name: 'avisos', kind: 'text' as const, parentId: null },
  { id: CH.logs, name: 'logs', kind: 'text' as const, parentId: null },
];
const roles = [
  { id: ROLE.admin, name: 'Diretoria', color: 0, position: 3 },
  { id: ROLE.mod, name: 'Moderação', color: 0, position: 2 },
  { id: ROLE.mention, name: 'Membros', color: 0, position: 1 },
];

const baseSettings: Settings = {
  guildId: '1',
  liveCategoryId: null,
  liveTextChannelId: null,
  announceChannelId: null,
  adminRoleIds: [],
  modRoleIds: [],
  meetingAllowedRoleIds: [],
  maxParticipantsLive: 25,
  graceSeconds: 30,
  liveChannelIds: [],
  logChannelId: null,
  mentionRoleId: null,
  emptyLiveEndSeconds: null,
  idleSessionMinutes: 10,
  activationGraceMinutes: 3,
};

describe('Configurações: buildSettingsPatch', () => {
  const original: Settings = {
    ...baseSettings,
    liveCategoryId: CH.category,
    announceChannelId: CH.announce,
    adminRoleIds: [ROLE.admin],
    liveChannelIds: [CH.voice1],
  };

  it('sem mudanças, o patch é vazio', () => {
    expect(buildSettingsPatch(original, toForm(original))).toEqual({ patch: {} });
  });

  it('manda só o que mudou', () => {
    const form = { ...toForm(original), graceSeconds: '45', modRoleIds: [ROLE.mod] };
    expect(buildSettingsPatch(original, form)).toEqual({
      patch: { graceSeconds: 45, modRoleIds: [ROLE.mod] },
    });
  });

  it('esvaziar um seletor manda null; esvaziar uma lista manda []', () => {
    const form = { ...toForm(original), announceChannelId: '', adminRoleIds: [] };
    expect(buildSettingsPatch(original, form)).toEqual({
      patch: { announceChannelId: null, adminRoleIds: [] },
    });
  });

  it('a ordem dos itens marcados não conta como mudança', () => {
    const o = { ...original, liveChannelIds: [CH.voice1, CH.voice2] };
    const form = { ...toForm(o), liveChannelIds: [CH.voice2, CH.voice1] };
    expect(buildSettingsPatch(o, form)).toEqual({ patch: {} });
  });

  it('seletor que já era vazio e continua vazio não vira alteração', () => {
    expect(buildSettingsPatch(original, { ...toForm(original), logChannelId: '' })).toEqual({
      patch: {},
    });
  });

  it('call a mais marcada vai na lista; cargo de menção e tempos novos entram', () => {
    const form = {
      ...toForm(original),
      liveChannelIds: [CH.voice1, CH.voice3],
      mentionRoleId: ROLE.mention,
      idleSessionMinutes: '15',
      activationGraceMinutes: '5',
      emptyLiveEndSeconds: '120',
    };
    expect(buildSettingsPatch(original, form)).toEqual({
      patch: {
        liveChannelIds: [CH.voice1, CH.voice3],
        mentionRoleId: ROLE.mention,
        idleSessionMinutes: 15,
        activationGraceMinutes: 5,
        emptyLiveEndSeconds: 120,
      },
    });
  });

  it('tempo com a call vazia: vazio volta ao padrão (null)', () => {
    const o = { ...original, emptyLiveEndSeconds: 120 };
    expect(buildSettingsPatch(o, { ...toForm(o), emptyLiveEndSeconds: '' })).toEqual({
      patch: { emptyLiveEndSeconds: null },
    });
  });

  it('junta todos os erros de preenchimento', () => {
    const form = {
      ...toForm(original),
      maxParticipantsLive: '1',
      graceSeconds: '4',
      idleSessionMinutes: '0',
      activationGraceMinutes: '99',
      emptyLiveEndSeconds: '3',
    };
    const r = buildSettingsPatch(original, form);
    expect('errors' in r && r.errors).toHaveLength(5);
  });

  it.each([
    ['2', true],
    ['100', true],
    ['1', false],
    ['101', false],
    ['2.5', false],
    ['', false],
    ['abc', false],
  ])('limite de lives %j', (value, valid) => {
    const r = buildSettingsPatch(original, { ...toForm(original), maxParticipantsLive: value });
    expect('patch' in r).toBe(valid);
  });
});

describe('SettingsPage', () => {
  function mockLoad(settings: Settings = baseSettings) {
    vi.spyOn(api.settings, 'get').mockResolvedValue(settings);
    vi.spyOn(api.guild, 'catalog').mockResolvedValue({ channels, roles });
  }

  it('mostra as calls agrupadas por categoria e salva só as escolhidas', async () => {
    mockLoad();
    const update = vi
      .spyOn(api.settings, 'update')
      .mockResolvedValue({ ...baseSettings, liveChannelIds: [CH.voice1, CH.voice3] });
    render(<SettingsPage />);

    await screen.findByText('Calls de voz');
    expect(screen.getByText('Lives', { selector: 'p' })).toBeInTheDocument(); // grupo da categoria
    await userEvent.click(screen.getByRole('checkbox', { name: 'Sala 1' }));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Papo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ liveChannelIds: [CH.voice1, CH.voice3] }),
    );
    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
  });

  it('"Marcar todas" da categoria escolhe todas as calls dela', async () => {
    mockLoad();
    const update = vi.spyOn(api.settings, 'update').mockResolvedValue(baseSettings);
    render(<SettingsPage />);
    await userEvent.click((await screen.findAllByRole('button', { name: 'Marcar todas' }))[0]!);
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(update).toHaveBeenCalled());
    expect(update.mock.calls[0]![0].liveChannelIds).toEqual(
      expect.arrayContaining([CH.voice1, CH.voice2]),
    );
    expect(update.mock.calls[0]![0].liveChannelIds).not.toContain(CH.voice3);
  });

  it('escolhe canal de avisos, de logs e o cargo marcado nos seletores', async () => {
    mockLoad();
    const update = vi.spyOn(api.settings, 'update').mockResolvedValue(baseSettings);
    render(<SettingsPage />);

    await userEvent.selectOptions(await screen.findByLabelText('Canal de avisos'), '#avisos');
    await userEvent.selectOptions(screen.getByLabelText('Canal de logs'), '#logs');
    await userEvent.selectOptions(screen.getByLabelText('Cargo marcado nos avisos'), 'Membros');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({
        announceChannelId: CH.announce,
        logChannelId: CH.logs,
        mentionRoleId: ROLE.mention,
      }),
    );
  });

  it('cargo de menção vazio mostra "Ninguém"', async () => {
    mockLoad();
    render(<SettingsPage />);
    const select = (await screen.findByLabelText('Cargo marcado nos avisos')) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(within(select).getByRole('option', { name: 'Ninguém' })).toBeInTheDocument();
  });

  it('item salvo que sumiu do servidor aparece marcado para ser removido', async () => {
    mockLoad({ ...baseSettings, liveChannelIds: ['500000000000000077'] });
    render(<SettingsPage />);
    expect(
      await screen.findByText(/Item removido do servidor \(500000000000000077\)/),
    ).toBeInTheDocument();
  });

  it('número inválido não chama a API e explica', async () => {
    mockLoad();
    const update = vi.spyOn(api.settings, 'update');
    render(<SettingsPage />);
    const field = await screen.findByLabelText('Limite de pessoas por live');
    await userEvent.clear(field);
    await userEvent.type(field, '1');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(
      await screen.findByText(/Limite de pessoas por live: um número inteiro de 2 a 100/),
    ).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('canal apagado no Discord: mostra a explicação e o que fazer', async () => {
    mockLoad();
    vi.spyOn(api.settings, 'update').mockRejectedValue(
      new ApiError(400, 'INVALID_DISCORD_REFERENCE', 'x', {}, 'r', 'Escolha o item na lista.'),
    );
    render(<SettingsPage />);
    await userEvent.selectOptions(await screen.findByLabelText('Canal de avisos'), '#avisos');
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText(/não existe no servidor/i)).toBeInTheDocument();
    expect(screen.getByText(/Escolha o item na lista\./)).toBeInTheDocument();
  });

  it('salvar sem mexer em nada não chama a API', async () => {
    mockLoad();
    const update = vi.spyOn(api.settings, 'update');
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });

  it('erro ao carregar', async () => {
    vi.spyOn(api.settings, 'get').mockRejectedValue(apiError(403, 'FORBIDDEN'));
    vi.spyOn(api.guild, 'catalog').mockResolvedValue({ channels, roles });
    render(<SettingsPage />);
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument();
  });
});

describe('AuditPage', () => {
  const entry = (i: number, over: Partial<AuditEntry> = {}): AuditEntry => ({
    id: `id${i}`,
    at: '2026-11-08T20:10:00.000Z',
    actorId: '111111111111111111',
    targetId: '222222222222222222',
    roomId: 'R'.repeat(22),
    action: 'PARTICIPANT_MUTED',
    reason: `motivo ${i}`,
    meta: {},
    ...over,
  });

  it('lista os registros com ação em português e "Sistema" para o relógio', async () => {
    vi.spyOn(api.audit, 'list').mockResolvedValue({
      data: [
        entry(1),
        entry(2, { actorId: 'system', action: 'MEETING_OPENED', targetId: null, reason: null }),
      ],
      page: { next: null, limit: 50 },
    });
    render(<AuditPage />);
    await screen.findByText('motivo 1');
    const rows = screen.getAllByTestId('audit-row');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Silenciou participante')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Abriu reunião')).toBeInTheDocument();
    expect(within(rows[1]!).getByText('Sistema')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /carregar mais/i })).not.toBeInTheDocument();
  });

  it('carrega mais usando o cursor e acrescenta no fim', async () => {
    const list = vi
      .spyOn(api.audit, 'list')
      .mockResolvedValueOnce({ data: [entry(1)], page: { next: 'CURSOR1', limit: 50 } })
      .mockResolvedValueOnce({ data: [entry(2)], page: { next: null, limit: 50 } });
    render(<AuditPage />);
    await screen.findByText('motivo 1');
    await userEvent.click(screen.getByRole('button', { name: /carregar mais/i }));
    await screen.findByText('motivo 2');
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'CURSOR1' }));
    expect(screen.getAllByTestId('audit-row')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /carregar mais/i })).not.toBeInTheDocument();
  });

  it('filtrar recomeça a lista do zero com o filtro na consulta', async () => {
    const list = vi
      .spyOn(api.audit, 'list')
      .mockResolvedValue({ data: [entry(1)], page: { next: 'C', limit: 50 } });
    render(<AuditPage />);
    await screen.findByText('motivo 1');

    await userEvent.selectOptions(screen.getByLabelText('Ação'), 'Baniu participante');
    await waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(
        expect.objectContaining({ action: 'PARTICIPANT_BANNED' }),
      ),
    );
    expect(list.mock.lastCall![0]).not.toHaveProperty('cursor');
  });

  it('sem registros e com erro', async () => {
    vi.spyOn(api.audit, 'list').mockResolvedValueOnce({
      data: [],
      page: { next: null, limit: 50 },
    });
    const { unmount } = render(<AuditPage />);
    expect(await screen.findByText('Nenhum registro.')).toBeInTheDocument();
    unmount();

    vi.spyOn(api.audit, 'list').mockRejectedValue(apiError(403, 'FORBIDDEN'));
    render(<AuditPage />);
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument();
  });

  it('rótulos', () => {
    expect(actionLabel('SETTINGS_UPDATED')).toBe('Alterou configurações');
    expect(actionLabel('ACAO_NOVA')).toBe('ACAO_NOVA');
    expect(actorLabel('system')).toBe('Sistema');
    expect(actorLabel('123')).toBe('123');
  });
});
