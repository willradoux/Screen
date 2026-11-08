# Infraestrutura e deploy

Tudo do backend roda em Docker numa VPS. O frontend roda na Vercel.

## Serviços (docker compose)

| Serviço | Imagem | Função | Exposição |
|---|---|---|---|
| `api` | build de `apps/api` | API, Socket.IO, bot | interna (3000) via proxy |
| `mongo` | `mongo:7` | Banco | **só rede interna** |
| `livekit` | `livekit/livekit-server` | SFU | 7880 (proxy), 7881/tcp, 50000-60000/udp |
| `coturn` | `coturn/coturn` | TURN/STUN | 3478, 5349, 49152-49252/udp |
| `caddy` | `caddy:2` | TLS e reverse proxy | 80, 443 |

## Domínios

| Host | Aponta para | Serviço |
|---|---|---|
| `app.exemplo.com` | Vercel (CNAME) | Frontend |
| `api.exemplo.com` | IP da VPS | Caddy -> api:3000 |
| `live.exemplo.com` | IP da VPS | Caddy -> livekit:7880 |
| `turn.exemplo.com` | IP da VPS | Coturn (sem proxy) |

DNS dos três últimos **sem proxy** (se usar Cloudflare, deixar "somente DNS").

## `docker-compose.yml` (esqueleto)

```yaml
services:
  mongo:
    image: mongo:7
    restart: unless-stopped
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
    volumes: [mongo_data:/data/db]
    networks: [internal]

  api:
    build: ./apps/api
    restart: unless-stopped
    env_file: ./apps/api/.env
    depends_on: [mongo, livekit]
    networks: [internal]

  livekit:
    image: livekit/livekit-server:latest   # fixar versão em produção
    restart: unless-stopped
    command: --config /etc/livekit.yaml
    volumes: [./infra/livekit/livekit.yaml:/etc/livekit.yaml:ro]
    ports:
      - "7881:7881"
      - "50000-60000:50000-60000/udp"
    networks: [internal]

  coturn:
    image: coturn/coturn:latest
    restart: unless-stopped
    network_mode: host                      # simplifica a faixa de relay
    volumes: [./infra/coturn/turnserver.conf:/etc/coturn/turnserver.conf:ro]

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./infra/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    networks: [internal]

networks: { internal: {} }
volumes: { mongo_data: {}, caddy_data: {} }
```

## `Caddyfile`

```
api.exemplo.com {
  reverse_proxy api:3000
}
live.exemplo.com {
  reverse_proxy livekit:7880
}
```

Socket.IO (WebSocket) passa pelo `reverse_proxy` sem configuração extra.

## `turnserver.conf` (essencial)

```
listening-port=3478
tls-listening-port=5349
realm=turn.exemplo.com
server-name=turn.exemplo.com
external-ip=<IP_PUBLICO_DA_VPS>
min-port=49152
max-port=49252
fingerprint
use-auth-secret
static-auth-secret=<TURN_SECRET>
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
no-cli
cert=/etc/letsencrypt/live/turn.exemplo.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.exemplo.com/privkey.pem
```

## Firewall (ufw)

```bash
ufw default deny incoming
ufw allow 22/tcp
ufw allow 80,443/tcp
ufw allow 7881/tcp
ufw allow 50000:60000/udp
ufw allow 3478/udp && ufw allow 3478/tcp
ufw allow 5349/tcp
ufw allow 49152:49252/udp
ufw enable
```

## Deploy passo a passo

1. Provisionar VPS (Ubuntu LTS), criar usuário não-root, SSH por chave.
2. Instalar Docker e plugin compose.
3. Apontar DNS dos hosts para o IP.
4. Clonar o repositório e criar `.env` a partir de `.env.example`.
5. Emitir certificado do TURN (certbot) ou usar o do Caddy.
6. `docker compose up -d --build`.
7. Conferir: `curl https://api.exemplo.com/api/v1/health` e `/ready`.
8. Registrar o webhook no `livekit.yaml` e reiniciar o LiveKit.
9. Convidar o bot, rodar `/config` (categoria, canais, cargos).
10. Deploy do frontend na Vercel com `VITE_API_URL`.

## Atualização

```bash
git pull
docker compose build api
docker compose up -d api        # downtime curto; Mongo e LiveKit não reiniciam
```

Reiniciar a API derruba sockets (reconexão automática no cliente) mas **não** derruba a mídia, que está no LiveKit.

## CI/CD [planejado]

GitHub Actions: build da imagem -> push no GHCR -> SSH na VPS -> `docker compose pull && up -d`.

## Observabilidade

- Logs: `docker compose logs -f api` (JSON do pino). Rotação: `max-size: 10m`, `max-file: 5`.
- Métricas: `/metrics` (Prometheus) protegido por rede interna [planejado]; LiveKit expõe métricas próprias (`prometheus_port`).
- Alertas mínimos: `/ready` falhando, disco > 80%, CPU > 85% por 5 min.

## Backup e restauração

```bash
# backup diário (cron)
docker compose exec -T mongo mongodump --archive --gzip -u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin > /backups/screem-$(date +%F).gz
# restauração
docker compose exec -T mongo mongorestore --archive --gzip --drop -u $MONGO_USER -p $MONGO_PASSWORD --authenticationDatabase admin < /backups/screem-AAAA-MM-DD.gz
```

Copiar os backups para fora da VPS. Testar restauração a cada trimestre.

## Dimensionamento

Mídia consome sobretudo **banda de saída** e CPU. Referência inicial para uma KVM pequena (2 vCPU, 8 GB, 8 TB/mês): dezenas de espectadores com poucos publicadores. Medir no piloto ([03-roadmap.md](../03-roadmap.md), Fase 9) e registrar os números reais aqui.

| Medição | Resultado |
|---|---|
| Participantes simultâneos estáveis | _a medir_ |
| Publicadores de vídeo simultâneos | _a medir_ |
| CPU média sob carga | _a medir_ |
| Banda de saída por espectador | _a medir_ |

## Desenvolvimento local

```bash
docker compose -f infra/docker-compose.dev.yml up -d   # mongo + livekit (modo dev)
npm run dev -w apps/api
npm run dev -w apps/web
```

LiveKit em modo dev: `livekit-server --dev` usa as chaves `devkey` / `secret`.

## Solução de problemas

| Problema | Verificar |
|---|---|
| Cookie não chega | `SESSION_COOKIE_DOMAIN`, HTTPS, domínios irmãos, `CORS_ORIGINS` |
| Socket não conecta | Proxy repassa WebSocket; `withCredentials`; CORS |
| Sem mídia em algumas redes | UDP 50000-60000 e TURN; testar em 4G |
| Bot não vê voz | Intent `GuildVoiceStates`, permissão "View Channels" na categoria |
| Embed duplicado | `announceMessageId` não gravado; logs da reconciliação |
