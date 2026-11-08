# Screem

Plataforma open-source de transmissão de tela, câmera e microfone para o servidor Discord **Acelera DEV**. Também hospeda as reuniões mensais do servidor, no lugar do Meet.

Quando alguém entra num canal de voz da categoria de lives, o bot envia um embed com botão que abre a sala. Só entra quem está na call.

## Stack

React + TypeScript + Vite + Tailwind (frontend, Vercel) · Node.js + TypeScript + Express + Socket.IO (backend, Docker na VPS) · MongoDB · Discord OAuth2 · WebRTC com LiveKit · Coturn.

## Documentação

Tudo está em [`docs/`](docs/README.md): visão geral, arquitetura, roadmap e, principalmente, a documentação do [backend](docs/backend/README.md), que é o contrato para qualquer frontend.

## Status

Fases 0 a 8 do [roadmap](docs/03-roadmap.md) implementadas (backend completo e primeira versão do frontend). Falta publicar, testar com dispositivos reais e a Fase 9 (qualidade e endurecimento).
