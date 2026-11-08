#!/usr/bin/env bash
# Restaura um backup do MongoDB (APAGA os dados atuais). Uso:
#   bash infra/scripts/restore.sh /var/backups/screem/screem-2026-11-08.gz
set -euo pipefail

FILE="${1:?Informe o arquivo de backup}"
[ -f "$FILE" ] || { echo "Arquivo não encontrado: $FILE"; exit 1; }

cd "$(dirname "$0")/../.."
set -a; source infra/.env; set +a

read -r -p "Isso substitui o banco atual. Digite 'sim' para continuar: " ok
[ "$ok" = "sim" ] || { echo "Cancelado."; exit 1; }

docker compose -f infra/docker-compose.yml --env-file infra/.env exec -T mongo \
  mongorestore --archive --gzip --drop -u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin \
  < "$FILE"
echo "Restauração concluída."
