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

## Revisão de segurança (Fase 9)

Feita sobre o código e a configuração, com testes automáticos para cada ponto (`apps/api/test/integration/security.test.ts` e demais). Resultado:

### Problemas encontrados e já corrigidos

| # | Achado | Risco | Correção |
|---|---|---|---|
| 1 | O `code` do OAuth (query do retorno do Discord) ia para o log de requisições | Credencial de uso único em log | O log guarda só o caminho; `query` e `params` saem do registro |
| 2 | O WebSocket (Socket.IO) não passa pelo CORS do navegador | Outro site poderia abrir a conexão em nome de quem está logado | `allowRequest` recusa `Origin` que não esteja em `CORS_ORIGINS` |
| 3 | Em produção atrás do Caddy, `TRUST_PROXY` não estava definido | O limite de requisições enxergava só o IP do proxy: todos dividiam o mesmo limite (e um abusador derrubava o de todos) | O compose define `TRUST_PROXY=1`; teste confirma que sem ele o `X-Forwarded-For` é ignorado |
| 4 | `X-Request-Id` do cliente era devolvido sem validação | Reflexão de conteúdo arbitrário em cabeçalho e logs | Só vale se casar com `[\w.-]{1,64}`; senão gera outro |
| 5 | `room:subscribe` sem limite | Cada chamada consulta o banco: dava para forçar carga | Teto de 30 por minuto por socket (`RATE_LIMITED`) |
| 6 | `zod` 3.x com vulnerabilidade alta (consumo de memória em coleções gigantes) | Negação de serviço | Atualizado para zod 4; `npm audit --omit=dev` limpo e agora é etapa do CI |
| 7 | Frontend sem cabeçalhos de segurança | Clickjacking, injeção de scripts, câmera/microfone liberados a terceiros | `vercel.json` com CSP, `X-Frame-Options`, HSTS e `Permissions-Policy` |

### Verificado e já estava certo (com teste)

- Papel e acesso à sala **sempre** no servidor; o token do LiveKit só sai depois da checagem de presença; quem conecta com token antigo fora da call é derrubado.
- Cookie `HttpOnly` + `Secure` + `SameSite=Lax`; `Origin` obrigatório em `POST`/`PATCH`/`DELETE`; a sessão **não** é aceita por cabeçalho, query ou corpo.
- Tokens do Discord criptografados em repouso; só o hash do id de sessão no banco; sessão nova a cada login.
- `redirect` do login só aceita caminho relativo (inclusive contra `//`, `/\`, `javascript:`).
- Entradas: zod em tudo, campos desconhecidos recusados (sem atribuição em massa), operadores do MongoDB (`$ne`, `$gt`...) e `__proto__` não passam; ids de sala malformados dão 404 sem tocar no banco.
- Respostas de erro não vazam detalhes internos; `/auth/me` não devolve token nem campos internos.
- Hierarquia de moderação (ninguém age sobre papel igual ou superior; o dono do servidor é intocável) e auditoria somente de inserção.
- Webhook do LiveKit só com assinatura válida (corpo adulterado, segredo errado e cabeçalho ausente são recusados).
- Métricas em porta interna, sem dados pessoais nos rótulos, com rotas por padrão (um atacante não cria séries novas variando a URL).

### Riscos aceitos e pendências

| Item | Situação |
|---|---|
| Cookies de subdomínios irmãos (`SameSite` considera `app.` e `api.` o mesmo *site*) | Aceito: é o que faz o login funcionar. Não hospede conteúdo de terceiros em outros subdomínios do mesmo domínio |
| `connect-src https: wss:` no CSP do frontend | Largo de propósito (a API e o LiveKit mudam de domínio por ambiente). Se quiser, troque por seus hosts exatos em `apps/web/vercel.json` |
| `/api/v1/docs` e `/ready` são públicos | Aceito: mostram o contrato e o nome das dependências, sem segredos. Remova o `/docs` em produção se preferir |
| TURN com senha fixa (não efêmera) | A senha do usuário TURN é enviada aos navegadores pelo LiveKit; quem a obtém pode usar o relay (limitado e sem acesso a redes privadas). Credenciais efêmeras ficam como melhoria |
| Rotação de `TOKEN_ENCRYPTION_KEY` | Hoje trocar a chave invalida as sessões (as pessoas precisam entrar de novo). Aceitável |
| Sockets já conectados quando a sessão expira sozinha | Validados no handshake e a cada `room:subscribe`; um socket parado pode sobreviver até o próximo evento. Logout/bloqueio derrubam na hora |
| Sem proteção contra *brute force* além dos limites por IP/usuário | Suficiente para o escopo (não há senha própria) |
| Sem varredura automática de segredos no repositório | Pendente: considere ativar o *secret scanning* do GitHub |
| Backups e `ufw` | Scripts prontos, **não** testados numa VPS real |

## Checklist antes de ir para produção
- [ ] `.env` fora do Git e secrets rotacionados
- [ ] HTTPS em API, LiveKit e TURN
- [ ] CORS restrito, cookie com `Domain` correto
- [ ] Mongo sem exposição pública, com autenticação
- [ ] Coturn com `denied-peer-ip` e senha forte
- [x] Webhook do LiveKit com assinatura validada (teste negativo feito)
- [x] Rate limits ativos (com `TRUST_PROXY=1` no compose)
- [ ] Backup do Mongo testado com restauração (roteiro em [../infra/README.md](../infra/README.md#backup-e-restauração); falta executar)
- [x] Logs sem dados sensíveis (query, cookies e `Authorization` fora; há teste)
- [x] `npm audit --omit=dev` sem vulnerabilidades altas/críticas (etapa do CI)
- [x] Teste: usuário fora da call recebe `NOT_IN_VOICE`
- [x] Teste: MOD não consegue moderar ADMIN
- [x] Teste: sessão revogada derruba o socket
- [ ] Roteiro de teste real executado ([../infra/teste-real.md](../infra/teste-real.md))
- [ ] Teste de carga executado ([../infra/teste-de-carga.md](../infra/teste-de-carga.md))

## Reporte de vulnerabilidades

Abra um aviso privado de segurança no GitHub (Security > Report a vulnerability). Não publique detalhes em issues públicas.
