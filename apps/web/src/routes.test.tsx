import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { api } from './lib/api';
import type { Settings } from './lib/types';
import { makeUser, mockMe, ROOM_ID } from './test/helpers';

/**
 * Auditoria de rotas: abre CADA rota do app com um admin e confere que a página aparece sem
 * quebrar (título esperado), com a API respondendo "vazio". Se uma rota nova for criada e não
 * entrar aqui, a lista `ROUTES` abaixo precisa ser atualizada, e o teste de cobertura avisa.
 */
const settings: Settings = {
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

function stubApi() {
  vi.spyOn(api.rooms, 'list').mockResolvedValue({ data: [], page: { next: null, limit: 50 } });
  vi.spyOn(api.meetings, 'list').mockResolvedValue([]);
  vi.spyOn(api.calls, 'list').mockResolvedValue([]);
  vi.spyOn(api.settings, 'get').mockResolvedValue(settings);
  vi.spyOn(api.guild, 'catalog').mockResolvedValue({ channels: [], roles: [] });
  vi.spyOn(api.panelUsers, 'list').mockResolvedValue([]);
  vi.spyOn(api.recordings, 'list').mockResolvedValue([]);
  vi.spyOn(api.audit, 'list').mockResolvedValue({ data: [], page: { next: null, limit: 50 } });
  vi.spyOn(api.system, 'status').mockResolvedValue({
    botInGuild: true,
    livesConfigured: true,
    announceConfigured: true,
  });
  vi.spyOn(api.stats, 'get').mockResolvedValue({
    days: 30,
    from: '2026-10-01T00:00:00.000Z',
    to: '2026-11-01T00:00:00.000Z',
    livesOpened: 0,
    meetingsHeld: 0,
    uniqueParticipants: 0,
    sessions: 0,
    participantMinutes: 0,
    avgSessionMinutes: 0,
    topPeople: [],
    perDay: [],
  });
  // A sala só precisa carregar: o acesso fica "checando" sem rede de verdade.
  vi.spyOn(api.rooms, 'get').mockReturnValue(new Promise(() => undefined));
  vi.spyOn(api.rooms, 'access').mockReturnValue(new Promise(() => undefined));
}

function open(path: string, role: 'MEMBER' | 'MOD' | 'ADMIN' = 'ADMIN') {
  mockMe(makeUser({ role }));
  stubApi();
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const ROUTES: { path: string; expect: RegExp | string; level?: number }[] = [
  { path: '/', expect: 'Salas' },
  { path: '/reunioes', expect: 'Reuniões' },
  { path: '/preferencias', expect: 'Preferências' },
  { path: '/features', expect: /Transmita tela/ },
  { path: '/admin', expect: 'Painel' },
  { path: '/admin/reunioes', expect: 'Gerenciar reuniões' },
  { path: '/admin/config', expect: 'Configurações' },
  { path: '/admin/pessoas', expect: 'Pessoas com acesso' },
  { path: '/admin/estatisticas', expect: 'Estatísticas' },
  { path: '/admin/gravacoes', expect: 'Gravações' },
  { path: '/admin/auditoria', expect: 'Auditoria' },
  { path: `/r/${ROOM_ID}`, expect: /Verificando seu acesso/, level: 0 },
  { path: '/rota-que-nao-existe', expect: 'Página não encontrada' },
];

describe('auditoria de rotas (admin)', () => {
  it.each(ROUTES)('$path abre sem quebrar', async ({ path, expect: want, level }) => {
    open(path);
    if (level === 0) {
      expect(await screen.findByText(want, undefined, { timeout: 5000 })).toBeInTheDocument();
    } else {
      expect(
        await screen.findByRole('heading', { level: level ?? 1, name: want }, { timeout: 5000 }),
      ).toBeInTheDocument();
    }
  });
});

describe('auditoria de rotas (permissões)', () => {
  it('membro não vê as páginas de administração: mostra o motivo e o caminho de volta', async () => {
    for (const path of ['/admin', '/admin/config', '/admin/pessoas', '/admin/gravacoes']) {
      const { unmount } = open(path, 'MEMBER');
      expect(await screen.findByText('Acesso restrito')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Voltar para a página principal/ })).toHaveAttribute(
        'href',
        '/',
      );
      unmount();
    }
  });

  it('moderador vê o Painel, mas não as páginas só de admin', async () => {
    const { unmount } = open('/admin', 'MOD');
    expect(await screen.findByRole('heading', { level: 1, name: 'Painel' })).toBeInTheDocument();
    unmount();
    open('/admin/config', 'MOD');
    expect(await screen.findByText('Acesso restrito')).toBeInTheDocument();
  });

  it('anônimo é mandado para o login (e /features continua pública)', async () => {
    mockMe(new (await import('./lib/api')).ApiError(401, 'UNAUTHENTICATED', 'x'));
    stubApi();
    const { unmount } = render(
      <MemoryRouter initialEntries={['/features']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent(/Transmita tela/);
    unmount();

    mockMe(new (await import('./lib/api')).ApiError(401, 'UNAUTHENTICATED', 'x'));
    render(
      <MemoryRouter initialEntries={['/admin/config']}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Entrar com Discord' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Entrar' })).toBeInTheDocument();
  });
});

describe('cobertura de rotas', () => {
  it('toda rota declarada no App está na auditoria', async () => {
    const src = (await import('./App?raw')).default as string;
    const declared = [...src.matchAll(/path="([^"*]+)"/g)].map((m) => m[1]!);
    // /login é auditada no teste de anônimo, que é o único que a vê.
    // /__lab é o laboratório do palco: só existe em desenvolvimento, fora do build.
    const audited = [
      ...ROUTES.map((r) => r.path.replace(ROOM_ID, ':roomId')),
      '/login',
      '/__lab',
    ];
    for (const p of declared) {
      const normalized = p.startsWith('/') ? p : `/${p}`;
      const index = normalized === '/' ? true : false;
      void index;
      expect(
        audited.some((a) => a === normalized || a === `/${p}` || a.endsWith(normalized)),
        `rota sem auditoria: ${p}`,
      ).toBe(true);
    }
  });
});
