# Infraestrutura e deploy

Tudo do backend roda em Docker numa VPS. O frontend roda na Vercel. Os arquivos reais estão em [`infra/`](../../infra):

```
infra/
  docker-compose.yml        produção (VPS)
  docker-compose.dev.yml    desenvolvimento local (Mongo + LiveKit dev)
  .env.example              segredos e domínios da infra
  caddy/Caddyfile           proxy reverso + TLS automático
  scripts/ufw.sh            firewall
  scripts/backup.sh         backup diário do Mongo
  scripts/restore.sh        restauração
```

## Serviços

| Serviço | Imagem | Função | Exposição |
|---|---|---|---|
| `api` | build de `apps/api/Dockerfile` | API, Socket.IO, bot | só rede interna (3000), via Caddy |
| `mongo` | `mongo:7` | Banco | **só rede interna** |
| `livekit` | `livekit/livekit-server:v1.9` | SFU | 7880 via Caddy; 7881/tcp e 7882/udp diretos |
| `coturn` | `coturn/coturn:4.6` | TURN/STUN | host network: 3478 e relay 49152-49252/udp |
| `caddy` | `caddy:2` | TLS e proxy reverso | 80, 443 |

Decisões:
- **LiveKit com porta UDP única (7882)**, em vez de uma faixa de 10 mil portas: o Docker fica rápido e o firewall simples.
- **LiveKit com configuração inline** (`LIVEKIT_CONFIG`) para usar as variáveis do `.env` (chaves e senha do TURN) sem gerar arquivo com segredo.
- **Coturn em host network** com faixa de relay pequena (101 portas) e credencial estática do usuário `livekit`. Credenciais efêmeras são uma melhoria futura. Os IPs privados são bloqueados em `denied-peer-ip`, para o TURN não virar proxy para a rede interna.
- **TURN/TLS** (5349 ou 443) não vem ligado; exige certificado. Adicione se redes muito restritivas forem um problema.

## Domínios

| Host | Aponta para | Serviço |
|---|---|---|
| `app.exemplo.com` | Vercel (CNAME) | Frontend |
| `api.exemplo.com` | IP da VPS | Caddy -> api:3000 |
| `live.exemplo.com` | IP da VPS | Caddy -> livekit:7880 |
| `turn.exemplo.com` | IP da VPS | Coturn (sem proxy) |

No DNS, os três últimos devem ser **somente DNS** (sem proxy da Cloudflare).

## Variáveis

`infra/.env` (copie de `infra/.env.example`):

| Variável | Descrição |
|---|---|
| `API_DOMAIN`, `LIVE_DOMAIN`, `TURN_DOMAIN` | Hosts públicos |
| `TURN_EXTERNAL_IP` | IP público da VPS |
| `MONGO_USER`, `MONGO_PASSWORD` | Usuário root do Mongo |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Chaves do LiveKit (a API usa as mesmas) |
| `TURN_PASSWORD` | Senha do usuário TURN do LiveKit |

`apps/api/.env` (copie de `apps/api/.env.example`): variáveis da aplicação. No compose, `MONGODB_URI` e `LIVEKIT_*` são injetadas e sobrescrevem as do arquivo. Lista completa em [variaveis-de-ambiente.md](../backend/variaveis-de-ambiente.md).

Gerar segredos:

```bash
openssl rand -hex 16      # LIVEKIT_API_KEY
openssl rand -base64 32   # LIVEKIT_API_SECRET, COOKIE_SECRET, TOKEN_ENCRYPTION_KEY
openssl rand -hex 24      # TURN_PASSWORD, MONGO_PASSWORD
```

## Firewall

`sudo bash infra/scripts/ufw.sh` libera apenas:

| Porta | Protocolo | Uso |
|---|---|---|
| 22 | TCP | SSH |
| 80, 443 | TCP | HTTP (ACME) e HTTPS |
| 7881 | TCP | WebRTC sobre TCP (fallback) |
| 7882 | UDP | WebRTC (mídia) |
| 3478 | UDP/TCP | STUN/TURN |
| 49152-49252 | UDP | Relay do Coturn |

> Cuidado: o Docker publica portas passando por cima do ufw. Por isso o Mongo e a API **não** têm `ports:` no compose; só ficam na rede interna.

## Deploy passo a passo

1. Provisionar a VPS (Ubuntu LTS), usuário não-root, SSH por chave.
2. Instalar Docker e o plugin compose.
3. Apontar o DNS dos hosts para o IP da VPS.
4. `git clone` do repositório em `/opt/screem`.
5. `cp infra/.env.example infra/.env` e `cp apps/api/.env.example apps/api/.env`; preencher.
6. `sudo bash infra/scripts/ufw.sh`.
7. Subir:
   ```bash
   docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build
   ```
8. Conferir:
   ```bash
   docker compose -f infra/docker-compose.yml ps          # todos "healthy"/"running"
   curl https://api.exemplo.com/api/v1/health
   ```
   `/ready` entra na Fase 2.
9. Convidar o bot e rodar `/config` (Fase 4).
10. Deploy do frontend na Vercel com `VITE_API_URL`.

Atalho para não repetir flags:

```bash
echo 'alias screem="docker compose -f /opt/screem/infra/docker-compose.yml --env-file /opt/screem/infra/.env"' >> ~/.bashrc
```

## Atualização

```bash
cd /opt/screem && git pull
docker compose -f infra/docker-compose.yml --env-file infra/.env up -d --build api
```

Reiniciar a API derruba os sockets (o cliente reconecta sozinho), mas **não** derruba a mídia, que está no LiveKit.

## Observabilidade

- Logs: `docker compose ... logs -f api` (JSON do pino). Rotação já configurada: 10 MB x 5 arquivos por serviço.
- Healthcheck do `mongo` e da `api` no compose.
- Métricas Prometheus (`/metrics`, LiveKit `prometheus_port`): [planejado].
- Alertas mínimos: `/health` falhando, disco acima de 80%, CPU acima de 85% por 5 min.

## Backup e restauração

```bash
# cron diário às 03:00
0 3 * * * cd /opt/screem && bash infra/scripts/backup.sh >> /var/log/screem-backup.log 2>&1

# restaurar (pede confirmação, APAGA os dados atuais)
bash infra/scripts/restore.sh /var/backups/screem/screem-AAAA-MM-DD.gz
```

`BACKUP_DIR` (padrão `/var/backups/screem`) e `KEEP_DAYS` (padrão 7) são configuráveis. Copie os arquivos para fora da VPS. Teste a restauração a cada trimestre.

## Desenvolvimento local

```bash
cp apps/api/.env.example apps/api/.env
docker compose -f infra/docker-compose.dev.yml up -d   # Mongo (27017) + LiveKit dev (7880)
npm run dev:api
npm run dev:web
```

LiveKit em modo dev usa as chaves `devkey` / `secret`. Para parar: `docker compose -f infra/docker-compose.dev.yml down` (adicione `-v` para apagar o banco local).

## Dimensionamento

Mídia consome sobretudo **banda de saída** e CPU. Medir no piloto ([03-roadmap.md](../03-roadmap.md), Fase 9) e registrar aqui.

| Medição | Resultado |
|---|---|
| Participantes simultâneos estáveis | _a medir_ |
| Publicadores de vídeo simultâneos | _a medir_ |
| CPU média sob carga | _a medir_ |
| Banda de saída por espectador | _a medir_ |

## Solução de problemas

| Problema | Verificar |
|---|---|
| Caddy não emite certificado | DNS apontando certo, portas 80/443 livres, sem proxy da Cloudflare |
| Cookie não chega | `SESSION_COOKIE_DOMAIN`, HTTPS, domínios irmãos, `CORS_ORIGINS` |
| Socket não conecta | Proxy repassa WebSocket (Caddy faz por padrão); `withCredentials`; CORS |
| Conecta no LiveKit mas sem mídia | UDP 7882 aberto na VPS **e** no painel do provedor; `TURN_EXTERNAL_IP` correto; testar em 4G |
| Mídia só funciona em algumas redes | TURN: 3478 aberto, `TURN_PASSWORD` igual no Coturn e no LiveKit |
| API não sobe | `docker compose logs api`; variáveis em `apps/api/.env`; Mongo "healthy" |
| Bot não vê voz | Intent `GuildVoiceStates` e permissão "View Channels" na categoria |
| Embed duplicado | `announceMessageId` não gravado; logs da reconciliação |
