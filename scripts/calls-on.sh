#!/usr/bin/env bash
# Подтверждение номера звонком при РЕГИСТРАЦИИ: включить или выключить.
#
# Это тот самый выключатель `phone_verify_on` из админки («Управление» →
# «Приложение»). Скрипт нужен, когда до админки не добраться.
#
# ВАЖНО, что он НЕ трогает: возврат забытого пароля звонком. Тот работает,
# пока на сервере задан SMSRU_API_ID, и от этого выключателя не зависит (D46).
#
# Чем грозит включение: сборки приложения, которые про звонок не знают,
# не присылают подтверждение и получают отказ при регистрации. На 10.10.2026
# это версия 1.0.2 (сборка 65) из App Store. Версия 1.0.4 умеет звонок,
# но ещё ждёт проверки Apple. Выключается тем же скриптом за секунду.
#
#   scripts/calls-on.sh          — показать, как сейчас
#   scripts/calls-on.sh --on     — включить проверку при регистрации
#   scripts/calls-on.sh --off    — выключить
set -uo pipefail
HOST="${HOST:-xtrud-beget}"
SSHO="-o BatchMode=yes -o StrictHostKeyChecking=no"
API="${API:-https://padelmagas.ru/api}"
G='\033[1;32m'; Y='\033[1;33m'; N='\033[0m'

show () {
  printf "${G}▸ Как сейчас отвечает клуб${N}\n"
  curl -s "$API/club" | python3 -c "
import sys, json
d = json.load(sys.stdin)
print('  подтверждение при регистрации:', 'включено' if d.get('phoneVerifyOn') else 'выключено')
print('  возврат пароля звонком:       ', 'работает' if d.get('callResetOn') else 'недоступен')
print('  вход начинается с номера:     ', 'да' if d.get('phoneGate') else 'нет')
"
}

flip () {   # $1 = true|false
  printf "${G}▸ Ставлю phone_verify_on = %s${N}\n" "$1"
  ssh $SSHO "$HOST" \
    "docker exec magas-db psql -U magas -d magas -t -A -c \
     \"update settings set phone_verify_on = $1 where id = 1 returning phone_verify_on;\"" \
    || return 1
  printf "${Y}▸ Жду, пока служба забудет прежнее значение (кэш 15 с)${N}\n"
  sleep 18
}

case "${1:-}" in
  --on)
    show
    flip true || exit 1
    show
    printf "${Y}Если что-то пойдёт не так: scripts/calls-on.sh --off${N}\n"
    ;;
  --off)
    show
    flip false || exit 1
    show
    ;;
  *)
    show
    printf "\nВключить: scripts/calls-on.sh --on   ·   Выключить: scripts/calls-on.sh --off\n"
    ;;
esac
