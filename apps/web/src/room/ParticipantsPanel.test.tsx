import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import type { Role } from '../lib/types';
import { ROOM_ID, apiError, makeParticipant, makeRoom } from '../test/helpers';
import { ParticipantsPanel } from './ParticipantsPanel';

const ME = '111111111111111111';
const people = {
  member: makeParticipant({
    userId: '222222222222222222',
    displayName: 'Membro Um',
    role: 'MEMBER',
  }),
  member2: makeParticipant({
    userId: '333333333333333333',
    displayName: 'Membro Dois',
    role: 'MEMBER',
  }),
  mod: makeParticipant({
    userId: '444444444444444444',
    displayName: 'Moderador Outro',
    role: 'MOD',
  }),
  admin: makeParticipant({
    userId: '555555555555555555',
    displayName: 'Admin Outro',
    role: 'ADMIN',
  }),
};

function setup(
  role: Role,
  list = Object.values(people),
  over: { lectureMode?: boolean; screenLock?: boolean; spotlightId?: string | null } = {},
) {
  vi.spyOn(api.rooms, 'participants').mockResolvedValue([
    makeParticipant({ userId: ME, displayName: 'Eu mesmo', role }),
    ...list,
  ]);
  const onInfo = vi.fn();
  const onError = vi.fn();
  render(
    <ParticipantsPanel
      room={makeRoom({
        type: 'MEETING',
        screenLock: over.screenLock ?? false,
        spotlightId: over.spotlightId ?? null,
      })}
      me={{ id: ME, role }}
      version={0}
      lectureMode={over.lectureMode ?? false}
      onInfo={onInfo}
      onError={onError}
    />,
  );
  return { onInfo, onError };
}

const row = (name: string) =>
  screen.getByText(name).closest('[data-testid="person"]') as HTMLElement;

describe('ParticipantsPanel: quem pode moderar quem', () => {
  it('membro vê a lista mas nenhuma ação', async () => {
    setup('MEMBER');
    await screen.findByText('Membro Um');
    expect(
      screen.queryByRole('button', { name: /silenciar|expulsar|banir|palestrante/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /encerrar sala/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /palco:/i })).not.toBeInTheDocument();
  });

  it('moderador age sobre membros, mas não sobre moderadores nem admins nem sobre si', async () => {
    setup('MOD');
    await screen.findByText('Membro Um');
    expect(within(row('Membro Um')).getByRole('button', { name: 'Expulsar' })).toBeInTheDocument();
    expect(within(row('Moderador Outro')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('Admin Outro')).queryByRole('button')).not.toBeInTheDocument();
    expect(within(row('Eu mesmo')).queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/não podem moderar outros moderadores/i)).toBeInTheDocument();
  });

  it('admin age sobre membros e moderadores, mas não sobre outro admin', async () => {
    setup('ADMIN');
    await screen.findByText('Membro Um');
    expect(
      within(row('Moderador Outro')).getByRole('button', { name: 'Banir' }),
    ).toBeInTheDocument();
    expect(within(row('Membro Um')).getByRole('button', { name: 'Banir' })).toBeInTheDocument();
    expect(within(row('Admin Outro')).queryByRole('button')).not.toBeInTheDocument();
    // Em si mesmo o admin só tem o palco, nada de expulsar ou banir.
    expect(
      within(row('Eu mesmo')).queryByRole('button', { name: 'Banir' }),
    ).not.toBeInTheDocument();
    expect(
      within(row('Eu mesmo')).getByRole('button', { name: 'Subir ao palco' }),
    ).toBeInTheDocument();
  });

  it('moderação vê os controles da sala; membro não', async () => {
    setup('MOD');
    expect(await screen.findByRole('button', { name: /palco: desligado/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /encerrar sala/i })).toBeInTheDocument();
  });

  it('mostra papéis, quem está no palco e silenciados', async () => {
    setup('MOD', [
      makeParticipant({ userId: '222222222222222222', displayName: 'Membro Um', isSpeaker: true }),
      makeParticipant({
        userId: '333333333333333333',
        displayName: 'Membro Dois',
        mutedByModeration: true,
        mutedSources: ['microphone', 'camera'],
      }),
    ]);
    await screen.findByText('Membro Um');
    expect(within(row('Membro Um')).getByText('No palco')).toBeInTheDocument();
    expect(within(row('Membro Dois')).getByText('Silenciado')).toBeInTheDocument();
    expect(
      within(row('Membro Dois')).getByText(/Bloqueado: microfone, câmera/),
    ).toBeInTheDocument();
    expect(within(row('Eu mesmo')).getByText('(você)')).toBeInTheDocument();
  });
});

describe('ParticipantsPanel: ações', () => {
  it('silenciar chama a API e avisa; depois recarrega a lista', async () => {
    const mute = vi.spyOn(api.moderation, 'mute').mockResolvedValue(undefined);
    const { onInfo } = setup('MOD', [people.member]);
    await userEvent.click(
      await within(await screen.findByText('Membro Um').then(() => row('Membro Um'))).findByRole(
        'button',
        { name: 'Silenciar' },
      ),
    );
    expect(mute).toHaveBeenCalledWith(ROOM_ID, people.member.userId);
    await waitFor(() => expect(onInfo).toHaveBeenCalledWith('Membro Um silenciado(a).'));
    expect(vi.mocked(api.rooms.participants).mock.calls.length).toBeGreaterThan(1);
  });

  it('quem está silenciado mostra "Liberar"', async () => {
    const unmute = vi.spyOn(api.moderation, 'unmute').mockResolvedValue(undefined);
    setup('MOD', [
      makeParticipant({ ...people.member, mutedByModeration: true, mutedSources: ['microphone'] }),
    ]);
    await screen.findByText('Membro Um');
    expect(
      within(row('Membro Um')).queryByRole('button', { name: 'Silenciar' }),
    ).not.toBeInTheDocument();
    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Liberar' }));
    expect(unmute).toHaveBeenCalledWith(ROOM_ID, people.member.userId);
  });

  it('moderador comum não sobe ninguém ao palco; só admin', async () => {
    setup('MOD', [people.member]);
    await screen.findByText('Membro Um');
    expect(
      within(row('Membro Um')).queryByRole('button', { name: 'Subir ao palco' }),
    ).not.toBeInTheDocument();
  });

  it('promover e rebaixar palestrante (admin)', async () => {
    const promote = vi.spyOn(api.moderation, 'promote').mockResolvedValue(undefined);
    const demote = vi.spyOn(api.moderation, 'demote').mockResolvedValue(undefined);
    setup('ADMIN', [people.member, makeParticipant({ ...people.member2, isSpeaker: true })]);
    await screen.findByText('Membro Um');
    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Subir ao palco' }));
    expect(promote).toHaveBeenCalledWith(ROOM_ID, people.member.userId);
    await userEvent.click(
      within(row('Membro Dois')).getByRole('button', { name: 'Tirar do palco' }),
    );
    expect(demote).toHaveBeenCalledWith(ROOM_ID, people.member2.userId);
  });

  it('expulsar pede confirmação e só então chama a API; cancelar desiste', async () => {
    const kick = vi.spyOn(api.moderation, 'kick').mockResolvedValue(undefined);
    setup('MOD', [people.member]);
    await screen.findByText('Membro Um');

    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Expulsar' }));
    expect(kick).not.toHaveBeenCalled();
    expect(screen.getByText(/Expulsar Membro Um\? A pessoa pode voltar/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(kick).not.toHaveBeenCalled();
    expect(screen.queryByText(/Expulsar Membro Um\?/)).not.toBeInTheDocument();

    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Expulsar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(kick).toHaveBeenCalledWith(ROOM_ID, people.member.userId);
  });

  it('banir: moderador escolhe entre 15 min, 1 h e 24 h (sem "até o fim da sala")', async () => {
    const ban = vi.spyOn(api.moderation, 'ban').mockResolvedValue(undefined);
    setup('MOD', [people.member]);
    await screen.findByText('Membro Um');
    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Banir' }));

    const select = screen.getByRole('combobox', { name: 'Por quanto tempo' });
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['15 minutos', '1 hora', '24 horas']);
    await userEvent.selectOptions(select, '15 minutos');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(ban).toHaveBeenCalledWith(ROOM_ID, people.member.userId, { durationMinutes: 15 });
  });

  it('banir: admin tem a opção "até o fim da sala" (0 minutos)', async () => {
    const ban = vi.spyOn(api.moderation, 'ban').mockResolvedValue(undefined);
    setup('ADMIN', [people.member]);
    await screen.findByText('Membro Um');
    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Banir' }));
    await userEvent.selectOptions(
      screen.getByRole('combobox', { name: 'Por quanto tempo' }),
      'Até o fim da sala',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(ban).toHaveBeenCalledWith(ROOM_ID, people.member.userId, { durationMinutes: 0 });
  });

  it('o servidor recusa: mostra o motivo e mantém a lista', async () => {
    vi.spyOn(api.moderation, 'mute').mockRejectedValue(apiError(403, 'HIERARCHY_VIOLATION'));
    const { onError } = setup('MOD', [people.member]);
    await screen.findByText('Membro Um');
    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Silenciar' }));
    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.stringMatching(/papel igual ou superior/)),
    );
    expect(screen.getByText('Membro Um')).toBeInTheDocument();
  });

  it('alvo que já saiu: erro claro', async () => {
    vi.spyOn(api.moderation, 'kick').mockRejectedValue(apiError(404, 'PARTICIPANT_NOT_IN_ROOM'));
    const { onError } = setup('MOD', [people.member]);
    await screen.findByText('Membro Um');
    await userEvent.click(within(row('Membro Um')).getByRole('button', { name: 'Expulsar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Essa pessoa não está mais na sala.'));
  });

  it('modo palestra: liga e desliga pela API de edição da sala', async () => {
    const update = vi.spyOn(api.rooms, 'update').mockResolvedValue(makeRoom({ type: 'MEETING' }));
    setup('MOD', [people.member]);
    await userEvent.click(await screen.findByRole('button', { name: /palco: desligado/i }));
    expect(update).toHaveBeenCalledWith(ROOM_ID, { lectureMode: true });
  });

  it('modo palestra já ligado oferece desligar', async () => {
    const update = vi.spyOn(api.rooms, 'update').mockResolvedValue(makeRoom({ type: 'MEETING' }));
    setup('MOD', [people.member], { lectureMode: true });
    await userEvent.click(await screen.findByRole('button', { name: /palco: ligado/i }));
    expect(update).toHaveBeenCalledWith(ROOM_ID, { lectureMode: false });
  });

  it('encerrar a sala', async () => {
    const end = vi.spyOn(api.rooms, 'end').mockResolvedValue(undefined);
    setup('MOD', [people.member]);
    await userEvent.click(await screen.findByRole('button', { name: /encerrar sala/i }));
    expect(end).toHaveBeenCalledWith(ROOM_ID);
  });

  it('falha ao carregar a lista mostra o erro', async () => {
    vi.spyOn(api.rooms, 'participants').mockRejectedValue(apiError(403, 'FORBIDDEN'));
    render(
      <ParticipantsPanel
        room={makeRoom({ type: 'MEETING' })}
        me={{ id: ME, role: 'MEMBER' }}
        version={0}
        lectureMode={false}
        onInfo={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument();
  });

  it('muda a versão (alguém entrou/saiu): recarrega', async () => {
    const spy = vi.spyOn(api.rooms, 'participants').mockResolvedValue([]);
    const props = {
      room: makeRoom({ type: 'MEETING' }),
      me: { id: ME, role: 'MEMBER' as Role },
      lectureMode: false,
      onInfo: vi.fn(),
      onError: vi.fn(),
    };
    const { rerender } = render(<ParticipantsPanel {...props} version={0} />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    rerender(<ParticipantsPanel {...props} version={1} />);
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2), { timeout: 4000 });
  });
});

describe('ParticipantsPanel: tela travada e destaque para todos', () => {
  it('moderador trava a tela; o botão mostra o estado e chama a API', async () => {
    const update = vi.spyOn(api.rooms, 'update').mockResolvedValue(makeRoom({ type: 'MEETING' }));
    setup('MOD');
    await screen.findByText('Membro Um');
    await userEvent.click(screen.getByRole('button', { name: 'Tela: liberada' }));
    expect(update).toHaveBeenCalledWith(ROOM_ID, { screenLock: true });
  });

  it('com a tela travada o botão avisa que só o palco compartilha', async () => {
    setup('MOD', undefined, { screenLock: true });
    await screen.findByText('Membro Um');
    expect(screen.getByRole('button', { name: 'Tela: só no palco' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('só o admin destaca alguém para todos', async () => {
    const update = vi.spyOn(api.rooms, 'update').mockResolvedValue(makeRoom({ type: 'MEETING' }));
    setup('ADMIN');
    await screen.findByText('Membro Um');
    await userEvent.click(
      within(row('Membro Um')).getByRole('button', { name: 'Destacar para todos' }),
    );
    expect(update).toHaveBeenCalledWith(ROOM_ID, { spotlightId: people.member.userId });
  });

  it('moderador não vê o botão de destaque', async () => {
    setup('MOD');
    await screen.findByText('Membro Um');
    expect(screen.queryByRole('button', { name: /destacar para todos/i })).not.toBeInTheDocument();
  });

  it('quem está em destaque ganha o botão de tirar', async () => {
    setup('ADMIN', undefined, { spotlightId: people.member.userId });
    await screen.findByText('Membro Um');
    expect(
      within(row('Membro Um')).getByRole('button', { name: 'Tirar destaque' }),
    ).toBeInTheDocument();
  });
});
