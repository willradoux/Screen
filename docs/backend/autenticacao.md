# Autenticação

Login exclusivamente via **Discord OAuth2** (authorization code). Não há senha própria.

## Escopos solicitados

| Escopo | Para quê |
|---|---|
| `identify` | id, username, avatar |
| `guilds.members.read` | ler o membro na guilda (cargos, apelido) |

Não pedimos `email`. Não pedimos `guilds` inteiro, só consultamos a guilda configurada.

## Fluxo

```
1. GET /api/v1/auth/discord?redirect=/r/abc123
   - gera `state` aleatório e o guarda, junto do `redirect` já validado, em cookie assinado (HMAC-SHA256)
     `screem_oauth` (HttpOnly, 10 min, `Path=/api/v1/auth`)
   - 302 para https://discord.com/oauth2/authorize?...&state=...

2. Usuário autoriza no Discord (usamos `prompt=none`: quem já autorizou não vê a tela de novo). Se recusar, o Discord volta com `error=access_denied` e o login termina em `?error=ACCESS_DENIED`.

3. GET /api/v1/auth/discord/callback?code=...&state=...
   - confere `state` com o cookie (proteção CSRF); o cookie é apagado em qualquer resposta, então o `state` só vale uma vez
   - troca `code` por access_token (POST /oauth2/token)
   - GET /users/@me
   - GET /users/@me/guilds/{guildId}/member
       404/403 -> redireciona ao frontend com ?error=NOT_IN_GUILD (nenhuma sessão é criada)
   - upsert do User no Mongo
   - cria sessão e define cookie
   - 302 para o `redirect` validado (apenas caminhos relativos, ver abaixo)

4. GET /api/v1/auth/me -> dados do usuário e papel
```

### Validação do `redirect`

Aceitar somente caminhos que começam com `/` e **não** com `//`. Qualquer outra coisa vira `/`. Isso evita open redirect.

## Sessão

| Item | Valor |
|---|---|
| Mecanismo | Sessão no servidor (coleção `sessions`) com id aleatório de 256 bits |
| Cookie | `screem_sid`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Domain=.exemplo.com`, `Path=/` |
| Duração | 7 dias deslizantes, máximo absoluto de 30 dias |
| Armazenamento | Apenas o **hash** (SHA-256) do id no banco |
| Tokens do Discord | `access_token` e `refresh_token` guardados **criptografados** (AES-256-GCM, chave em `TOKEN_ENCRYPTION_KEY`) |
| Revogação | Logout apaga a sessão; admin pode revogar sessões de um usuário |

### Socket.IO

O handshake envia o mesmo cookie (`withCredentials: true`). O servidor valida a sessão no `io.use(...)`. Sem sessão válida a conexão é recusada com `UNAUTHENTICATED`.

### Frontends que não usam cookie [planejado]

Para clientes sem acesso a cookies (app nativo, extensão), haverá `POST /api/v1/auth/token` que troca a sessão por um bearer de curta duração. Até lá, o contrato oficial é cookie.

## Papel do usuário

Calculado a cada `GET /auth/me` e a cada ação sensível, a partir dos cargos do membro na guilda e das configurações. Veja [permissoes.md](permissoes.md).

## Endpoints

Detalhados em [api-rest.md](api-rest.md#auth):

- `GET /auth/discord`
- `GET /auth/discord/callback`
- `GET /auth/me`
- `POST /auth/logout`

## Casos de erro

| Situação | Resposta |
|---|---|
| Sem cookie / sessão expirada | `401 UNAUTHENTICATED` |
| `state` inválido | `400 INVALID_STATE` |
| Usuário não está na guilda | `403 NOT_IN_GUILD` |
| Usuário recusou a autorização | login termina em `/login?error=ACCESS_DENIED` |
| Falha na troca de code | login termina em `/login?error=DISCORD_OAUTH_FAILED` |
| Discord fora do ar no login | login termina em `/login?error=DISCORD_UNAVAILABLE` |
| Usuário bloqueado na plataforma | `403 ACCOUNT_BLOCKED` (e as sessões são revogadas) |
| Saiu do servidor depois de logar | `403 NOT_IN_GUILD` (e as sessões são revogadas) |
| Token do Discord revogado/expirado sem renovação | `401 UNAUTHENTICATED` (sessão encerrada) |
| Discord indisponível ao revalidar o papel | `502 DISCORD_UNAVAILABLE` (sessão mantida) |

No callback, **todos** os erros viram redirecionamento (302) para `{WEB_URL}/login?error=<CODE>`, porque o navegador está navegando, não chamando `fetch`.

## Papel e revalidação

`GET /auth/me` (e toda rota protegida) consulta o membro no Discord com o token do próprio usuário e guarda o resultado por 60 s. Se o access token estiver a menos de 1 min de expirar, ele é renovado com o refresh token. Detalhes e a regra de cargos em [permissoes.md](permissoes.md).

> Dono da guilda e permissão `Administrator`/`ManageGuild` do Discord só serão reconhecidos quando o bot entrar (Fase 4). Até lá, o primeiro admin é definido por `BOOTSTRAP_ADMIN_IDS` e depois por `/config cargo-admin`.

## Proteção CSRF nas rotas que alteram estado

Além de `SameSite=Lax`, toda requisição `POST`, `PATCH` e `DELETE` precisa do cabeçalho `Origin` com uma origem de `CORS_ORIGINS`; senão responde `403 FORBIDDEN`. Navegadores enviam `Origin` sozinhos. Chamadas servidor-a-servidor (webhook do LiveKit) ficam isentas por caminho.

## Checklist de segurança

- [x] `state` obrigatório, de uso único e em cookie assinado
- [x] PKCE não é usado: o fluxo é confidencial (o `client_secret` fica só no servidor) e o `state` já cobre o CSRF do login
- [x] Redirect restrito a caminho relativo
- [x] Cookie `HttpOnly` + `Secure`
- [x] Tokens do Discord criptografados em repouso
- [x] Rate limit em `/auth/*` (20 req/min por IP)
- [x] Sessão rotacionada após login (evita fixation)
