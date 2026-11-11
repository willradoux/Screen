import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { api } from '../lib/api';
import { makeUser, mockMe } from '../test/helpers';
import { AuthProvider } from '../auth/AuthProvider';
import { SetupBanners, setupProblems } from './SetupBanners';
const ok = { botInGuild: true, livesConfigured: true, announceConfigured: true };
describe('setupProblems', () => {
    it('tudo configurado: nenhum aviso', () => {
        expect(setupProblems(ok, false)).toEqual([]);
    });
    it('membro é mandado falar com um admin; admin recebe o que fazer', () => {
        const bad = { botInGuild: false, livesConfigured: false, announceConfigured: false };
        expect(setupProblems(bad, false).every((p) => /administrador/.test(p))).toBe(true);
        expect(setupProblems(bad, true).some((p) => /administrador/.test(p))).toBe(false);
        expect(setupProblems(bad, true)).toHaveLength(3);
    });
});
describe('SetupBanners', () => {
    function renderBanner(role) {
        mockMe(makeUser({ role }));
        return render(_jsx(MemoryRouter, { children: _jsx(AuthProvider, { children: _jsx(SetupBanners, {}) }) }));
    }
    it('mostra o aviso ao membro quando o bot não está no servidor', async () => {
        vi.spyOn(api.system, 'status').mockResolvedValue({ ...ok, botInGuild: false });
        renderBanner('MEMBER');
        expect(await screen.findByText(/bot do Discord não está no servidor/i)).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument();
    });
    it('mostra ao admin o link para configurar', async () => {
        vi.spyOn(api.system, 'status').mockResolvedValue({ ...ok, livesConfigured: false });
        renderBanner('ADMIN');
        expect(await screen.findByText(/Nenhuma call foi escolhida/i)).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /ir para configurações/i })).toBeInTheDocument();
    });
    it('tudo certo ou falha na consulta: não mostra nada', async () => {
        const spy = vi.spyOn(api.system, 'status').mockResolvedValue(ok);
        const { container } = renderBanner('ADMIN');
        await vi.waitFor(() => expect(spy).toHaveBeenCalled());
        expect(container.textContent).toBe('');
    });
});
