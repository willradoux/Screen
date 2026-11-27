import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './styles/v3.css';
import './styles/premium.css';
import { LandingPage } from './features/landing/LandingPage';

/*
 * A LP separada (landing.html): só a TV, sem o roteador, o login nem o resto do app. Vira o
 * container `landing`, no subdomínio próprio; os botões levam para o app (VITE_APP_URL).
 */

const container = document.getElementById('root');
if (!container) throw new Error('Elemento #root não encontrado');

createRoot(container).render(
  <StrictMode>
    <LandingPage />
  </StrictMode>,
);
