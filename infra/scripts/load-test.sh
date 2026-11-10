#!/usr/bin/env bash
# Teste de estresse do LiveKit: simula palestrantes publicando e uma plateia assistindo.
# Mede o servidor de mídia (o gargalo de uma reunião grande); o login do Discord não entra.
#
# Uso (de um computador que NÃO seja o servidor testado, para o teste ser honesto):
#   LIVEKIT_URL=wss://live.exemplo.com LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... \
#     ./infra/scripts/load-test.sh [plateia] [palestrantes] [segundos]
#   ex.: ./infra/scripts/load-test.sh 100 2 120   (suba de 100 em 100 até quebrar)
#
# Enquanto roda, abra no servidor:  docker stats   e   htop   (CPU, memória e rede do LiveKit).
set -euo pipefail

: "${LIVEKIT_URL:?defina LIVEKIT_URL (wss://...)}"
: "${LIVEKIT_API_KEY:?defina LIVEKIT_API_KEY}"
: "${LIVEKIT_API_SECRET:?defina LIVEKIT_API_SECRET}"

SUBSCRIBERS="${1:-100}"
PUBLISHERS="${2:-2}"
DURATION="${3:-120}"
ROOM="teste-estresse-$(date +%s)"

echo "Sala $ROOM: $PUBLISHERS palestrante(s) com vídeo+áudio, $SUBSCRIBERS espectadores, ${DURATION}s"
docker run --rm --network host livekit/livekit-cli:latest load-test \
  --url "$LIVEKIT_URL" \
  --api-key "$LIVEKIT_API_KEY" \
  --api-secret "$LIVEKIT_API_SECRET" \
  --room "$ROOM" \
  --video-publishers "$PUBLISHERS" \
  --audio-publishers "$PUBLISHERS" \
  --subscribers "$SUBSCRIBERS" \
  --duration "${DURATION}s"
