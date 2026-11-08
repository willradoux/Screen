# Deploy no Coolify (passo a passo manual)

Backend completo (API + bot, LiveKit, Coturn, MongoDB) numa VPS com Coolify. O frontend pode ir na Vercel (ou no Render, veja [deploy-render.md](deploy-render.md)). Arquivo usado: [`infra/coolify/docker-compose.yml`](../../infra/coolify/docker-compose.yml).

## 0. Antes de começar

Você precisa de:

- VPS com Coolify funcionando e acessível (painel com HTTPS).
- **3 domínios** (ou subdomínios) apontando o DNS tipo **A** para o IP da VPS. **Se usar Cloudflare, deixe em "somente DNS" (nuvem cinza)**, senão a mídia do LiveKit e o TURN não funcionam:
  - `api.exemplo.com` (API)
  - `live.exemplo.com` (LiveKit, sinalização)
  - `turn.exemplo.com` (TURN)
- Um domínio para o frontend, **no mesmo domínio-pai** (`app.exemplo.com`). Isso é obrigatório: o cookie de sessão é compartilhado entre `app.` e `api.` via `SESSION_COOKIE_DOMAIN=.exemplo.com`. Domínios como `*.vercel.app` ou `*.onrender.com` **não** servem para isso.
- A aplicação do Discord criada ([teste-real.md](teste-real.md), passo 1), mas usando o redirect de produção: `https://api.exemplo.com/api/v1/auth/discord/callback`.
- O repositório no GitHub (público, ou privado com *Deploy Key*/GitHub App configurado no Coolify).

## 1. Abrir as portas no firewall da VPS

Mídia e TURN não passam pelo proxy (Traefik) do Coolify, então precisam estar liberadas no firewall (painel da hospedagem **e** `ufw`, se usar):

| Porta | Protocolo | Para quê |
|---|---|---|
| 80, 443 | TCP | HTTPS (Coolify/Traefik) |
| 7881 | TCP | LiveKit (mídia por TCP) |
| 7882 | UDP | LiveKit (mídia) |
| 3478 | TCP e UDP | TURN |
| 49152-49252 | UDP | Relay do TURN |

Não abra a 27017 (MongoDB) nem a 9100 (métricas).

## 2. Criar o projeto

1. No Coolify: **Projects → + Add** (nome `Screem`) → escolha o ambiente `production`.
2. **+ New Resource** → **Public Repository** (ou *Private Repository (with GitHub App / Deploy Key)*).
3. Cole `https://github.com/willradoux/Screen` e clique **Check repository**.
4. Em **Build Pack** escolha **Docker Compose**. Branch `main`.
5. **Base Directory**: `/`. **Docker Compose Location**: `/infra/coolify/docker-compose.yml`. **Continue**.

## 3. Variáveis de ambiente

Aba **Environment Variables** do recurso (o Coolify lê o compose e lista as variáveis; as com `?` no compose são obrigatórias). Preencha:

| Variável | Valor |
|---|---|
| `PUBLIC_API_URL` | `https://api.exemplo.com` |
| `WEB_URL` | `https://app.exemplo.com` |
| `SESSION_COOKIE_DOMAIN` | `.exemplo.com` (com o ponto) |
| `LIVE_DOMAIN` | `live.exemplo.com` (sem `https://`) |
| `TURN_DOMAIN` | `turn.exemplo.com` |
| `TURN_EXTERNAL_IP` | IP público da VPS |
| `TURN_PASSWORD` | `openssl rand -hex 24` |
| `MONGO_PASSWORD` | `openssl rand -hex 24` (`MONGO_USER` é opcional, padrão `screem`) |
| `LIVEKIT_API_KEY` | `openssl rand -hex 16` |
| `LIVEKIT_API_SECRET` | `openssl rand -base64 32` |
| `COOKIE_SECRET` | `openssl rand -base64 32` |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Developer Portal |
| `DISCORD_GUILD_ID` | ID do servidor Acelera DEV |
| `DISCORD_BOT_TOKEN` | Developer Portal → Bot |
| `BOOTSTRAP_ADMIN_IDS` | IDs de quem será admin no primeiro dia (separados por vírgula) |

Opcionais (têm padrão): `MEETING_MENTION_ROLE_ID`, `CORS_ORIGINS`, `TRUST_PROXY` (use `2` se a Cloudflare estiver na frente), `LOG_LEVEL`, `EMPTY_LIVE_END_SECONDS`, `EMPTY_MEETING_END_MINUTES`.

> Os segredos ficam só no Coolify. Marque como **Is Secret**/**Build Variable** desmarcado: eles são de execução, não de build.

## 4. Domínios (Traefik do Coolify)

Na aba **Configuration** do recurso, em cada serviço, preencha **Domains** (com a porta do container depois dos dois pontos):

| Serviço | Domínio |
|---|---|
| `api` | `https://api.exemplo.com:3000` |
| `livekit` | `https://live.exemplo.com:7880` |
| `mongo`, `coturn` | **vazio** (não expor) |

Salve. O Coolify emite os certificados Let's Encrypt sozinho (o DNS precisa estar propagado antes).

## 5. Deploy

Clique em **Deploy** e acompanhe os logs. Ordem esperada: `mongo` saudável → `livekit` → `api` (healthcheck) → `coturn`. Na primeira vez o build da API leva alguns minutos.

Conferir:

```bash
curl https://api.exemplo.com/api/v1/health      # {"data":{"status":"ok",...}}
curl https://api.exemplo.com/api/v1/ready       # 200, mongo ok
```

Nos logs da `api` deve aparecer o bot conectado. No Discord, rode `/config` e configure categoria, canal das lives e canal de avisos ([teste-real.md](teste-real.md), seção "Configuração pelo Discord").

> **Webhook do LiveKit:** já aponta para `http://api:3000/...` pela rede interna do compose; não precisa configurar nada no painel do LiveKit.

## 6. Frontend

Na Vercel: importar o repositório, **Root Directory** `apps/web`, variáveis:

- `VITE_API_URL` = `https://api.exemplo.com/api/v1`
- `VITE_SOCKET_URL` = `https://api.exemplo.com`

Em **Domains** adicione `app.exemplo.com` e crie o CNAME que a Vercel pedir. Se quiser trocar a CSP (`connect-src`), edite `apps/web/vercel.json`.

## 7. Atualizações e rotina

- **Deploy automático**: em *Configuration → Webhooks* do recurso, ative o auto-deploy e (opcional) adicione o webhook no GitHub. Sem isso, clique em **Redeploy** a cada mudança.
- **Backup do MongoDB**: o Coolify faz backup agendado de bancos criados por ele, mas aqui o Mongo vem do compose. Use `infra/scripts/backup.sh` no servidor (ele precisa do nome do container: `docker ps | grep mongo`) e **teste a restauração** ([README.md](README.md#backup-e-restauração)).
- **Logs**: aba *Logs* de cada serviço no painel.
- **Métricas**: `METRICS_PORT=9100` segue interno; para usá-las, rode o Prometheus do perfil `monitoring` do `infra/docker-compose.yml` ou adicione-o como outro recurso.

## 8. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Deploy falha com `required variable X is missing` | Faltou preencher `X` na aba de variáveis |
| `Bad Gateway` em `api.` | Domínio sem `:3000` no serviço `api`; ou a API ainda subindo (veja logs) |
| Login volta com `INVALID_STATE` ou fica deslogado | `SESSION_COOKIE_DOMAIN` errado ou frontend em domínio de outro "site" (ex.: `vercel.app`) |
| Entra na sala mas sem vídeo/áudio | Portas 7881/7882 fechadas no firewall, ou DNS do `live.` atrás da Cloudflare laranja |
| Funciona em casa, não no 4G / rede corporativa | Coturn: portas 3478 e 49152-49252 fechadas, ou `TURN_EXTERNAL_IP` errado |
| Limite de requisições "para todo mundo junto" | `TRUST_PROXY` incorreto (deve ser `1` atrás do Traefik, `2` com Cloudflare) |
| Bot offline | `DISCORD_BOT_TOKEN` errado; *Server Members Intent* desligado no Developer Portal |

> Nada disto foi executado numa VPS real por mim: o compose foi validado (`docker compose config`), mas o primeiro deploy pode revelar ajustes. Se algo falhar, mande o log do serviço.
