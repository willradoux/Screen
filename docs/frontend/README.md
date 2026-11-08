# Frontend

Stack inicial: React, TypeScript, Vite, Tailwind CSS, hospedado na Vercel. **Este frontend é descartável**: o contrato com o backend está em [../backend/](../backend/README.md), e qualquer novo frontend (outro framework, app nativo) pode substituí-lo.

## Contrato mínimo que todo frontend precisa cumprir

1. **Login**: redirecionar o navegador para `GET {API}/auth/discord?redirect=/r/<id>`. Após o retorno, chamar `GET /auth/me`. Todas as chamadas com `credentials: 'include'`.
2. **Rota de sala `/r/:roomId`** (os embeds do bot apontam para ela). Fluxo:
   1. `GET /auth/me` -> se `401`, iniciar login.
   2. `GET /rooms/:id/access` -> decidir a tela (`canJoin`, `reason`).
   3. `POST /rooms/:id/join` -> receber `livekit.url` e `livekit.token`.
   4. Conectar no LiveKit com `livekit-client` e abrir o socket (`room:subscribe`).
3. **Tratar eventos** `room:ended`, `moderation:action`, `voice:warning` e `participant:*` ([eventos-socketio.md](../backend/eventos-socketio.md)).
4. **Decidir por `error.code`**, nunca por texto ([erros.md](../backend/erros.md)).
5. **Rota `/login`** que mostra `?error=<CODE>` (ex.: `NOT_IN_GUILD`).

## Telas necessárias

| Tela | Rota sugerida | Dados |
|---|---|---|
| Login | `/login` | - |
| Sala | `/r/:roomId` | `access`, `join`, LiveKit, Socket.IO |
| Lista de salas | `/` | `GET /rooms` |
| Reuniões | `/reunioes` | `GET /meetings` |
| Admin: reuniões | `/admin/reunioes` | CRUD `/meetings` (ADMIN) |
| Admin: configurações | `/admin/config` | `/settings` (ADMIN) |
| Admin: auditoria | `/admin/auditoria` | `/audit` (ADMIN) |

## Estados da tela de sala

| Situação | Origem | O que mostrar |
|---|---|---|
| Não logado | `401` | Botão "Entrar com Discord" |
| Fora da guilda | `NOT_IN_GUILD` | Convite para o servidor |
| Fora da call | `access.reason = NOT_IN_VOICE` | Instrução: entre no canal `voiceChannelName`; recheque a cada 5 s |
| Reunião não começou | `ROOM_NOT_OPEN` + `startsAt` | Contagem regressiva |
| Sala lotada / banido / sem cargo | códigos correspondentes | Mensagem clara |
| Conectado | `join` ok | Grid, controles, chat |
| Removido | `moderation:action` KICKED/BANNED | Mensagem com motivo |
| Encerrada | `room:ended` | Resumo e botão de voltar |
| Aviso de saída da call | `voice:warning` | Contagem de `secondsLeft` |

## Controles esperados

- Ligar/desligar microfone, câmera e compartilhamento de tela.
- Seleção de dispositivos; teste de microfone antes de entrar.
- Indicador de quem está falando.
- Destaque automático de quem compartilha tela.
- Painel de moderação (visível se `permissions.canModerate`): mutar, expulsar, banir, promover.
- Chat da sala.

## Configuração do LiveKit no cliente

```ts
const room = new Room({
  adaptiveStream: true,
  dynacast: true,
  publishDefaults: { simulcast: true, videoCodec: 'vp8', red: true, dtx: true },
  videoCaptureDefaults: { resolution: VideoPresets.h720.resolution },
});
await room.connect(data.livekit.url, data.livekit.token);
```

Mais detalhes em [livekit-webrtc.md](../backend/livekit-webrtc.md#qualidade-e-capacidade).

## Variáveis (Vite)

`VITE_API_URL`, `VITE_SOCKET_URL`. Veja [variaveis-de-ambiente.md](../backend/variaveis-de-ambiente.md).

## Deploy na Vercel

- Framework preset: Vite. Build `npm run build -w apps/web`, saída `apps/web/dist`.
- Reescrita SPA: todas as rotas -> `index.html` (`vercel.json`).
- Domínio: `app.exemplo.com` (mesmo site do backend, para o cookie).
- Cabeçalhos de segurança (CSP) conforme [seguranca.md](../backend/seguranca.md#cabeçalhos-http).

## Trocando o frontend

1. Leia o contrato acima e a [API REST](../backend/api-rest.md).
2. Implemente login, rota `/r/:roomId` e os eventos.
3. Aponte o domínio ou ajuste `WEB_URL` no backend (muda CORS e os links dos embeds).
4. Nada mais muda no backend.

## Checklist de paridade

- [ ] Login e logout
- [ ] Rota `/r/:roomId` com todos os estados
- [ ] Publicar câmera, tela e microfone
- [ ] Assistir e grid
- [ ] Reconexão (Socket.IO e LiveKit)
- [ ] Moderação
- [ ] Telas de admin
- [ ] Tratamento de todos os `error.code` relevantes
