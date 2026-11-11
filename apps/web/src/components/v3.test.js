import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { RecordingsPage } from '../pages/admin/RecordingsPage';
import { AdminHomePage } from '../pages/admin/AdminHomePage';
import { LoginPage } from '../pages/LoginPage';
import { PreferencesPage } from '../pages/PreferencesPage';
import { Stage } from '../room/Stage';
import { makeMeeting, makeRoom, makeUser, mockMe, renderWithApp } from '../test/helpers';
import { CallsSection } from './CallsSection';
import { Layout } from './Layout';
import { Loader } from './Loader';
import { RoomCard } from './RoomCard';
import { ScreenLogo } from './ScreenLogo';
import { ThemeToggle } from './ThemeToggle';
/*
 * Testes das peças da v3 (estética nova): cada componente sozinho, pelo que a pessoa vê e
 * faz (papéis e nomes acessíveis), sem depender de estilo.
 */
afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.mode;
    delete document.documentElement.dataset.motion;
});
describe('ScreenLogo e Loader (bichinho)', () => {
    it('o logo é decorativo sem título e uma imagem com nome quando tem título', () => {
        const { container, rerender } = render(_jsx(ScreenLogo, {}));
        expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
        rerender(_jsx(ScreenLogo, { title: "Screen" }));
        expect(screen.getByRole('img', { name: 'Screen' })).toBeInTheDocument();
    });
    it('o carregamento anuncia o que acontece e mostra a explicação', () => {
        render(_jsx(Loader, { label: "Verificando seu acesso", children: "Conferindo se voc\u00EA pode entrar." }));
        expect(screen.getByRole('status', { name: 'Verificando seu acesso' })).toBeInTheDocument();
        expect(screen.getByText('Verificando seu acesso…')).toBeInTheDocument();
        expect(screen.getByText('Conferindo se você pode entrar.')).toBeInTheDocument();
    });
});
describe('RoomCard (card de sala)', () => {
    const inRoutes = (ui) => render(_jsx(MemoryRouter, { initialEntries: ['/'], children: _jsxs(Routes, { children: [_jsx(Route, { path: "/", element: ui }), _jsx(Route, { path: "/r/:id", element: _jsx("p", { children: "dentro da sala" }) })] }) }));
    it('sala aberta: botão de entrar com o nome da sala como descrição', () => {
        inRoutes(_jsx(RoomCard, { room: makeRoom({ title: 'Live - Codando' }) }));
        const enter = screen.getByRole('link', { name: 'Entrar' });
        expect(enter).toHaveAttribute('href', `/r/${makeRoom().id}`);
        expect(enter).toHaveAccessibleDescription('Live - Codando');
        expect(screen.getByText(/2\/25 pessoas/)).toBeInTheDocument();
    });
    it('reunião agendada: "Ver sala" e quando começa', () => {
        inRoutes(_jsx(RoomCard, { room: makeMeeting() }));
        expect(screen.getByRole('link', { name: 'Ver sala' })).toBeInTheDocument();
        expect(screen.getByText(/Começa em/)).toBeInTheDocument();
    });
    it('clicar em qualquer parte do card entra na sala', async () => {
        inRoutes(_jsx(RoomCard, { room: makeRoom() }));
        await userEvent.click(screen.getByRole('heading', { name: 'Live - Live 1' }));
        expect(screen.getByText('dentro da sala')).toBeInTheDocument();
    });
});
describe('CallsSection (calls do Discord)', () => {
    const call = (over = {}) => ({
        id: 'c1',
        name: 'Live 1',
        roomId: 'R1',
        mediaState: 'ACTIVE',
        members: [{ userId: 'a', displayName: 'Ana', avatarUrl: null }],
        ...over,
    });
    it('não repete a call cuja sala já aparece na página', () => {
        const { container } = render(_jsx(MemoryRouter, { children: _jsx(CallsSection, { calls: [call()], shownRoomIds: ['R1'] }) }));
        expect(container).toBeEmptyDOMElement();
    });
    it('call sem sala ainda: avisa que a sala abre em instantes', () => {
        render(_jsx(MemoryRouter, { children: _jsx(CallsSection, { calls: [call({ roomId: null })], shownRoomIds: ['R1'] }) }));
        expect(screen.getByText('A sala abre em instantes.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: /Calls agora/ })).toBeInTheDocument();
    });
});
describe('Preferências', () => {
    it('as chaves de animações e sons ligam e desligam e ficam salvas', async () => {
        render(_jsx(PreferencesPage, {}));
        const motion = screen.getByRole('switch', { name: 'Animações' });
        expect(motion).toHaveAttribute('aria-checked', 'true');
        await userEvent.click(motion);
        expect(motion).toHaveAttribute('aria-checked', 'false');
        expect(document.documentElement.dataset.motion).toBe('off');
        const sounds = screen.getByRole('switch', { name: 'Sons da sala' });
        await userEvent.click(sounds);
        expect(sounds).toHaveAttribute('aria-checked', 'false');
        expect(localStorage.getItem('screem-sounds')).toBe('off');
    });
    it('o modo é escolhido à parte da cor', async () => {
        render(_jsx(PreferencesPage, {}));
        const modes = screen.getByRole('radiogroup', { name: 'Modo' });
        await userEvent.click(within(modes).getByRole('radio', { name: 'Claro' }));
        expect(document.documentElement.dataset.mode).toBe('light');
        const colors = screen.getByRole('radiogroup', { name: 'Cor dos detalhes' });
        expect(within(colors).getAllByRole('radio')).toHaveLength(3);
    });
});
describe('Janela de tema', () => {
    it('abre, troca a cor e o modo e fecha com Esc', async () => {
        render(_jsx(ThemeToggle, { variant: "menu" }));
        await userEvent.click(screen.getByRole('button', { name: /Trocar tema/ }));
        const dialog = screen.getByRole('dialog');
        await userEvent.click(within(dialog).getByRole('radio', { name: /Acelera/ }));
        expect(document.documentElement.dataset.theme).toBe('acelera');
        await userEvent.click(within(dialog).getByRole('radio', { name: 'Claro' }));
        expect(document.documentElement.dataset.mode).toBe('light');
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
});
describe('Palco', () => {
    const pub = () => ({
        track: { attach: vi.fn(), detach: vi.fn() },
        isMuted: false,
    });
    const tile = (over = {}) => ({
        identity: 'a',
        name: 'Ana',
        role: 'MEMBER',
        avatarUrl: null,
        isLocal: false,
        isSpeaking: false,
        canPublish: true,
        micOn: true,
        cameraPub: undefined,
        screenPub: undefined,
        screenPublished: false,
        ...over,
    });
    it('com 3 ou mais pessoas o mosaico vira grade uniforme', () => {
        const { container } = render(_jsx(Stage, { tiles: [
                tile(),
                tile({ identity: 'b', name: 'Beto' }),
                tile({ identity: 'c', name: 'Caio' }),
            ] }));
        expect(container.querySelector('[data-layout="mosaic"]')).toHaveAttribute('data-dense', 'true');
    });
    it('no toque, tocar no vídeo mostra o botão de fixar', () => {
        render(_jsx(Stage, { tiles: [tile({ cameraPub: pub() })] }));
        const figure = screen.getByTestId('tile');
        expect(figure).not.toHaveAttribute('data-reveal');
        // O jsdom não monta PointerEvent com pointerType: cria o "toque" na mão.
        const touch = new MouseEvent('pointerup', { bubbles: true });
        Object.defineProperty(touch, 'pointerType', { value: 'touch' });
        act(() => {
            figure.dispatchEvent(touch);
        });
        expect(figure).toHaveAttribute('data-reveal', 'true');
    });
    it('o mouse não liga o "toque" (o botão aparece pelo hover)', () => {
        render(_jsx(Stage, { tiles: [tile({ cameraPub: pub() })] }));
        const figure = screen.getByTestId('tile');
        fireEvent.pointerUp(figure, { pointerType: 'mouse' });
        expect(figure).not.toHaveAttribute('data-reveal');
    });
});
describe('Login', () => {
    it('mostra o botão de entrar e o que tem no Screen', async () => {
        mockMe(makeUser());
        vi.spyOn(api.auth, 'me').mockRejectedValue(Object.assign(new Error('x'), { status: 401, code: 'UNAUTHENTICATED' }));
        renderWithApp(_jsx(LoginPage, {}), { route: '/login', path: '/login' });
        expect(await screen.findByRole('link', { name: /Entrar com Discord/ })).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'O que tem no Screen' })).toBeInTheDocument();
        expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(3);
    });
});
describe('Painel: atalhos', () => {
    const stub = () => {
        vi.spyOn(api.rooms, 'list').mockResolvedValue({ data: [], page: { next: null, limit: 50 } });
        vi.spyOn(api.meetings, 'list').mockResolvedValue([]);
    };
    it('admin vê os atalhos', async () => {
        stub();
        vi.spyOn(api.settings, 'get').mockResolvedValue({
            liveChannelIds: ['1'],
            liveCategoryId: null,
            announceChannelId: '2',
            logChannelId: '3',
        });
        mockMe(makeUser({ role: 'ADMIN' }));
        renderWithApp(_jsx(AdminHomePage, {}), { route: '/admin', path: '/admin' });
        const nav = await screen.findByRole('navigation', { name: 'Atalhos' });
        expect(within(nav).getByRole('link', { name: /Nova reunião/ })).toHaveAttribute('href', '/admin/reunioes');
    });
    it('moderador não vê atalhos de páginas que são só de admin', async () => {
        stub();
        mockMe(makeUser({ role: 'MOD' }));
        renderWithApp(_jsx(AdminHomePage, {}), { route: '/admin', path: '/admin' });
        expect(await screen.findByRole('heading', { name: /Sessões de live agora/ })).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Atalhos' })).not.toBeInTheDocument();
    });
});
describe('Gravações: resumo', () => {
    it('conta as prontas, o espaço, o tempo e as que vencem logo', async () => {
        const rec = (over) => ({
            id: 'r1',
            roomId: 'R',
            title: 'Reunião',
            mode: 'GRID',
            targetUserId: null,
            status: 'READY',
            error: null,
            sizeBytes: 300 * 1024 ** 2,
            durationSec: 1800,
            startedBy: '1',
            startedAt: '2026-11-01T10:00:00.000Z',
            endedAt: '2026-11-01T10:30:00.000Z',
            expiresAt: '2026-11-12T10:00:00.000Z',
            daysLeft: 2,
            downloaded: false,
            ...over,
        });
        vi.spyOn(api.recordings, 'list').mockResolvedValue([
            rec({}),
            rec({ id: 'r2', daysLeft: 8, sizeBytes: 400 * 1024 ** 2 }),
        ]);
        render(_jsx(MemoryRouter, { children: _jsx(RecordingsPage, {}) }));
        expect(await screen.findByText('Prontas para baixar')).toBeInTheDocument();
        expect(screen.getByText('700 MB')).toBeInTheDocument();
        expect(screen.getByText('60 min')).toBeInTheDocument();
        expect(screen.getByText('Baixe antes de serem apagadas')).toBeInTheDocument();
    });
});
describe('Menu da conta (rodapé do menu lateral)', () => {
    const renderShell = () => render(_jsx(MemoryRouter, { initialEntries: ['/'], children: _jsx(AuthProvider, { children: _jsx(Routes, { children: _jsx(Route, { element: _jsx(Layout, {}), children: _jsx(Route, { index: true, element: _jsx("p", { children: "in\u00EDcio" }) }) }) }) }) }));
    it('abre por cima do cartão, fecha com Esc e o foco volta para o cartão', async () => {
        mockMe(makeUser({ displayName: 'Will' }));
        renderShell();
        const account = await screen.findByRole('button', { name: 'Sua conta' });
        expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
        await userEvent.click(account);
        expect(account).toHaveAttribute('aria-expanded', 'true');
        expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        expect(account).toHaveAttribute('aria-expanded', 'false');
        expect(account).toHaveFocus();
    });
    it('fecha clicando fora', async () => {
        mockMe(makeUser());
        renderShell();
        const account = await screen.findByRole('button', { name: 'Sua conta' });
        await userEvent.click(account);
        await userEvent.click(screen.getByText('início'));
        expect(account).toHaveAttribute('aria-expanded', 'false');
    });
});
