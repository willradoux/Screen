import type { LocalVideoTrack } from 'livekit-client';

/** Fundos de imagem prontos (arquivos em /backgrounds). */
export const BACKGROUND_IMAGES = [
  { id: 'azul', label: 'Azul', url: '/backgrounds/azul.jpg' },
  { id: 'noite', label: 'Noite', url: '/backgrounds/noite.jpg' },
  { id: 'claro', label: 'Claro', url: '/backgrounds/claro.jpg' },
] as const;

export type BackgroundChoice = { kind: 'none' } | { kind: 'blur' } | { kind: 'image'; url: string };

// A biblioteca de recorte é grande: só é carregada quando alguém usa o efeito.
const load = () => import('@livekit/track-processors');

/** O navegador consegue recortar o fundo? (precisa de WebAssembly e de vídeo processável) */
export async function backgroundSupported(): Promise<boolean> {
  try {
    return (await load()).supportsBackgroundProcessors();
  } catch {
    return false;
  }
}

/**
 * Aplica (ou tira) o efeito de fundo na câmera. Os arquivos do modelo e do WebAssembly saem do
 * próprio site (/mediapipe), então nada é baixado de terceiros.
 */
export async function applyBackground(
  track: LocalVideoTrack,
  choice: BackgroundChoice,
): Promise<void> {
  if (choice.kind === 'none') {
    await track.stopProcessor();
    return;
  }
  const mod = await load();
  const mode =
    choice.kind === 'blur'
      ? ({ mode: 'background-blur', blurRadius: 12 } as const)
      : ({ mode: 'virtual-background', imagePath: choice.url } as const);
  const processor = mod.BackgroundProcessor({
    ...mode,
    assetPaths: {
      tasksVisionFileSet: '/mediapipe',
      modelAssetPath: '/mediapipe/selfie_segmenter.tflite',
    },
  });
  await track.setProcessor(processor);
}
