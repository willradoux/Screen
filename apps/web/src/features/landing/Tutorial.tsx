import { useEffect, type CSSProperties } from 'react';
import { Icon, type IconName } from '../../shared/ui/Icon';

const TUTORIAL_KEY = 'screen-lp-tutorial';

export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === 'ok';
  } catch {
    return false;
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(TUTORIAL_KEY, 'ok');
  } catch {
    // sem armazenamento: só mostra de novo na próxima
  }
}

const TIPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'tune',
    title: 'Gire a rodinha',
    text: 'Arraste a rodinha da TV (ou use ▲ ▼ do lado) para trocar de canal.',
  },
  {
    icon: 'keyboard_arrow_down',
    title: 'Ou só role',
    text: 'A rodinha do mouse, as setas do teclado e arrastar o dedo no celular também trocam.',
  },
  {
    icon: 'volume_up',
    title: 'Som na própria TV',
    text: 'VOL − e + mudam o volume; o botão SOM liga e desliga a música.',
  },
  {
    icon: 'arrow_forward',
    title: 'Quando quiser entrar',
    text: 'É só clicar em Entrar com o Discord, no canal 1 ou no topo.',
  },
];

/** Tutorial curtinho: como mexer na TV. Fecha com o botão, com Esc ou clicando fora. */
export function Tutorial({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="tut"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tut-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="tut-card">
        <p className="tut-kicker">COMO USAR</p>
        <h2 id="tut-title" className="tut-title">
          É uma TV. Troca de canal.
        </h2>
        <ol className="tut-list">
          {TIPS.map((t, i) => (
            <li key={t.title} style={{ '--d': `${0.08 + i * 0.07}s` } as CSSProperties}>
              <span className="tut-icon">
                <Icon name={t.icon} size="1.1rem" />
              </span>
              <span>
                <strong>{t.title}</strong>
                <span>{t.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <button type="button" className="lp-btn lp-btn-main tut-ok" autoFocus onClick={onClose}>
          Bora
        </button>
      </div>
    </div>
  );
}
