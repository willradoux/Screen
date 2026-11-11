import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChatMessage, Poll } from '../lib/types';
import { ChatPanel } from './ChatPanel';
import type { RoomChat } from './useRoomSession';

const ok = () => Promise.resolve({ ok: true });

function fakeChat(over: Partial<RoomChat> = {}): RoomChat {
  return {
    messages: [],
    poll: null,
    pendingPolls: [],
    typing: [],
    notifyTyping: vi.fn(),
    send: vi.fn(ok),
    remove: vi.fn(ok),
    propose: vi.fn(ok),
    approve: vi.fn(ok),
    reject: vi.fn(ok),
    vote: vi.fn(ok),
    close: vi.fn(ok),
    clear: vi.fn(ok),
    ...over,
  };
}

const msg = (id: string, text: string, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  userId: 'u2',
  displayName: 'Beto',
  avatarUrl: null,
  role: 'MEMBER',
  text,
  at: '2026-11-11T18:00:00.000Z',
  ...over,
});

const poll = (over: Partial<Poll> = {}): Poll => ({
  id: 'p1',
  question: 'Próximo tema?',
  options: [
    { text: 'React', votes: 1 },
    { text: 'Node', votes: 3 },
  ],
  total: 4,
  status: 'open',
  proposedBy: 'Beto',
  ...over,
});

const renderChat = (chat: RoomChat, role: 'MEMBER' | 'MOD' = 'MEMBER', live = true) =>
  render(
    <ChatPanel
      chat={chat}
      me={{ id: 'u1', role }}
      pollsEnabled={live}
      onError={vi.fn()}
      onInfo={vi.fn()}
    />,
  );

describe('ChatPanel', () => {
  it('mostra as mensagens e manda a sua; depois espera 3 s para a próxima', async () => {
    const chat = fakeChat({ messages: [msg('m1', 'oi galera')] });
    renderChat(chat);
    expect(screen.getByRole('log', { name: 'Mensagens' })).toHaveTextContent('oi galera');

    await userEvent.type(screen.getByRole('textbox', { name: 'Mensagem para a sala' }), 'salve');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar' }));
    expect(chat.send).toHaveBeenCalledWith('salve');
    // O botão passa a contar a espera.
    expect(screen.getByRole('button', { name: /Espere \d s/ })).toBeDisabled();
  });

  it('fora do modo live (salinhas e reunião sem palco) não tem enquete, só o chat', () => {
    renderChat(fakeChat({ poll: poll() }), 'MOD', false);
    expect(screen.queryByRole('region', { name: 'Enquete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /enquete/i })).not.toBeInTheDocument();
  });

  it('mostra quem está digitando acima da caixa', () => {
    renderChat(fakeChat({ typing: ['Beto'] }));
    expect(screen.getByText('Beto está digitando…')).toBeInTheDocument();
  });

  it('membro vota na enquete do topo e passa a ver o resultado', async () => {
    const chat = fakeChat({ poll: poll() });
    renderChat(chat);
    const card = screen.getByRole('region', { name: 'Enquete' });
    expect(card).toHaveTextContent('Próximo tema?');
    await userEvent.click(within(card).getByRole('button', { name: 'Node' }));
    expect(chat.vote).toHaveBeenCalledWith('p1', 1);
    expect(card).toHaveTextContent('75%');
  });

  it('membro sugere enquete; não vê sugestões nem apaga mensagens', async () => {
    const chat = fakeChat({ messages: [msg('m1', 'oi')], pendingPolls: [poll()] });
    renderChat(chat);
    expect(screen.queryByRole('region', { name: 'Enquetes sugeridas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Apagar a mensagem/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Sugerir enquete' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Pergunta da enquete' }), 'Pausa?');
    await userEvent.type(screen.getByRole('textbox', { name: 'Opção 1' }), 'Sim');
    await userEvent.type(screen.getByRole('textbox', { name: 'Opção 2' }), 'Não');
    await userEvent.click(screen.getByRole('button', { name: 'Sugerir' }));
    expect(chat.propose).toHaveBeenCalledWith('Pausa?', ['Sim', 'Não']);
  });

  it('a moderação aceita sugestões, apaga mensagens e encerra a enquete', async () => {
    const chat = fakeChat({
      messages: [msg('m1', 'spam')],
      poll: poll(),
      pendingPolls: [poll({ id: 'p2', question: 'Outra?', status: 'pending' })],
    });
    renderChat(chat, 'MOD');
    const pending = screen.getByRole('region', { name: 'Enquetes sugeridas' });
    await userEvent.click(within(pending).getByRole('button', { name: 'Aceitar' }));
    expect(chat.approve).toHaveBeenCalledWith('p2');

    await userEvent.click(screen.getByRole('button', { name: 'Apagar a mensagem de Beto' }));
    expect(chat.remove).toHaveBeenCalledWith('m1');

    await userEvent.click(screen.getByRole('button', { name: 'Encerrar' }));
    expect(chat.close).toHaveBeenCalledWith('p1');
  });
});
