/**
 * Endereços do app. No mesmo domínio: `/` é a LP (container próprio), `/dashboard` é a lista de
 * salas (o início de quem está logado) e `/call/<sala>` é a chamada. O link antigo `/r/<sala>`
 * (que o bot mandava) continua funcionando: redireciona para `/call/<sala>`.
 */
export const HOME = '/dashboard';

/** Endereço da chamada de uma sala. */
export const roomPath = (roomId: string) => `/call/${roomId}`;

/** É o endereço de uma chamada (o novo ou o antigo)? */
export const isRoomPath = (path: string) => path.startsWith('/call/') || path.startsWith('/r/');
