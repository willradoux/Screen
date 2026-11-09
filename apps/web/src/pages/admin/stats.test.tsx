import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CallsSection } from '../../components/CallsSection';
import { api } from '../../lib/api';
import type { ServerStats } from '../../lib/types';
import { apiError } from '../../test/helpers';
import { StatsPage, formatMinutes } from './StatsPage';

const stats: ServerStats = {
  days: 30,
  from: '2026-10-09T00:00:00.000Z',
  to: '2026-11-08T00:00:00.000Z',
  livesOpened: 12,
  meetingsHeld: 3,
  uniqueParticipants: 25,
  sessions: 80,
  participantMinutes: 1500,
  avgSessionMinutes: 19,
  topPeople: [
    { userId: '1', displayName: 'Ana', minutes: 300 },
    { userId: '2', displayName: 'Beto', minutes: 120 },
  ],
  perDay: [
    { date: '2026-11-06', participants: 4, minutes: 100 },
    { date: '2026-11-07', participants: 8, minutes: 400 },
  ],
};

describe('formatMinutes', () => {
  it('minutos, horas e horas com minutos', () => {
    expect(formatMinutes(40)).toBe('40 min');
    expect(formatMinutes(120)).toBe('2 h');
    expect(formatMinutes(135)).toBe('2 h 15 min');
  });
});

describe('StatsPage', () => {
  it('mostra os números, o ranking e troca o período', async () => {
    const get = vi.spyOn(api.stats, 'get').mockResolvedValue(stats);
    render(<StatsPage />);
    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('25 h')).toBeInTheDocument(); // 1500 min
    expect(screen.getAllByTestId('top-person').map((e) => e.textContent)).toEqual([
      expect.stringContaining('Ana'),
      expect.stringContaining('Beto'),
    ]);
    expect(screen.getByRole('img', { name: 'Tempo conectado por dia' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '90 dias' }));
    await waitFor(() => expect(get).toHaveBeenLastCalledWith(90));
  });

  it('período sem atividade explica em vez de mostrar gráfico vazio', async () => {
    vi.spyOn(api.stats, 'get').mockResolvedValue({ ...stats, sessions: 0, topPeople: [] });
    render(<StatsPage />);
    expect(await screen.findByText('Ninguém entrou em sala neste período.')).toBeInTheDocument();
    expect(screen.getByText('Sem dados ainda.')).toBeInTheDocument();
  });

  it('erro mostra o motivo', async () => {
    vi.spyOn(api.stats, 'get').mockRejectedValue(apiError(403, 'FORBIDDEN'));
    render(<StatsPage />);
    expect(await screen.findByText('Você não tem permissão para isso.')).toBeInTheDocument();
  });
});

describe('CallsSection', () => {
  const inRouter = () =>
    render(
      <MemoryRouter>
        <CallsSection />
      </MemoryRouter>,
    );

  it('mostra só as calls com gente; call vazia (mesmo habilitada) não aparece', async () => {
    vi.spyOn(api.calls, 'list').mockResolvedValue([
      {
        id: 'c1',
        name: 'Sala 1',
        members: [{ userId: '1', displayName: 'Ana', avatarUrl: null }],
        roomId: 'R'.repeat(22),
        mediaState: 'IDLE',
      },
      { id: 'c2', name: 'Sala 2', members: [], roomId: null, mediaState: null },
      { id: 'c3', name: 'Sala 3', members: [], roomId: null, mediaState: null },
    ]);
    inRouter();
    expect(await screen.findByText('Sala 1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Abrir a sala \(ativa a sessão\)/ })).toHaveAttribute(
      'href',
      `/r/${'R'.repeat(22)}`,
    );
    expect(screen.queryByText('Sala 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Sala 3')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('call')).toHaveLength(1);
  });

  it('nenhuma call ativa: caixa simples avisando', async () => {
    vi.spyOn(api.calls, 'list').mockResolvedValue([
      { id: 'c2', name: 'Sala 2', members: [], roomId: null, mediaState: null },
    ]);
    inRouter();
    expect(await screen.findByText('Não tem call ativa.')).toBeInTheDocument();
    expect(screen.queryByText('Sala 2')).not.toBeInTheDocument();
  });

  it('sem calls ou com erro: não mostra nada', async () => {
    const spy = vi.spyOn(api.calls, 'list').mockResolvedValue([]);
    const { container } = inRouter();
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});
