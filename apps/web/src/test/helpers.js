import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { api, ApiError } from '../lib/api';
export const makeUser = (over = {}) => ({
    id: '111111111111111111',
    username: 'fulano',
    displayName: 'Fulano',
    avatarUrl: null,
    role: 'MEMBER',
    ...over,
});
export const ROOM_ID = 'kF3x9QzP2mT7vB1nLw0aYc';
export const makeRoom = (over = {}) => ({
    id: ROOM_ID,
    type: 'LIVE',
    status: 'OPEN',
    title: 'Live - Live 1',
    description: null,
    voiceChannelId: '500000000000000011',
    startsAt: null,
    openedAt: '2026-11-08T15:00:00.000Z',
    endedAt: null,
    createdBy: '111111111111111111',
    maxParticipants: 25,
    lectureMode: false,
    mediaState: 'ACTIVE',
    participantCount: 2,
    url: `https://app.exemplo.com/r/${ROOM_ID}`,
    ...over,
});
export const makeMeeting = (over = {}) => ({
    ...makeRoom({
        type: 'MEETING',
        status: 'SCHEDULED',
        title: 'Reunião mensal',
        startsAt: '2030-12-05T23:00:00.000Z',
        voiceChannelId: null,
    }),
    announced: true,
    allowedRoleIds: [],
    reminders: [
        { minutesBefore: 1440, sent: false },
        { minutesBefore: 60, sent: false },
        { minutesBefore: 5, sent: false },
    ],
    ...over,
});
export const makeParticipant = (over = {}) => ({
    userId: '222222222222222222',
    displayName: 'Beltrano',
    avatarUrl: null,
    role: 'MEMBER',
    joinedAt: '2026-11-08T15:05:00.000Z',
    isSpeaker: false,
    mutedByModeration: false,
    mutedSources: [],
    ...over,
});
export const apiError = (status, code, details = {}) => new ApiError(status, code, `mensagem do servidor (${code})`, details);
/** Faz `api.auth.me` devolver o usuário (ou um erro). */
export function mockMe(user) {
    const spy = vi.spyOn(api.auth, 'me');
    if (user instanceof ApiError)
        spy.mockRejectedValue(user);
    else
        spy.mockResolvedValue(user);
    return spy;
}
/** Renderiza dentro de rotas e do provedor de login, como na aplicação. */
export function renderWithApp(ui, opts = {}) {
    const { route = '/', path = '*' } = opts;
    return render(_jsx(MemoryRouter, { initialEntries: [route], children: _jsx(AuthProvider, { children: _jsxs(Routes, { children: [_jsx(Route, { path: path, element: ui }), _jsx(Route, { path: "/", element: _jsx("p", { children: "p\u00E1gina inicial" }) }), _jsx(Route, { path: "/login", element: _jsx("p", { children: "p\u00E1gina de login" }) })] }) }) }));
}
