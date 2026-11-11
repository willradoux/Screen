import { jsx as _jsx } from "react/jsx-runtime";
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './styles/v3.css';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
// Service worker: deixa o site instalável como app e abrir rápido (só em produção).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    });
}
const container = document.getElementById('root');
if (!container)
    throw new Error('Elemento #root não encontrado');
createRoot(container).render(_jsx(StrictMode, { children: _jsx(BrowserRouter, { children: _jsx(AuthProvider, { children: _jsx(App, {}) }) }) }));
