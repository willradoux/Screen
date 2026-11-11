import { useSyncExternalStore } from 'react';

/**
 * Como VOCÊ ouve a sala (só no seu navegador; ninguém mais é afetado e nada passa pelo
 * servidor):
 *  - `deafened`: som da sala desligado (você não ouve ninguém). Vale só nesta visita.
 *  - `volumes`: volume de cada pessoa, de 0 a 2 (até 200%). Fica salvo neste navegador.
 *  - `muted`: pessoas silenciadas só para você. Fica salvo neste navegador.
 */
export interface AudioPrefs {
  deafened: boolean;
  volumes: Record<string, number>;
  muted: Record<string, boolean>;
}

export const MAX_VOLUME = 2;

const KEY = 'screem-audio';
const listeners = new Set<() => void>();
let cache: AudioPrefs | null = null;

function read(): AudioPrefs {
  if (cache) return cache;
  let saved: Partial<AudioPrefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<AudioPrefs>;
  } catch {
    saved = {};
  }
  const volumes: Record<string, number> = {};
  for (const [id, v] of Object.entries(saved.volumes ?? {})) {
    if (typeof v === 'number' && Number.isFinite(v)) volumes[id] = clampVolume(v);
  }
  const muted: Record<string, boolean> = {};
  for (const [id, m] of Object.entries(saved.muted ?? {})) if (m === true) muted[id] = true;
  cache = { deafened: false, volumes, muted };
  return cache;
}

function write(next: AudioPrefs) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify({ volumes: next.volumes, muted: next.muted }));
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
  listeners.forEach((fn) => fn());
}

export const clampVolume = (v: number) => Math.min(MAX_VOLUME, Math.max(0, v));

export function setDeafened(deafened: boolean): void {
  write({ ...read(), deafened });
}

export function setVolume(identity: string, volume: number): void {
  const prefs = read();
  const volumes = { ...prefs.volumes };
  const v = clampVolume(volume);
  if (Math.abs(v - 1) < 0.01) delete volumes[identity];
  else volumes[identity] = v;
  write({ ...prefs, volumes });
}

export function setMutedForMe(identity: string, muted: boolean): void {
  const prefs = read();
  const next = { ...prefs.muted };
  if (muted) next[identity] = true;
  else delete next[identity];
  write({ ...prefs, muted: next });
}

/** O volume que de fato toca para essa pessoa (0 se silenciada ou com o som da sala desligado). */
export function effectiveVolume(prefs: AudioPrefs, identity: string): number {
  if (prefs.deafened || prefs.muted[identity]) return 0;
  return prefs.volumes[identity] ?? 1;
}

export function useAudioPrefs(): AudioPrefs {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    read,
    read,
  );
}

/** Só para testes: esquece o que foi lido. */
export function resetAudioPrefsCache(): void {
  cache = null;
}
