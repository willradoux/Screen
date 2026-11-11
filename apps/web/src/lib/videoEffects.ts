import type { LocalVideoTrack } from 'livekit-client';

/** Fundos de imagem prontos (arquivos em /backgrounds). */
export const BACKGROUND_IMAGES = [
  { id: 'azul', label: 'Azul', url: '/backgrounds/azul.jpg' },
  { id: 'noite', label: 'Noite', url: '/backgrounds/noite.jpg' },
  { id: 'claro', label: 'Claro', url: '/backgrounds/claro.jpg' },
] as const;

export type BackgroundChoice = { kind: 'none' } | { kind: 'blur' } | { kind: 'image'; url: string };

// A biblioteca de processamento é grande: só é carregada quando alguém usa um efeito.
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
 * Efeitos da câmera que saem para todo mundo: o fundo (desfoque ou imagem) e o espelho. A
 * câmera só aceita um processador por vez, então os dois andam juntos: com espelho, cada
 * quadro é virado antes (e o fundo é recortado já virado).
 */
const state: { background: BackgroundChoice; mirror: boolean } = {
  background: { kind: 'none' },
  mirror: false,
};

export const currentBackground = () => state.background;

/** Vira um quadro na horizontal (o original é liberado). */
function makeFlipper() {
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  return (frame: VideoFrame): VideoFrame => {
    const w = frame.displayWidth;
    const h = frame.displayHeight;
    if (!canvas || canvas.width !== w || canvas.height !== h) {
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext('2d');
    }
    if (!ctx) return frame;
    ctx.setTransform(-1, 0, 0, 1, w, 0);
    ctx.drawImage(frame, 0, 0, w, h);
    const flipped = new VideoFrame(canvas, {
      timestamp: frame.timestamp,
      ...(frame.duration !== null ? { duration: frame.duration } : {}),
    });
    frame.close();
    return flipped;
  };
}

const ASSETS = {
  tasksVisionFileSet: '/mediapipe',
  modelAssetPath: '/mediapipe/selfie_segmenter.tflite',
};

/**
 * Aplica na câmera o que estiver escolhido (fundo + espelho). Os arquivos do modelo e do
 * WebAssembly saem do próprio site (/mediapipe), então nada é baixado de terceiros.
 */
export async function applyCameraEffects(
  track: LocalVideoTrack,
  next: Partial<{ background: BackgroundChoice; mirror: boolean }> = {},
): Promise<void> {
  if (next.background) state.background = next.background;
  if (next.mirror !== undefined) state.mirror = next.mirror;
  const { background, mirror } = state;

  if (background.kind === 'none' && !mirror) {
    if (track.getProcessor()) await track.stopProcessor();
    return;
  }

  const mod = await load();

  // Só o fundo, sem espelho: o processador pronto da biblioteca (como antes).
  if (!mirror) {
    const mode =
      background.kind === 'blur'
        ? ({ mode: 'background-blur', blurRadius: 12 } as const)
        : ({ mode: 'virtual-background', imagePath: (background as { url: string }).url } as const);
    await track.setProcessor(mod.BackgroundProcessor({ ...mode, assetPaths: ASSETS }));
    return;
  }

  const flip = makeFlipper();

  // Espelho (com ou sem fundo): os mesmos transformadores da biblioteca, com o quadro virado.
  if (background.kind === 'none') {
    class MirrorTransformer extends mod.VideoTransformer<Record<string, never>> {
      transform(frame: VideoFrame, controller: TransformStreamDefaultController<VideoFrame>) {
        controller.enqueue(flip(frame));
      }
      update() {}
    }
    await track.setProcessor(
      new mod.ProcessorWrapper(new MirrorTransformer(), 'espelho', { maxFps: 60 }),
    );
    return;
  }

  class MirroredBackground extends mod.BackgroundTransformer {
    override transform(
      frame: VideoFrame,
      controller: TransformStreamDefaultController<VideoFrame>,
    ) {
      return super.transform(flip(frame), controller);
    }
  }
  const transformer = new MirroredBackground({
    ...(background.kind === 'blur' ? { blurRadius: 12 } : { imagePath: background.url }),
    assetPaths: ASSETS,
  });
  await track.setProcessor(
    new mod.ProcessorWrapper(transformer, 'fundo-espelhado', { maxFps: 60 }),
  );
}

/** Compatível com quem já chamava só para o fundo. */
export const applyBackground = (track: LocalVideoTrack, choice: BackgroundChoice) =>
  applyCameraEffects(track, { background: choice });
