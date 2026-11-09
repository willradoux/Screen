import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { api, ApiError } from '../lib/api';
import type { Meeting, Participant, Room, User } from '../lib/types';

export const makeUser = (over: Partial<User> = {}): User => ({
  id: '111111111111111111',
  username: 'fulano',
  displayName: 'Fulano',
  avatarUrl: null,
  role: 'MEMBER',
  ...over,
});

export const ROOM_ID = 'kF3x9QzP2mT7vB1nLw0aYc';

export const makeRoom = (over: Partial<Room> = {}): Room => ({
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

export const makeMeeting = (over: Partial<Meeting> = {}): Meeting => ({
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

export const makeParticipant = (over: Partial<Participant> = {}): Participant => ({
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

export const apiError = (status: number, code: string, details: Record<string, unknown> = {}) =>
  new ApiError(status, code, `mensagem do servidor (${code})`, details);

/** Faz `api.auth.me` devolver o usuário (ou um erro). */
export function mockMe(user: User | ApiError) {
  const spy = vi.spyOn(api.auth, 'me');
  if (user instanceof ApiError) spy.mockRejectedValue(user);
  else spy.mockResolvedValue(user);
  return spy;
}

/** Renderiza dentro de rotas e do provedor de login, como na aplicação. */
export function renderWithApp(ui: ReactElement, opts: { route?: string; path?: string } = {}) {
  const { route = '/', path = '*' } = opts;
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/" element={<p>página inicial</p>} />
          <Route path="/login" element={<p>página de login</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}
