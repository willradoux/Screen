import { Wordmark } from './Wordmark';

/**
 * Tela de carregamento: a marca no centro e uma barra fina que corre. Sem círculo girando, sem texto
 * piscando. `label` vai para leitores de tela.
 */
export function Loader({ label = 'Carregando' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="flex min-h-[60dvh] flex-col items-center justify-center gap-6"
    >
      <Wordmark size="lg" />
      <div className="loader-bar h-0.5 w-40 overflow-hidden rounded-full bg-zinc-800" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
