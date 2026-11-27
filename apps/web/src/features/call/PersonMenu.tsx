import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../../shared/ui/Icon';
import { Avatar } from '../../shared/ui/ui';
import { PersonAudio } from './PersonAudio';

export interface PersonMenuAction {
  icon: IconName;
  label: string;
  onSelect: () => void;
}

/**
 * Menu de uma pessoa no palco (como o do Discord): abre onde a pessoa clicou, com o volume e o
 * mudo só para você e as ações do quadro (fixar, maximizar, tela cheia). Fecha com Esc, clique
 * fora ou ao escolher uma ação; o foco volta para onde estava.
 */
export function PersonMenu({
  at,
  name,
  avatarUrl,
  role,
  identity,
  sharing,
  actions,
  onClose,
}: {
  at: { x: number; y: number };
  name: string;
  avatarUrl?: string | null | undefined;
  role?: string | undefined;
  identity: string;
  sharing?: boolean | undefined;
  actions: PersonMenuAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(at);

  // Cabe na tela: se passar da borda, encosta do lado de dentro.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      x: Math.max(pad, Math.min(at.x, window.innerWidth - r.width - pad)),
      y: Math.max(pad, Math.min(at.y, window.innerHeight - r.height - pad)),
    });
  }, [at]);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
      before?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label={`Opções de ${name}`}
      className="person-pop"
      style={{ left: pos.x, top: pos.y }}
    >
      <div className="person-pop-head">
        <Avatar name={name} url={avatarUrl ?? null} size="sm" />
        <span className="min-w-0">
          <span className="person-pop-name">{name}</span>
          {role && <span className="person-pop-role">{role}</span>}
        </span>
      </div>
      <p className="person-pop-section">Só pra você</p>
      <PersonAudio id={identity} name={name} sharing={sharing} />
      {actions.length > 0 && <hr className="person-pop-sep" />}
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          className="person-pop-item"
          onClick={() => {
            a.onSelect();
            onClose();
          }}
        >
          <Icon name={a.icon} size="1.05rem" />
          <span>{a.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
