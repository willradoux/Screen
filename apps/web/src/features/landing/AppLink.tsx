import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { APP_URL, LP_STANDALONE } from '../../shared/lib/config';

/**
 * Link da LP para uma tela do app. Dentro do app é um `Link` do roteador; na LP separada (outro
 * subdomínio, sem roteador) vira um link comum para o endereço do app.
 */
export function AppLink({
  to,
  className,
  children,
}: {
  to: string;
  className?: string;
  children: ReactNode;
}) {
  if (LP_STANDALONE) {
    return (
      <a href={`${APP_URL}${to}`} className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  );
}
