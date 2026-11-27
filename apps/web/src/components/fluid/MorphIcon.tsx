import { MorphPath } from '@usefluid/motion/react';
import { MORPH_ICONS, type MorphIconName } from './morphIcons';

/**
 * Ícone que muda de desenho com mola (Fluid): trocar `name` transforma o contorno de um no outro.
 * Decorativo: o nome do botão é quem diz o estado para leitores de tela.
 */
export function MorphIcon({ name, size = '1.35rem' }: { name: MorphIconName; size?: string }) {
  return (
    <svg
      viewBox="0 0 120 120"
      aria-hidden="true"
      className="morph-icon"
      style={{ width: size, height: size }}
    >
      <MorphPath
        d={MORPH_ICONS[name]}
        fill="currentColor"
        config={{ w: 20, z: 0.76, points: 96 }}
      />
    </svg>
  );
}
