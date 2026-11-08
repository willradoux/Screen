# Teste de carga

> **Estado: ainda não executado.** Precisa da VPS (ou de uma máquina equivalente) com o LiveKit de verdade. Aqui está o plano, os comandos e a tabela para registrar os números reais. Enquanto a tabela estiver vazia, **não** assuma que o piloto aguenta 25 pessoas.

## O que medimos e por quê

A API (Node) é leve; quem pesa é a **mídia** (LiveKit): CPU para repassar vídeo e, principalmente, **banda de saída** (cada espectador recebe uma cópia de cada vídeo publicado). Meta do piloto: **25 participantes, 5 publicando vídeo** ([01-visao-geral.md](../01-visao-geral.md)).

Conta de bordo para a banda (por espectador): 4 vídeos de câmera (~1 Mbps com simulcast adaptativo) + 1 tela (~2 a 3 Mbps) ≈ **6 a 7 Mbps por pessoa**. Com 24 espectadores, ~150 a 170 Mbps de saída. Confira o plano de rede da VPS antes de testar.

## Ferramenta

O LiveKit traz o gerador de carga no CLI (`lk`). Instalação: <https://docs.livekit.io/home/cli/>. Rode **de outra máquina** (idealmente de outra rede), não da própria VPS, senão o teste não mede a rede de verdade.

```bash
# 5 publicadores de vídeo + 20 só assistindo, por 3 minutos, na sala de teste
lk load-test \
  --url wss://live.exemplo.com \
  --api-key "$LIVEKIT_API_KEY" --api-secret "$LIVEKIT_API_SECRET" \
  --room carga-teste \
  --video-publishers 5 \
  --subscribers 20 \
  --duration 3m
```

Variações para registrar: `--video-publishers 10`, `--subscribers 45`, e um teste só de áudio (`--audio-publishers 25`, sem vídeo) para medir o piso.

> A sala `carga-teste` não passa pela API do Screem (não é uma live), então este teste mede **só o LiveKit**. A API, o bot e o MongoDB têm cargas muito menores; veja o item “API” abaixo.

## Durante o teste, olhe

- **CPU e rede da VPS**: `docker stats`, `htop`, `nload`/`iftop`.
- **Saída do `lk load-test`**: pacotes perdidos e latência por assinante (o resumo no fim).
- **Prometheus** (perfil `monitoring`): `screem_process_resident_memory_bytes`, `screem_nodejs_eventloop_lag_p99_seconds` da API.
- **Logs do LiveKit**: `docker compose logs -f livekit` (erros de ICE/TURN, descartes).

## Critérios de aceite

| Item | Aceitável |
|---|---|
| CPU média da VPS com 25 pessoas / 5 vídeos | abaixo de 70% |
| Perda de pacotes nos espectadores | abaixo de 2% |
| Saída de rede | abaixo de 80% do contratado |
| Latência de vídeo (ida e volta) | abaixo de 300 ms |
| Event loop lag p99 da API | abaixo de 100 ms |

## API (carga leve)

O caminho quente da API é `POST /rooms/:id/join` (limitado a 20/min por pessoa). Para uma checagem rápida de que ela não degrada, use qualquer gerador HTTP com um cookie de sessão de teste, por exemplo:

```bash
# 200 requisições, 20 em paralelo, na lista de salas (precisa do cookie de uma sessão real)
npx autocannon -c 20 -a 200 -H "Cookie: screem_sid=<sessão de teste>" https://api.exemplo.com/api/v1/rooms
```

Espera-se dezenas de milissegundos por resposta; o `429` aparece se passar do limite (120/min por pessoa), o que é o comportamento certo.

## Resultados (preencher)

| Data | Cenário | CPU média | Banda de saída | Perda | Latência | Observações |
|---|---|---|---|---|---|---|
| _a medir_ | 25 pessoas, 5 vídeos | | | | | |
| _a medir_ | 25 pessoas, só áudio | | | | | |
| _a medir_ | 50 pessoas, 5 vídeos | | | | | |

Depois de medir, copie os números para a tabela de dimensionamento em [README.md](README.md#dimensionamento) e ajuste `maxParticipantsLive` (`/config limite-live`) para o que a VPS realmente aguenta.
