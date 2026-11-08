import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Token aleatório, URL-safe. Padrão: 256 bits. */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('base64url');

/** AES-256-GCM. Formato: iv.tag.ciphertext (base64url). */
export function encrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string, key: Buffer): string {
  const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
  if (!iv || !tag || !data || iv.length !== 12 || tag.length !== 16) {
    throw new Error('Payload criptografado inválido');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Assina um valor com HMAC-SHA256: `valor.assinatura`. */
export function sign(value: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(value).digest('base64url');
  return `${value}.${sig}`;
}

/** Devolve o valor se a assinatura for válida; senão `null`. */
export function unsign(signed: string, secret: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const expected = Buffer.from(sign(value, secret).slice(idx + 1));
  const given = Buffer.from(signed.slice(idx + 1));
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return value;
}
