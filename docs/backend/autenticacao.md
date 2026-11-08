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
   - gera `state` aleatório (e guarda hash + redirect em cookie assinado de curta duração)
   - 302 para https://discord.com/oauth2/authorize?...&state=...

2. Usuário autoriza no Discord.

3. GET /api/v1/auth/discord/callback?code=...&state=...
   - confere `state` com o cookie (proteção CSRF)
   - troca `code` por access_token (POST /oauth2/token)
   - GET /users/@me
   - GET /users/@me/guilds/{guildId}/member
       404/403 -> redireciona ao frontend com ?error=NOT_IN_GUILD
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
| Falha na troca de code | `502 DISCORD_OAUTH_FAILED` |
| Usuário banido na plataforma | `403 ACCOUNT_BLOCKED` |

## Checklist de segurança

- [x] `state` obrigatório
- [x] Redirect restrito a caminho relativo
- [x] Cookie `HttpOnly` + `Secure`
- [x] Tokens do Discord criptografados em repouso
- [x] Rate limit em `/auth/*` (20 req/min por IP)
- [x] Sessão rotacionada após login (evita fixation)
