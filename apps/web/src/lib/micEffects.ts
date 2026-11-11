import type { LocalAudioTrack } from 'livekit-client';
import { createVoiceProcessor, type GateLevel, type VoicePreset } from './voiceEffects';

/**
 * Efeitos do seu microfone (saem para a sala): redução de ruído do navegador (liga/desliga),
 * filtro de barulho (nível) e efeito de voz. Ficam salvos neste navegador e voltam quando o
 * microfone é religado. O microfone aceita um processador só: filtro + efeito andam juntos.
 */
export interface MicPrefs {
  /** Redução de ruído, isolamento de voz e cancelamento de eco do navegador. */
  suppression: boolean;
  gate: GateLevel;
  voice: VoicePreset;
}

const KEY = 'screem-mic';
const DEFAULTS: MicPrefs = { suppression: true, gate: 'off', voice: 'none' };
let state: MicPrefs = read();

function read(): MicPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}') as Partial<MicPrefs>;
    return {
      suppression: typeof v.suppression === 'boolean' ? v.suppression : DEFAULTS.suppression,
      gate: (['off', 'leve', 'medio', 'forte'] as const).includes(v.gate as GateLevel)
        ? (v.gate as GateLevel)
        : DEFAULTS.gate,
      // O efeito de voz é da visita (não fica salvo: ninguém quer entrar de robô sem querer).
      voice: 'none',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export const micPrefs = (): MicPrefs => state;

/** Guarda a escolha sem microfone ligado (vale quando ligar). */
export function saveMicPrefs(next: Partial<MicPrefs>): void {
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify({ suppression: state.suppression, gate: state.gate }));
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }
}

/** Aplica no microfone o que estiver escolhido (e guarda a escolha). */
export async function applyMicEffects(
  track: LocalAudioTrack,
  next: Partial<MicPrefs> = {},
): Promise<void> {
  const before = state;
  state = { ...state, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify({ suppression: state.suppression, gate: state.gate }));
  } catch {
    // Sem armazenamento: vale só nesta visita.
  }

  // Redução de ruído do navegador: precisa reabrir o microfone com a opção nova.
  const constraints = track.mediaStreamTrack.getSettings() as MediaTrackSettings & {
    voiceIsolation?: boolean;
  };
  if (
    next.suppression !== undefined &&
    (next.suppression !== before.suppression || constraints.noiseSuppression !== state.suppression)
  ) {
    await track.restartTrack({
      noiseSuppression: state.suppression,
      echoCancellation: true,
      autoGainControl: true,
      voiceIsolation: state.suppression,
    } as Parameters<LocalAudioTrack['restartTrack']>[0]);
  }

  if (state.voice === 'none' && state.gate === 'off') {
    if (track.getProcessor()) await track.stopProcessor();
    return;
  }
  await track.setProcessor(createVoiceProcessor(state.voice, state.gate));
}
