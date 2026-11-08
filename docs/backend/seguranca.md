# Segurança

## Modelo de ameaças (resumo)

| Ameaça | Mitigação |
|---|---|
| Alguém abre o link sem estar na call | `join` valida voice state no servidor; link não é segredo |
| Cliente forja papel/permissão | Papel recalculado no servidor; token LiveKit emitido só pelo backend |
| Roubo de sessão | Cookie `HttpOnly`, `Secure`, `SameSite=Lax`; sessão revogável; id guardado como hash |
| CSRF | `SameSite=Lax` + checagem de `Origin` em métodos não seguros + `state` no OAuth |
| Open redirect no login | `redirect` aceita só caminho relativo |
| XSS | Frontend sem `dangerouslySetInnerHTML`; CSP; chat sempre texto puro |
| Vazamento de tokens do Discord | Criptografados em repouso (AES-256-GCM) |
| Abuso/flood | Rate limit REST e Socket.IO; limites de chat e conexões |
| Moderador abusa | Hierarquia + auditoria imutável |
| Webhook falso do LiveKit | Verificação de assinatura obrigatória |
| Enumeração de salas | IDs aleatórios de 128 bits; dados públicos mínimos |
| Segredos no repositório | `.env` ignorado; varredura de segredos no CI |
| DoS por conexão | Limite de conexões por usuário/IP; `maxParticipants` |

## Sobre o "link único"

O link `/r/<roomId>` identifica a sala; **não** concede acesso. Acesso = login Discord + presença na call (ou cargo, em reunião). Assim, um link vazado é inofensivo para quem não está na call. O `roomId` tem 128 bits aleatórios para não ser adivinhável.

## Cabeçalhos HTTP

`helmet` com:
- `Strict-Transport-Security` (1 ano)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: no-referrer`
- `Cross-Origin-Opener-Policy: same-origin`
- API não serve HTML, então CSP rígida: `default-src 'none'; frame-ancestors 'none'`.

CSP do **frontend** (configurada na Vercel) deve permitir `connect-src` para a API, `wss://live...` e o CDN de avatar do Discord (`cdn.discordapp.com`).

## CORS

- Lista explícita (`CORS_ORIGINS`). Nunca `*` com credenciais.
- Métodos: `GET, POST, PATCH, DELETE`. Cabeçalhos: `Content-Type`.
- Em métodos não seguros, rejeitar se `Origin` ausente ou fora da lista.

## Rate limit

| Escopo | Limite |
|---|---|
| Geral (por usuário ou IP) | 120 / min |
| `/auth/*` | 20 / min por IP |
| `POST /rooms/:id/join` | 20 / min por usuário |
| Moderação | 60 / min por usuário |
| `chat:send` | 5 / 5 s |

Respostas `429 RATE_LIMITED` com `Retry-After`.

## Validação de entrada

- Tudo passa por zod (REST, Socket.IO, comandos).
- Limites de tamanho de corpo (100 KB) e strings.
- IDs do Discord validados por regex `^\d{17,20}$`.
- Mongo: usar consultas tipadas; rejeitar chaves com `$` ou `.` vindas do cliente.

## Segredos

- Somente em variáveis de ambiente / secrets da VPS. Rotacionar `DISCORD_BOT_TOKEN`, `LIVEKIT_API_SECRET`, `COOKIE_SECRET` em caso de suspeita.
- Rotação de `TOKEN_ENCRYPTION_KEY`: suportar chave anterior durante a transição [planejado].
- Logs nunca contêm tokens, cookies, `code` do OAuth ou segredos.

## Privacidade

Dados guardados: ID, username, avatar, entradas/saídas de salas, ações de moderação. Nada de e-mail. Mídia **não** é gravada. Pedido de exclusão: remover `users` e anonimizar `participations`/`audit_logs` (`actorId`/`userId` -> hash).

## Infra

- Mongo **sem** porta pública; só na rede do Docker.
- Firewall (ufw): liberar apenas as portas de [livekit-webrtc.md](livekit-webrtc.md#rede-portas-e-turn).
- SSH por chave, sem senha; fail2ban.
- Atualizações automáticas de segurança do SO; imagens Docker fixadas por versão.
- Coturn: bloquear relay para redes privadas (`denied-peer-ip`) para evitar abuso como proxy.

## Checklist antes de ir para produção

- [ ] `.env` fora do Git e secrets rotacionados
- [ ] HTTPS em API, LiveKit e TURN
- [ ] CORS restrito, cookie com `Domain` correto
- [ ] Mongo sem exposição pública, com autenticação
- [ ] Coturn com `denied-peer-ip` e segredo forte
- [ ] Webhook do LiveKit com assinatura validada (teste negativo feito)
- [ ] Rate limits ativos
- [ ] Backup do Mongo testado com restauração
- [ ] Logs sem dados sensíveis (amostra revisada)
- [ ] `npm audit` sem vulnerabilidades altas/críticas
- [ ] Teste: usuário fora da call recebe `NOT_IN_VOICE`
- [ ] Teste: MOD não consegue moderar ADMIN
- [ ] Teste: sessão revogada derruba o socket

## Reporte de vulnerabilidades

Abra um aviso privado de segurança no GitHub (Security > Report a vulnerability). Não publique detalhes em issues públicas.
