# 03 - Roadmap

Legenda: `[ ]` pendente, `[x]` concluído. Cada fase termina com **critérios de aceite** verificáveis.

## Fase 0 - Fundação

- [x] Repositório limpo, histórico reiniciado.
- [x] Documentação inicial (este diretório).
- [x] Monorepo com `apps/api`, `apps/web`, `packages/shared` (npm workspaces).
- [x] TypeScript, ESLint, Prettier, EditorConfig.
- [x] CI no GitHub Actions: lint, typecheck, testes, build.
- [ ] Commits convencionais e hooks (husky + commitlint).
- [x] `.env.example` (cresce a cada fase).

**Aceite:** `npm ci && npm run lint && npm run typecheck && npm test && npm run build` passa em CI.

## Fase 1 - Infra local e de produção

- [x] `infra/docker-compose.yml` com MongoDB, LiveKit, Coturn, API e Caddy.
- [x] Config do LiveKit e do Coturn (inline no compose, com segredos via `.env`).
- [x] Reverse proxy Caddy com TLS automático para `api.` e `live.`.
- [x] Firewall: `infra/scripts/ufw.sh` (80/443, 7881/tcp, 7882/udp, 3478, relay 49152-49252).
- [ ] Documento de deploy testado em VPS limpa (escrito, falta testar na VPS).

**Aceite:** `docker compose up` sobe tudo e o endpoint `GET /health` responde 200.

## Fase 2 - Backend base

- [x] Express com helmet, CORS restrito, rate limit, logger (pino).
- [x] Config tipada e validada com zod.
- [x] Conexão MongoDB (mongoose) com falha rápida na inicialização e encerramento limpo. Os índices entram junto com cada model, nas fases seguintes.
- [x] Tratamento de erros padronizado ([erros.md](backend/erros.md)).
- [x] Healthcheck (`/health`) e readiness (`/ready`, com ping no Mongo).
- [x] OpenAPI servida em `/api/v1/docs` e `/api/v1/openapi.json`, com teste de contrato.

**Aceite:** testes de integração do esqueleto passam; OpenAPI publicada.

## Fase 3 - Autenticação

- [x] Fluxo Discord OAuth2 com `state` de uso único (PKCE dispensado: fluxo confidencial).
- [x] Sessão por cookie, expiração deslizante (7 dias) e limite absoluto (30 dias).
- [x] `GET /auth/me`, `POST /auth/logout`.
- [x] Verificação de participação na guilda (no login e a cada revalidação).
- [x] Cálculo de papel a partir dos cargos (dono/permissões do Discord entram com o bot, Fase 4).

**Aceite:** usuário fora da guilda recebe `403 NOT_IN_GUILD`; usuário da guilda recebe sessão e papel correto.

## Fase 4 - Bot do Discord

- [x] Login do bot, intents (`Guilds`, `GuildVoiceStates`, `GuildMembers`).
- [x] Cache de voice states e reconciliação ao iniciar e ao retomar o gateway.
- [x] Detecção de entrada/saída na categoria de lives (sala por canal, uma só mesmo com eventos simultâneos).
- [x] Embed com botão (link da sala), atualização com limite de taxa e reenvio se a mensagem for apagada.
- [x] Slash commands: `/config` e `/reuniao criar|agendar|cancelar|encerrar|listar` (`reagendar` e `/sala` ficam para as Fases 5 a 7).
- [x] Reconexão e tolerância a falhas (bot reinicia sem duplicar embeds; canal/cargo apagado limpa a configuração).

**Aceite:** entrar no canal de voz gera exatamente um embed; reiniciar o bot não duplica.

## Fase 5 - Salas e LiveKit

- [x] Modelo de sala (live e reunião) e máquina de estados (`SCHEDULED → OPEN → ENDED`, `SCHEDULED → CANCELED`, transições condicionais no banco).
- [x] `POST /rooms/:id/join` com validação de presença, cargo, banimento e lotação (mais `GET /rooms`, `/rooms/:id`, `/rooms/:id/access`, `/leave` e `/end`).
- [x] Emissão de token LiveKit com grants por papel, modo palestra e silenciamento.
- [x] Webhooks do LiveKit com assinatura verificada (entrou, saiu, sala finalizada; track publicada é aceita e ignorada).
- [x] Remoção automática de quem sai da call (`voice:warning`, tolerância de 30 s, `voice:restored`).
- [x] Encerramento de sala e limpeza (LiveKit, participações, embed, sockets).
- [x] Servidor Socket.IO com autenticação, `room:subscribe` e os eventos de sala (adiantado da Fase 6; chat e presença ficam para depois).

**Aceite:** fora da call, `join` retorna `403 NOT_IN_VOICE`; dentro, retorna token funcional.

## Fase 6 - Moderação e administração

- [x] Mutar áudio, vídeo e tela de um participante (por fonte, acumulativo, persiste se a pessoa sair e voltar).
- [x] Expulsar e banir da sala (60 min por padrão, até 24 h; sem prazo só ADMIN) e desbanir.
- [x] Bloquear publicação para todos (modo palestra), aplicado na hora a quem já está conectado.
- [x] Promover e rebaixar palestrantes.
- [x] Alterar configurações da guilda pela API (`GET`/`PATCH /settings`, com validação contra o Discord) e editar a sala (`PATCH /rooms/:id`).
- [x] Auditoria de todas as ações de moderação e administração (API e comandos do bot) e `GET /audit` com filtros e paginação.

**Aceite:** ações exigem papel adequado; cada ação gera registro de auditoria.

## Fase 7 - Reuniões

- [x] Criação imediata e agendada, com título e descrição (comando `/reuniao` e `POST /meetings`, mesmo serviço).
- [x] Aviso no canal de avisos com embed e botão.
- [x] Lembretes programados (24 h, 1 h e 5 min por padrão, ou personalizados): envio atômico sem duplicar, nova tentativa se falhar, descarte dos atrasados.
- [x] Abertura automática no horário (e antes da hora, por `POST /meetings/:id/open`).
- [x] Lista de presença e resumo ao final (`GET /meetings/:id/report` e resumo no embed). Reunião vazia por 15 min é encerrada.
- [x] Reagendar (`/reuniao reagendar`, `PATCH /meetings/:id`) e cancelar.

**Aceite:** reunião agendada abre sozinha no horário e avisa no canal.

## Fase 8 - Frontend (primeira versão)

- [x] Login com Discord e tela de sala (`/r/:roomId`, o link do bot).
- [x] Controles: câmera, tela e microfone (seleção de dispositivos fica para depois; usa os padrões do navegador).
- [x] Grid de participantes, destaque de quem compartilha tela e de quem está falando.
- [x] Painel de moderação (silenciar, palestrante, expulsar, banir, modo palestra, encerrar).
- [x] Painel de reuniões (criar, agendar, reagendar, abrir, cancelar, relatório), configurações e auditoria.
- [x] Estados de erro (fora da call, sala encerrada, sem permissão, lotada, banido, removido, conexão perdida).
- [ ] Deploy na Vercel (configuração e instruções prontas em `docs/frontend/README.md`; falta publicar).

**Aceite:** fluxo completo UC1 a UC4 funciona em Chrome, Firefox e Safari.

## Fase 9 - Qualidade e endurecimento

- [x] Testes e2e do fluxo principal (`apps/api/test/db/e2e.test.ts`: MongoDB real, serviços reais; Discord/LiveKit falsos). Roteiro com o Discord e o LiveKit reais em `docs/infra/teste-real.md` (a executar).
- [ ] Testes de carga (25 participantes, 5 publicando): plano e comandos prontos em `docs/infra/teste-de-carga.md`; **falta executar** na VPS.
- [x] Revisão de segurança ([seguranca.md](backend/seguranca.md#revisão-de-segurança-fase-9)): 7 problemas corrigidos, riscos aceitos documentados.
- [x] Métricas Prometheus em porta interna e alertas prontos. Dashboards (Grafana) não foram criados.
- [ ] Backups do MongoDB: scripts prontos; **falta testar a restauração** (roteiro em `docs/infra/README.md`).
- [x] Documentação revisada (índice, testes, segurança, infra e frontend em dia).

**Aceite:** checklist de segurança fechado; piloto com a comunidade sem incidentes críticos.

## Fase 10 - Evoluções futuras

- Chat da sala com histórico.
- Gravação (LiveKit Egress).
- Levantar a mão, enquetes e reações.
- Múltiplas guildas.
- Notificações por DM.
- Troca completa do frontend (a documentação do contrato permite isso).

## Ordem de dependência

```
0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
          \________ 3 e 4 podem andar em paralelo após a Fase 2
```

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| VPS pequena não aguenta mídia | Alto | Medir no piloto, limitar publicadores, simulcast |
| TURN mal configurado | Alto | Testar atrás de NAT/4G, porta 443 TCP como fallback |
| Rate limit do Discord | Médio | Cache de voice states, evitar chamadas REST por request |
| Bot cai e perde estado | Médio | Reconciliação ao iniciar, estado persistido |
| Troca de frontend quebra contrato | Médio | OpenAPI versionada, testes de contrato |
