/**
 * O que está fixado no palco (só na tela de quem fixou, ou para todos quando é o destaque do
 * admin):
 *  - `"{identity}"`     → a tela da pessoa, se ela compartilha; senão a câmera (é o formato do
 *    destaque do admin, `spotlightId`);
 *  - `"cam:{identity}"` → a câmera da pessoa, mesmo que ela compartilhe a tela.
 */
export const cameraPin = (identity: string) => `cam:${identity}`;
export const screenPin = (identity: string) => identity;

export function parsePin(pin: string | null | undefined): {
  identity: string;
  camera: boolean;
} | null {
  if (!pin) return null;
  return pin.startsWith('cam:')
    ? { identity: pin.slice(4), camera: true }
    : { identity: pin, camera: false };
}
