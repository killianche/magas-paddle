#!/usr/bin/env bash
# Стенд для работы над уведомлениями в Telegram.
#
# Поднимает отдельную базу, отдельный API и поддельный Telegram — данные клуба
# не участвуют, наружу ничего не уходит, всё слушает только 127.0.0.1.
# Поддельный Telegram запоминает отправленные сообщения, поэтому тексты видно
# целиком, вместе с разметкой, не заводя настоящего бота.
#
#   scripts/tests/tg-stand.sh up     — поднять (печатает пароль владельца)
#   scripts/tests/tg-stand.sh down   — убрать
#
# После up:
#   export STAND_PASS=<пароль из вывода>
#   node scripts/tests/tg-preview.js   — посмотреть тексты всех уведомлений
#   node scripts/tests/tg-allow.js     — проверка: отчёты только разрешённым ID
#   node scripts/tests/tg-owner.js     — проверка: раздел Telegram только владельцу
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DB=magas-test-db
DB_PORT=55432
API_PORT=3101
TG_PORT=3199
RUN="$ROOT/.stand"

say(){ printf '\033[1;32m▸ %s\033[0m\n' "$1"; }

down () {
  [ -f "$RUN/api.pid" ] && kill "$(cat "$RUN/api.pid")" 2>/dev/null || true
  [ -f "$RUN/tg.pid" ]  && kill "$(cat "$RUN/tg.pid")"  2>/dev/null || true
  docker rm -f "$DB" >/dev/null 2>&1 || true
  rm -rf "$RUN"
  say "стенд убран"
}

up () {
  down >/dev/null 2>&1 || true
  mkdir -p "$RUN"

  say "база на 127.0.0.1:$DB_PORT"
  docker run -d --name "$DB" -e POSTGRES_DB=magas -e POSTGRES_USER=magas \
    -e POSTGRES_PASSWORD=test -p "127.0.0.1:$DB_PORT:5432" postgres:16-alpine >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$DB" pg_isready -U magas -d magas >/dev/null 2>&1 && break; sleep 1
  done
  for f in "$ROOT"/server/sql/*.sql; do
    docker exec -i "$DB" psql -U magas -d magas -q -v ON_ERROR_STOP=1 < "$f" >/dev/null
  done
  say "схема применена ($(ls "$ROOT"/server/sql/*.sql | wc -l) файлов)"

  say "сборка API"
  cd "$ROOT/server/api"
  npx prisma generate >/dev/null 2>&1
  npx nest build >/dev/null

  say "поддельный Telegram на 127.0.0.1:$TG_PORT"
  node "$ROOT/scripts/tests/fake-tg.js" > "$RUN/tg.log" 2>&1 &
  echo $! > "$RUN/tg.pid"

  say "API на 127.0.0.1:$API_PORT"
  DATABASE_URL="postgresql://magas:test@127.0.0.1:$DB_PORT/magas" \
  ADMIN_KEY=test STAFF_PASS_KEY="$(python3 -c "print('ab'*32)")" \
  TELEGRAM_BOT_TOKEN=TEST TELEGRAM_BOT_NAME=stand_bot \
  TELEGRAM_API_BASE="http://127.0.0.1:$TG_PORT/bot" \
  TZ=Europe/Moscow PORT=$API_PORT node dist/main.js > "$RUN/api.log" 2>&1 &
  echo $! > "$RUN/api.pid"
  for _ in $(seq 1 40); do
    curl -sf --max-time 2 "http://127.0.0.1:$API_PORT/api/health" >/dev/null && break; sleep 1
  done

  PASS="$(DATABASE_URL="postgresql://magas:test@127.0.0.1:$DB_PORT/magas" \
    node tools/admin-user.js owner vladelec "Владелец клуба" 2>&1 | awk '/пароль:/{print $2}')"
  printf '\n\033[1;32m✓ стенд поднят\033[0m\n'
  printf '  API            http://127.0.0.1:%s/api\n' "$API_PORT"
  printf '  Telegram       http://127.0.0.1:%s (все сообщения: /botTEST/__sent)\n' "$TG_PORT"
  printf '  вход владельца vladelec / %s\n' "$PASS"
  printf '  логи           %s/api.log\n\n' "$RUN"
  printf '  export STAND_PASS=%s\n\n' "$PASS"
}

case "${1:-up}" in
  up) up ;;
  down) down ;;
  *) echo "использование: $0 up|down"; exit 1 ;;
esac
