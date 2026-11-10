import { Creature } from './Creature';

/**
 * Carregando: o bichinho (o badge do Screen piscando o olho) e o que está acontecendo, em
 * texto curto. `label` também vai para leitores de tela.
 */
export function Loader({ label = 'Carregando' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="loader ink flex min-h-[40dvh] flex-col items-center justify-center gap-3"
    >
      <Creature className="h-12" />
      <p aria-hidden="true" className="ink-soft text-[13px] font-medium">
        {label.endsWith('…') ? label : `${label}…`}
      </p>
    </div>
  );
}
