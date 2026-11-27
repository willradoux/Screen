# Sair do Coolify: Caddy + compose + deploy pelo GitHub

Depois da troca, a VPS roda **um compose só** (`infra/docker-compose.yml`), com o **Caddy** na frente
(HTTPS automático) e a **LP num container próprio**. Tudo num domínio só:

| Endereço | O que é | Container |
|---|---|---|
| `screen.willradoux.com/` | a LP (a TV) | `landing` |
| `screen.willradoux.com/dashboard` | salas (início de quem está logado) | `web` |
| `screen.willradoux.com/call/<sala>` | a chamada | `web` |
| `screen.willradoux.com/r/<sala>` | link antigo do bot: redireciona para `/call/<sala>` | `web` |
| `/admin`, `/reunioes`, `/login`... | o resto do app | `web` |

As imagens são montadas pelo **GitHub Actions** e a VPS só baixa e reinicia o que mudou.

```
VPS (sem Coolify)
├─ caddy     80/443, HTTPS automático
│   ├─ APP_DOMAIN /, /lp/*  → landing  (a LP, a TV)
│   ├─ APP_DOMAIN o resto   → web      (o app)
│   ├─ API_DOMAIN           → api:3000
│   └─ LIVE_DOMAIN          → livekit:7880
├─ web, landing   nginx com os arquivos prontos
├─ api            Node (API, Socket.IO, bot)
├─ mongo, redis   só rede interna
├─ livekit        7881/tcp e 7882/udp direto (o vídeo não passa pelo proxy)
├─ egress         gravação
└─ coturn         rede do host (3478 e 49152-49252/udp)
```

**Por quê:** o Coolify roda vários containers dele (painel, banco, Redis, Traefik) numa VPS de 1 núcleo,
e o deploy automático dele quebrou. Sem ele sobra CPU para o vídeo, e cada deploy só reinicia o que
mudou: mexer na LP ou no visual não derruba ninguém da call.

> A troca deixa o site **fora do ar por uns 15 a 30 minutos**. Faça num horário sem live.

---

## Antes do dia (sem derrubar nada)

### 1. DNS
Nada muda: `screen`, `api.screen`, `live.screen` e o do TURN continuam apontando para a VPS, **sem
proxy** da Cloudflare (nuvem cinza).

### 2. Discord
No [portal de desenvolvedores](https://discord.com/developers/applications) > OAuth2 > Redirects, o
endereço continua o mesmo: `https://API_DOMAIN/api/v1/auth/discord/callback`. Nada a fazer se a API
mantiver o domínio.

### 3. GitHub (Settings > Secrets and variables > Actions)
**Variables:**

| Nome | Exemplo |
|---|---|
| `APP_DOMAIN` | `screen.willradoux.com` |
| `API_DOMAIN` | `api.screen.willradoux.com` |

**Secrets:**

| Nome | O que é |
|---|---|
| `VPS_HOST` | IP da VPS |
| `VPS_USER` | usuário do SSH (ex.: `deploy`, num grupo `docker`) |
| `VPS_SSH_KEY` | chave privada **só para o deploy** (gere uma nova: `ssh-keygen -t ed25519 -f deploy`) |
| `VPS_PATH` | opcional; padrão `/opt/screen` |

Na VPS, ponha a chave pública (`deploy.pub`) em `~/.ssh/authorized_keys` desse usuário.

### 4. Imagens no GHCR
Rode o workflow **Deploy** uma vez pelo botão "Run workflow" (aba Actions). Ele monta `screen-api`,
`screen-web` e `screen-landing` e guarda em `ghcr.io/willradoux/`. O passo de SSH vai falhar enquanto a
VPS não estiver pronta; tudo bem, as imagens ficam salvas.

Os pacotes do GHCR nascem **privados**. Escolha um:
- deixe públicos (GitHub > seu perfil > Packages > cada pacote > Package settings > Change visibility); ou
- na VPS, faça login uma vez com um token que só lê pacotes (`read:packages`):
  `echo TOKEN | docker login ghcr.io -u willradoux --password-stdin`

### 5. Preparar a pasta na VPS
```bash
sudo mkdir -p /opt/screen && sudo chown $USER /opt/screen
git clone https://github.com/willradoux/Screen.git /opt/screen
cd /opt/screen
cp infra/.env.example infra/.env && chmod 600 infra/.env
nano infra/.env   # copie os valores da aba "Environment Variables" do Coolify
```
Confira o arquivo: `docker compose -f infra/docker-compose.yml --env-file infra/.env config > /dev/null`
(sem erro = tudo preenchido).

---

## No dia da troca

### 1. Snapshot da VPS
No hPanel da Hostinger: VPS > Snapshots > criar. É a garantia de voltar se algo der errado.

### 2. Backup do banco (de dentro do Coolify)
Descubra o container do Mongo do Coolify e tire o dump:
```bash
docker ps --format '{{.Names}}' | grep -i mongo
docker exec NOME_DO_MONGO mongodump --archive --gzip \
  -u "USUARIO" -p "SENHA" --authenticationDatabase admin > ~/screen-antes-da-troca.gz
ls -lh ~/screen-antes-da-troca.gz   # não pode estar vazio
```
(Usuário e senha são o `MONGO_USER` e o `MONGO_PASSWORD` do Coolify.)

### 3. Desligar o Coolify
No painel, pare o recurso do Screen (Stop). Depois pare o próprio Coolify, que ocupa as portas 80/443:
```bash
docker stop $(docker ps -q --filter name=coolify)
docker ps   # não deve sobrar nada nas portas 80 e 443
```

### 4. Subir a stack nova
```bash
cd /opt/screen
C="docker compose -f infra/docker-compose.yml --env-file infra/.env"
$C pull
$C up -d mongo
bash infra/scripts/restore.sh ~/screen-antes-da-troca.gz   # digite "sim"
$C up -d
$C ps            # tudo "Up" (api e web "healthy" em ~1 min)
$C logs caddy | grep -i certificate   # o Caddy tira os certificados na hora
```

### 5. Firewall
```bash
sudo bash infra/scripts/ufw.sh
```

### 6. Testar
- `screen.willradoux.com` abre a LP e o "Entrar com Discord" leva ao login e volta em `/dashboard`.
- Um link antigo de sala (`/r/...`) abre a mesma sala em `/call/...`.
- Login, criar/entrar numa sala, câmera, tela, chat e o bot (`/screen link`).
- `curl https://API_DOMAIN/api/v1/health` responde.

### Se der ruim
```bash
$C down
docker start $(docker ps -aq --filter name=coolify)
```
E no painel do Coolify, Start no recurso do Screen. O banco do Coolify não foi mexido.
Em último caso, restaure o snapshot da Hostinger.

### Depois que tudo estiver estável (alguns dias)
Desinstale o Coolify para liberar a CPU e o disco: siga a [documentação oficial](https://coolify.io/docs/get-started/uninstallation).
Programe o backup diário do banco (`crontab -e`):
```
0 3 * * * cd /opt/screen && bash infra/scripts/backup.sh >> /var/log/screen-backup.log 2>&1
```

---

## Deploy do dia a dia
É só dar push no `main`. Depois que o CI passa, o workflow **Deploy**:
1. vê o que mudou desde o último deploy;
2. monta só as imagens que mudaram (`api`, `web`, `landing`) e guarda no GHCR;
3. entra na VPS por SSH, baixa essas imagens e recria só esses containers.

Mudou só a LP: só o `landing` reinicia. Mudou o visual do app: só o `web`. Ninguém cai da call.

**Voltar uma versão:** cada imagem também é salva com o nome do commit. Na VPS:
```bash
IMAGE_TAG=<commit> docker compose -f infra/docker-compose.yml --env-file infra/.env up -d web
```

**Mudar um domínio:** altere no `infra/.env` da VPS **e** nas Variables do GitHub (web e landing levam
os endereços dentro do JavaScript), depois rode o Deploy pelo botão "Run workflow".
