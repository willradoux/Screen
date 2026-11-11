import { describe, expect, it } from 'vitest';
import { ChatState, ROOM_MSGS_PER_SEC } from '../../src/realtime/chat.js';

describe('ChatState (chat em memória)', () => {
  it('modo lento da sala: 20 de uma vez e depois 10 por segundo', () => {
    const s = new ChatState();
    const t = 1_000_000;
    let ok = 0;
    for (let i = 0; i < 30; i++) if (s.takeRoomSlot('r', t)) ok++;
    expect(ok).toBe(20);
    expect(s.takeRoomSlot('r', t)).toBe(false);
    // Meio segundo depois, voltam 5 fichas.
    let later = 0;
    for (let i = 0; i < 10; i++) if (s.takeRoomSlot('r', t + 500)) later++;
    expect(later).toBe(ROOM_MSGS_PER_SEC / 2);
    // Outra sala não é afetada.
    expect(s.takeRoomSlot('outra', t)).toBe(true);
  });

  it('resumo de quem digita: some depois de 3 s; mandar mensagem tira da lista', () => {
    const s = new ChatState();
    expect(s.markTyping('r', 'a', 'Ana', 0)).toBe(true);
    s.setTypingTimer(
      'r',
      setTimeout(() => undefined, 0),
    );
    expect(s.markTyping('r', 'b', 'Beto', 100)).toBe(false); // resumo já agendado
    expect(s.typingSummary('r', 200).count).toBe(2);
    s.stopTyping('r', 'a');
    expect(s.typingSummary('r', 200).people.map((p) => p.name)).toEqual(['Beto']);
    expect(s.typingSummary('r', 3_200).count).toBe(0);
  });

  it('esquecer a sala limpa enquete, digitando e balde', () => {
    const s = new ChatState();
    s.room('r');
    s.markTyping('r', 'a', 'Ana', 0);
    for (let i = 0; i < 20; i++) s.takeRoomSlot('r', 0);
    s.forget('r');
    expect(s.active('r')).toBeNull();
    expect(s.typingSummary('r', 0).count).toBe(0);
    expect(s.takeRoomSlot('r', 0)).toBe(true);
  });
});
