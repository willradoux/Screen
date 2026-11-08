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
### Métricas (Prometheus)

A API expõe métricas em **`METRICS_PORT`** (o compose usa `9100`), numa porta **separada e interna**: o compose não publica essa porta e o Caddy não a encaminha, então só quem está na rede do Docker alcança. Nunca publique essa porta nem a coloque atrás do proxy público.

Subir com o Prometheus (opcional, perfil `monitoring`):

```bash
docker compose -f infra/docker-compose.yml --env-file infra/.env --profile monitoring up -d prometheus
# interface em http://localhost:9090 por túnel SSH (a porta não é publicada):
ssh -L 9090:$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' screem-prometheus-1):9090 usuario@vps
```

O que existe (todas com prefixo `screem_`):

| Métrica | Tipo | O que mostra |
|---|---|---|
| `http_requests_total{method,route,status}` | contador | Requisições por rota (padrão, ex.: `/api/v1/rooms/:id`, nunca o caminho real) e status |
| `http_request_duration_seconds{method,route}` | histograma | Duração das requisições |
| `logins_total{result}` | contador | `ok` ou o código da falha (`NOT_IN_GUILD`, `INVALID_STATE`...) |
| `livekit_webhook_events_total{event}` | contador | Eventos recebidos do LiveKit (só os com assinatura válida) |
| `audit_actions_total{action}` | contador | Ações de moderação, reuniões e configurações |
| `scheduler_actions_total{kind}` | contador | `opened`, `reminded`, `ended` pelo agendador |
| `socket_connections` | medidor | Conexões Socket.IO abertas |
| `rooms_open{type}` | medidor | Salas abertas (`LIVE`, `MEETING`) |
| `participants_connected` | medidor | Pessoas conectadas às salas |
| `bot_ready` | medidor | `1` se o bot está conectado ao Discord |
| `process_*`, `nodejs_*` | padrão | CPU, memória, event loop, GC |

As métricas não carregam dados pessoais: nenhum rótulo é ID de usuário, nome ou token (há teste para isso). `rooms_open` e `participants_connected` vêm do banco e são atualizados a cada leitura de `/metrics`.

Alertas prontos em [`infra/prometheus/alerts.yml`](../../infra/prometheus/alerts.yml): API fora do ar, bot desconectado, mais de 5% de erros 5xx, LiveKit sem enviar eventos com gente na sala, pico de falhas de login, event loop lento e memória alta. **Os limites são chutes iniciais**: ajuste depois de ver o uso real. Para o LiveKit, ative `prometheus_port` no `livekit.yaml` e descomente o job em `infra/prometheus/prometheus.yml`.

Faltam alertas de disco e CPU **da VPS**; eles vêm do `node_exporter` ou do painel da hospedagem, não da aplicação.

## Backup e restauração

> **Teste a restauração antes de precisar dela.** Um backup que nunca foi restaurado é uma esperança, não um backup. Procedimento (leva 5 minutos, numa máquina com Docker):
>
> 1. `bash infra/scripts/backup.sh` e confira que `screem-AAAA-MM-DD.gz` foi criado e não está vazio.
> 2. Num ambiente **de teste** (nunca na produção): suba um MongoDB limpo e rode `bash infra/scripts/restore.sh <arquivo>`.
> 3. Confira os números: `docker compose exec mongo mongosh -u ... --eval 'db.getSiblingDB("screem").rooms.countDocuments()'` e `audit_logs`, `users`.
> 4. Anote a data do teste abaixo.
>
> Último teste de restauração: _nunca executado_.

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

Mídia consome sobretudo **banda de saída** e CPU. O roteiro de medição está em [teste-de-carga.md](teste-de-carga.md); registre os números aqui. Para testar tudo com o Discord de verdade antes da VPS, siga [teste-real.md](teste-real.md).

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
