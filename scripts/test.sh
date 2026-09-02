#!/usr/bin/env bash
# Прогон проверок по выложенной веб-версии приложения.
# Использование: scripts/test.sh [адрес]
# Браузер запускается только на этом сервере, ничего на машине заказчика не открывается.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export NODE_PATH="${NODE_PATH:-/root/.npm/_npx/aa1f6563a672b75d/node_modules}"
cd "$ROOT/scripts/tests"

fail=0
run () {
  printf '\n\033[1;32m════ %s ════\033[0m\n' "$2"
  node "$1" || fail=1
}
run audit.js   "Маршруты: открываются, без ошибок в консоли"
run flow2.js   "Сценарии: запись, отмена, турнир, увод слота"
run metrics.js "Размеры целей и переполнение на 320-430 pt"
run a11y.js    "Доступность: озвучивание и состояния"

if [ "$fail" = 0 ]; then
  printf '\n\033[1;32m✓ Все наборы прошли\033[0m\n\n'
else
  printf '\n\033[1;31m✗ Есть провалы, смотрите вывод выше\033[0m\n\n'; exit 1
fi
