#!/usr/bin/env bash
# Пересобирает веб-версию приложения и выкладывает на сервер.
# Использование: SSHPASS='пароль' scripts/build-app.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${HOST:-root@217.114.8.196}"
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=25"
if [ -n "${SSHPASS:-}" ]; then SSH="sshpass -e ssh $SSHO"; RSYNC="sshpass -e rsync"
else SSH="ssh $SSHO"; RSYNC="rsync"; fi

cd "$ROOT/mobile"
printf '\n\033[1;32m▸ Собираю веб-версию\033[0m\n'
rm -rf dist
npx expo export --platform web 2>&1 | tail -4

printf '\n\033[1;32m▸ Выкладываю\033[0m\n'
$RSYNC -az --delete -e "ssh $SSHO" dist/ "$HOST:/var/www/padelmagas/v1/"
$SSH "$HOST" 'chown -R www-data:www-data /var/www/padelmagas/v1
  find /var/www/padelmagas/v1 -type d -exec chmod 755 {} \;
  find /var/www/padelmagas/v1 -type f -exec chmod 644 {} \;'

printf '\n\033[1;32m▸ Проверка\033[0m\n'
for p in /v1/ /v1/grid /v1/tournaments /v1/bookings; do
  printf '  %-18s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://padel.217-114-8-196.sslip.io$p")"
done
printf '\n\033[1;32m✓ https://padel.217-114-8-196.sslip.io/v1/\033[0m\n\n'
