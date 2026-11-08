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

- [ ] Express com helmet, CORS restrito, rate limit, logger (pino).
- [ ] Config tipada e validada com zod.
- [ ] Conexão MongoDB (mongoose ou driver oficial) e índices.
- [ ] Tratamento de erros padronizado ([erros.md](backend/erros.md)).
- [ ] Healthcheck e readiness.
- [ ] OpenAPI gerada e servida em `/api/docs`.

**Aceite:** testes de integração do esqueleto passam; OpenAPI publicada.

## Fase 3 - Autenticação

- [ ] Fluxo Discord OAuth2 com `state` e PKCE quando aplicável.
- [ ] Sessão por cookie, expiração e renovação.
- [ ] `GET /api/auth/me`, `POST /api/auth/logout`.
- [ ] Verificação de participação na guilda.
- [ ] Cálculo de papel a partir dos cargos.

**Aceite:** usuário fora da guilda recebe `403 NOT_IN_GUILD`; usuário da guilda recebe sessão e papel correto.

## Fase 4 - Bot do Discord

- [ ] Login do bot, intents (`Guilds`, `GuildVoiceStates`, `GuildMembers`).
- [ ] Cache de voice states e reconciliação ao reiniciar.
- [ ] Detecção de entrada/saída na categoria de lives.
- [ ] Embed com botão (link da sala) e atualização do embed.
- [ ] Slash commands: `/config`, `/reuniao criar|agendar|cancelar|encerrar|listar`.
- [ ] Reconexão e tolerância a falhas.

**Aceite:** entrar no canal de voz gera exatamente um embed; reiniciar o bot não duplica.

## Fase 5 - Salas e LiveKit

- [ ] Modelo de sala (live e reunião) e máquina de estados.
- [ ] `POST /api/rooms/:id/join` com validação de presença.
- [ ] Emissão de token LiveKit com grants por papel.
- [ ] Webhooks do LiveKit (participante entrou/saiu, track publicada).
- [ ] Remoção automática de quem sai da call (grace period).
- [ ] Encerramento de sala e limpeza.

**Aceite:** fora da call, `join` retorna `403 NOT_IN_VOICE`; dentro, retorna token funcional.

## Fase 6 - Moderação e administração

- [ ] Mutar áudio/vídeo/tela de um participante.
- [ ] Expulsar e banir da sala (temporário).
- [ ] Bloquear publicação para todos (modo palestra).
- [ ] Promover participante a palestrante.
- [ ] Alterar configurações da guilda pela API.
- [ ] Auditoria de todas as ações.

**Aceite:** ações exigem papel adequado; cada ação gera registro de auditoria.

## Fase 7 - Reuniões

- [ ] Criação imediata e agendada, com título e descrição.
- [ ] Aviso no canal de avisos com embed e botão.
- [ ] Lembretes programados (24h, 1h, 5min).
- [ ] Abertura automática no horário.
- [ ] Lista de presença e resumo ao final.
- [ ] Reagendar e cancelar.

**Aceite:** reunião agendada abre sozinha no horário e avisa no canal.

## Fase 8 - Frontend (primeira versão)

- [ ] Login com Discord e tela de sala.
- [ ] Controles: câmera, tela, microfone, dispositivos.
- [ ] Grid de participantes, destaque de quem compartilha tela.
- [ ] Painel de moderação.
- [ ] Painel de reuniões.
- [ ] Estados de erro (fora da call, sala encerrada, sem permissão).
- [ ] Deploy na Vercel.

**Aceite:** fluxo completo UC1 a UC4 funciona em Chrome, Firefox e Safari.

## Fase 9 - Qualidade e endurecimento

- [ ] Testes e2e do fluxo principal.
- [ ] Testes de carga (25 participantes, 5 publicando).
- [ ] Revisão de segurança ([seguranca.md](backend/seguranca.md)).
- [ ] Métricas (Prometheus) e dashboards.
- [ ] Backups do MongoDB.
- [ ] Documentação revisada.

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
