# Variáveis de ambiente

Validadas na inicialização por `src/config/env.ts` (zod). Se faltar algo obrigatório, o processo **não sobe** e imprime quais variáveis estão erradas.

Arquivo de exemplo: `apps/api/.env.example`. Nunca commitar `.env`.

## Servidor

| Variável | Obrig. | Exemplo | Descrição |
|---|:-:|---|---|
| `NODE_ENV` | sim | `production` | `development`, `test`, `production` |
| `PORT` | não | `3000` | Porta HTTP |
| `PUBLIC_API_URL` | sim | `https://api.exemplo.com` | URL pública da API |
| `WEB_URL` | sim | `https://app.exemplo.com` | URL do frontend (CORS, redirects, links) |
| `CORS_ORIGINS` | não | `https://app.exemplo.com` | Lista separada por vírgula; padrão `WEB_URL` |
| `LOG_LEVEL` | não | `info` | `debug`, `info`, `warn`, `error` |
| `TIMEZONE` | não | `America/Sao_Paulo` | Fuso dos comandos |
| `TRUST_PROXY` | não | `1` | Número de proxies confiáveis (para IP real) |

## Banco

| Variável | Obrig. | Exemplo | Descrição |
|---|:-:|---|---|
| `MONGODB_URI` | não | `mongodb://screem:senha@mongo:27017/screem?authSource=admin` | String de conexão (padrão: `mongodb://localhost:27017/screem`). Em produção o compose injeta |

## Sessão e criptografia

| Variável | Obrig. | Exemplo | Descrição |
|---|:-:|---|---|
| `SESSION_COOKIE_DOMAIN` | prod | `.exemplo.com` | Domínio do cookie |
| `SESSION_TTL_DAYS` | não | `7` | Duração deslizante |
| `COOKIE_SECRET` | sim | 32+ bytes aleatórios | Assina cookie de `state` |
| `TOKEN_ENCRYPTION_KEY` | sim | 32 bytes em base64 | AES-256-GCM dos tokens do Discord |

Gerar: `openssl rand -base64 32`. `TOKEN_ENCRYPTION_KEY` precisa decodificar para **exatamente 32 bytes**. Só em `NODE_ENV=test` as variáveis de login têm valores de teste; nos outros ambientes a API não sobe se faltarem.

## Discord

| Variável | Obrig. | Descrição |
|---|:-:|---|
| `DISCORD_CLIENT_ID` | sim | ID da aplicação |
| `DISCORD_CLIENT_SECRET` | sim | Segredo OAuth2 |
| `DISCORD_BOT_TOKEN` | prod | Token do bot. Sem ele (só em desenvolvimento) a API sobe sem o bot; em produção a API não inicia |
| `DISCORD_GUILD_ID` | sim | ID do servidor Acelera DEV |
| `DISCORD_REDIRECT_URI` | sim | `https://api.exemplo.com/api/v1/auth/discord/callback` |
| `BOOTSTRAP_ADMIN_IDS` | não | IDs Discord (vírgula) tratados como ADMIN. Serve para o primeiro acesso, antes de configurar os cargos |
| `MEETING_MENTION_ROLE_ID` | não | Cargo marcado nos avisos de reunião (vazio = `@everyone`) |

## LiveKit

| Variável | Obrig. | Exemplo | Descrição |
|---|:-:|---|---|
| `LIVEKIT_URL` | sim | `http://livekit:7880` | URL interna (API de servidor) |
| `LIVEKIT_PUBLIC_URL` | sim | `wss://live.exemplo.com` | URL que o navegador usa |
| `LIVEKIT_API_KEY` | sim | `APIxxxx` | |
| `LIVEKIT_API_SECRET` | sim | | |

## Regras de negócio (padrões)

| Variável | Padrão | Descrição |
|---|---|---|
| `DEFAULT_GRACE_SECONDS` | `30` | Tolerância após sair da call |
| `EMPTY_LIVE_END_SECONDS` | `60` | Encerra live sem ninguém no canal (mínimo 5) |
| `EMPTY_MEETING_END_MINUTES` | `15` | Encerra reunião vazia |
| `JOIN_TOKEN_TTL_SECONDS` | `600` | Validade do token do LiveKit emitido no `join` (30 a 3600) |

## Coturn (usado pelo compose e pelo LiveKit)

| Variável | Exemplo | Descrição |
|---|---|---|
| `TURN_DOMAIN` | `turn.exemplo.com` | |
| `TURN_SECRET` | aleatório | `static-auth-secret` do Coturn |
| `TURN_EXTERNAL_IP` | `203.0.113.10` | IP público da VPS |

## Frontend (Vite)

Só variáveis com prefixo `VITE_` vão para o navegador. **Nunca** coloque segredos aqui.

| Variável | Exemplo |
|---|---|
| `VITE_API_URL` | `https://api.exemplo.com/api/v1` |
| `VITE_SOCKET_URL` | `https://api.exemplo.com` |

## Exemplo mínimo de desenvolvimento

```env
NODE_ENV=development
PORT=3000
PUBLIC_API_URL=http://localhost:3000
WEB_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/screem
COOKIE_SECRET=troque-por-um-valor-aleatorio-com-32-ou-mais-caracteres
TOKEN_ENCRYPTION_KEY=troque-por-32-bytes-em-base64
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_BOT_TOKEN=
DISCORD_GUILD_ID=
DISCORD_REDIRECT_URI=http://localhost:3000/api/v1/auth/discord/callback
LIVEKIT_URL=http://localhost:7880
LIVEKIT_PUBLIC_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

Em desenvolvimento local (sem domínio comum), deixe `SESSION_COOKIE_DOMAIN` vazio: o cookie fica no `localhost` e funciona entre portas.
