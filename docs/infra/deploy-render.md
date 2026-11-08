# Deploy no Render (passo a passo manual)

## Leia antes: o que o Render consegue e o que não

| Peça | No Render? | Alternativa |
|---|---|---|
| API + bot do Discord | **Sim** (Web Service Docker) | – |
| Frontend | **Sim** (Static Site) | Vercel |
| MongoDB | **Não** (não tem Mongo gerenciado) | [MongoDB Atlas](https://www.mongodb.com/atlas) (tem plano grátis) |
| **LiveKit (mídia)** | **Não**: o Render não aceita UDP nem portas TCP arbitrárias (7881/7882) | [LiveKit Cloud](https://cloud.livekit.io) (plano grátis) **ou** o LiveKit na sua VPS Coolify |
| Coturn (TURN) | **Não** | O LiveKit Cloud já inclui TURN |

Consequência: no Render você roda **só a API e o frontend**; a mídia fica no LiveKit Cloud ou na VPS. Como você já tem a VPS com Coolify, a opção mais simples é o [deploy-coolify.md](deploy-coolify.md) para tudo. Use o Render se quiser a API fora da VPS.

Dois cuidados:

1. **Plano**: o plano gratuito "dorme" sem tráfego e derruba o bot do Discord. Use no mínimo **Starter**.
2. **Domínio próprio é obrigatório**: `*.onrender.com` é um sufixo público, então o cookie de sessão não pode ser compartilhado entre `screem-web.onrender.com` e `screem-api.onrender.com` (login não funciona). Use `api.exemplo.com` e `app.exemplo.com` (mesmo domínio-pai) e `SESSION_COOKIE_DOMAIN=.exemplo.com`.

## 1. MongoDB Atlas

1. Crie uma conta e um cluster (M0 grátis serve para o piloto).
2. **Database Access**: crie um usuário com senha forte.
3. **Network Access**: o Render não tem IP fixo no plano básico; para o piloto libere `0.0.0.0/0` **e** use senha forte (ou assine o IP estático do Render e libere só ele).
4. **Connect → Drivers**: copie a string `mongodb+srv://USUARIO:SENHA@cluster.../screem?retryWrites=true&w=majority`. Ela será o `MONGODB_URI`.

## 2. LiveKit Cloud

1. Crie um projeto em <https://cloud.livekit.io>.
2. **Settings → Keys**: crie uma API key; guarde `API Key` e `API Secret`.
3. Anote a URL do projeto (`wss://SEU-PROJETO.livekit.cloud`). Para a API, `LIVEKIT_URL` é a mesma com `https://`.
4. **Settings → Webhooks**: adicione `https://api.exemplo.com/api/v1/livekit/webhook` assinado com a mesma API key. (Sem isto o Screem não sabe quem entrou ou saiu.)

## 3. Criar os serviços no Render

### Opção A: Blueprint (mais rápido)

1. No Render: **New → Blueprint**, conecte o repositório. Ele lê o [`render.yaml`](../../render.yaml) e cria `screem-api` e `screem-web`.
2. Preencha as variáveis pedidas (tabela abaixo) e confirme.

### Opção B: manual

**API**: *New → Web Service* → repositório → **Language: Docker** → **Dockerfile Path** `./apps/api/Dockerfile` → **Docker Build Context Directory** `.` → instância **Starter** → **Health Check Path** `/api/v1/health`.

**Frontend**: *New → Static Site* → repositório → **Build Command** `npm ci && npm run build:shared && npm run build -w @screem/web` → **Publish Directory** `apps/web/dist` → em *Redirects/Rewrites* adicione `/*` → `/index.html` (**Rewrite**).

## 4. Variáveis da API (aba *Environment*)

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `TRUST_PROXY` | `1` |
| `PUBLIC_API_URL` | `https://api.exemplo.com` |
| `WEB_URL` | `https://app.exemplo.com` |
| `SESSION_COOKIE_DOMAIN` | `.exemplo.com` |
| `DISCORD_REDIRECT_URI` | `https://api.exemplo.com/api/v1/auth/discord/callback` |
| `MONGODB_URI` | string do Atlas |
| `LIVEKIT_URL` | `https://SEU-PROJETO.livekit.cloud` |
| `LIVEKIT_PUBLIC_URL` | `wss://SEU-PROJETO.livekit.cloud` |
| `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | do LiveKit Cloud |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_GUILD_ID`, `DISCORD_BOT_TOKEN` | Developer Portal |
| `BOOTSTRAP_ADMIN_IDS` | seus IDs de admin |
| `COOKIE_SECRET` | `openssl rand -base64 32` (o blueprint gera sozinho) |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` |

O Render define `PORT` sozinho (a API já lê essa variável). Não precisa de `METRICS_PORT`.

Variáveis do **frontend**: `VITE_API_URL=https://api.exemplo.com/api/v1` e `VITE_SOCKET_URL=https://api.exemplo.com`. Elas entram no *build*: se mudar, faça novo deploy.

## 5. Domínios

1. Em cada serviço: **Settings → Custom Domains → Add** (`api.exemplo.com` na API, `app.exemplo.com` no frontend).
2. No seu DNS crie os **CNAME** que o Render mostrar (`api` → `screem-api.onrender.com`, `app` → `screem-web.onrender.com`). Com Cloudflare, deixe "somente DNS" até o certificado ser emitido.
3. Aguarde o certificado (alguns minutos).

## 6. Conferir

```bash
curl https://api.exemplo.com/api/v1/health
curl https://api.exemplo.com/api/v1/ready
```

Nos *Logs* da API deve aparecer o bot conectado. Depois configure o servidor com `/config` e siga o roteiro de [teste-real.md](teste-real.md).

## 7. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Bot cai de tempos em tempos | Plano free dormindo: suba para Starter |
| Login não persiste | Domínios `onrender.com`/`vercel.app` em vez de subdomínios do mesmo domínio próprio |
| `ready` falha com Mongo | IP do Render bloqueado no *Network Access* do Atlas, ou senha com caracteres especiais sem codificar na URI (use `%40` para `@` etc.) |
| Sala conecta mas some a participação | Webhook do LiveKit Cloud não configurado (passo 2.4) |
| Build do frontend falha | `VITE_*` ausentes não quebram o build, mas `npm run build:shared` precisa rodar antes (já está no comando) |

> Não foi executado por mim no Render: o `render.yaml` segue o formato documentado, mas confirme as telas e nomes de campo, que o Render muda com frequência.
