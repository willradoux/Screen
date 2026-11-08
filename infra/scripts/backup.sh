#!/usr/bin/env bash
# Backup diário do MongoDB. Exemplo de cron (03:00):
#   0 3 * * * cd /opt/screem && bash infra/scripts/backup.sh >> /var/log/screem-backup.log 2>&1
# Variáveis lidas de infra/.env. Copie os arquivos de BACKUP_DIR para fora da VPS.
set -euo pipefail

cd "$(dirname "$0")/../.."
set -a; source infra/.env; set +a

BACKUP_DIR="${BACKUP_DIR:-/var/backups/screem}"
KEEP_DAYS="${KEEP_DAYS:-7}"
mkdir -p "$BACKUP_DIR"

FILE="$BACKUP_DIR/screem-$(date +%F).gz"
docker compose -f infra/docker-compose.yml --env-file infra/.env exec -T mongo \
  mongodump --archive --gzip -u "$MONGO_USER" -p "$MONGO_PASSWORD" --authenticationDatabase admin \
  > "$FILE"

find "$BACKUP_DIR" -name 'screem-*.gz' -mtime +"$KEEP_DAYS" -delete
echo "Backup criado: $FILE ($(du -h "$FILE" | cut -f1))"
