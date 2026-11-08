import { TokenVerifier } from 'livekit-server-sdk';
import { describe, expect, it } from 'vitest';
import {
  ALL_SOURCES,
  InvalidWebhookError,
  LiveKitUnavailableError,
  createLiveKitGateway,
  signWebhookBody,
} from '../../src/modules/livekit/livekit.gateway.js';

const KEY = 'devkey';
const SECRET = 'devsecret-devsecret-devsecret-0123';
const gateway = createLiveKitGateway({
  LIVEKIT_URL: 'http://127.0.0.1:1', // nada escuta aqui
  LIVEKIT_API_KEY: KEY,
  LIVEKIT_API_SECRET: SECRET,
});

describe('createToken (SDK real)', () => {
  const base = {
    roomName: 'kF3x9QzP2mT7vB1nLw0aYc',
    identity: '123456789012345678',
    name: 'Fulano',
    metadata: JSON.stringify({ role: 'MEMBER', avatarUrl: null }),
    canPublish: true,
    canPublishSources: ALL_SOURCES,
    roomAdmin: false,
    ttlSeconds: 600,
  };

  it('emite um JWT válido, assinado, com identidade, sala e permissões', async () => {
    const jwt = await gateway.createToken(base);
    const claims = await new TokenVerifier(KEY, SECRET).verify(jwt);

    expect(claims.sub).toBe(base.identity);
    expect(claims.name).toBe('Fulano');
    expect(JSON.parse(claims.metadata!)).toEqual({ role: 'MEMBER', avatarUrl: null });
    expect(claims.video).toMatchObject({
      room: base.roomName,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: false,
      roomAdmin: false,
    });
    expect(claims.video?.canPublishSources).toHaveLength(4);
  });

  it('expira em ttlSeconds', async () => {
    const jwt = await gateway.createToken({ ...base, ttlSeconds: 90 });
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());
    expect(payload.exp - payload.nbf).toBeGreaterThanOrEqual(89);
    expect(payload.exp - payload.nbf).toBeLessThanOrEqual(91);
  });

  it('sem permissão de publicar: canPublish falso e nenhuma fonte', async () => {
    const jwt = await gateway.createToken({ ...base, canPublish: false, canPublishSources: [] });
    const claims = await new TokenVerifier(KEY, SECRET).verify(jwt);
    expect(claims.video?.canPublish).toBe(false);
    expect(claims.video?.canPublishSources ?? []).toHaveLength(0);
  });

  it('só as fontes permitidas entram no token', async () => {
    const jwt = await gateway.createToken({ ...base, canPublishSources: ['microphone'] });
    const claims = await new TokenVerifier(KEY, SECRET).verify(jwt);
    expect(claims.video?.canPublishSources).toHaveLength(1);
  });

  it('roomAdmin só quando pedido', async () => {
    const jwt = await gateway.createToken({ ...base, roomAdmin: true });
    expect((await new TokenVerifier(KEY, SECRET).verify(jwt)).video?.roomAdmin).toBe(true);
  });

  it('o token não é aceito com outro segredo', async () => {
    const jwt = await gateway.createToken(base);
    await expect(
      new TokenVerifier(KEY, 'outro-segredo-outro-segredo-0123456').verify(jwt),
    ).rejects.toThrow();
  });
});

describe('verifyWebhook (SDK real)', () => {
  const body = JSON.stringify({
    event: 'participant_joined',
    room: { name: 'kF3x9QzP2mT7vB1nLw0aYc' },
    participant: { identity: '1', name: 'Fulano', metadata: '{"role":"MEMBER"}' },
  });

  it('aceita corpo com assinatura válida', async () => {
    const auth = await signWebhookBody(body, KEY, SECRET);
    const event = await gateway.verifyWebhook(body, auth);
    expect(event).toMatchObject({
      event: 'participant_joined',
      roomName: 'kF3x9QzP2mT7vB1nLw0aYc',
      participant: { identity: '1', name: 'Fulano', metadata: '{"role":"MEMBER"}' },
    });
  });

  it('rejeita corpo adulterado, segredo errado e cabeçalho ausente', async () => {
    const auth = await signWebhookBody(body, KEY, SECRET);
    await expect(
      gateway.verifyWebhook(body.replace('Fulano', 'Beltrano'), auth),
    ).rejects.toBeInstanceOf(InvalidWebhookError);

    const forged = await signWebhookBody(body, KEY, 'segredo-errado-segredo-errado-0123456');
    await expect(gateway.verifyWebhook(body, forged)).rejects.toBeInstanceOf(InvalidWebhookError);

    await expect(gateway.verifyWebhook(body, undefined)).rejects.toBeInstanceOf(
      InvalidWebhookError,
    );
    await expect(gateway.verifyWebhook(body, 'lixo')).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it('classifica o motivo da saída', async () => {
    const left = async (reason: string) => {
      const b = JSON.stringify({
        event: 'participant_left',
        room: { name: 'r' },
        participant: { identity: '1', disconnectReason: reason },
      });
      return (await gateway.verifyWebhook(b, await signWebhookBody(b, KEY, SECRET))).participant!
        .leaveCause;
    };
    expect(await left('CLIENT_INITIATED')).toBe('client');
    expect(await left('DUPLICATE_IDENTITY')).toBe('duplicate');
    expect(await left('SERVER_SHUTDOWN')).toBe('other');
  });

  it('evento sem sala nem participante vira nulos', async () => {
    const b = JSON.stringify({ event: 'egress_started' });
    const event = await gateway.verifyWebhook(b, await signWebhookBody(b, KEY, SECRET));
    expect(event).toEqual({ event: 'egress_started', roomName: null, participant: null });
  });
});

describe('falhas de rede', () => {
  it('servidor inacessível vira LiveKitUnavailableError', async () => {
    await expect(gateway.ensureRoom('r', 10)).rejects.toBeInstanceOf(LiveKitUnavailableError);
    await expect(gateway.removeParticipant('r', '1')).rejects.toBeInstanceOf(
      LiveKitUnavailableError,
    );
    await expect(gateway.deleteRoom('r')).rejects.toBeInstanceOf(LiveKitUnavailableError);
  });
});
