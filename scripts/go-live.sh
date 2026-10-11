#!/usr/bin/env bash
# «Как только Apple одобрит — включить всё» (распоряжение заказчика 10.10.2026).
#
# Скрипт безопасно запускать сколько угодно раз: пока версия не одобрена, он
# ничего не делает и так и говорит. После одобрения включает подтверждение
# звонком при регистрации и досылает свежую сборку на бета-проверку TestFlight.
#
# Почему ждём одобрения: до него в App Store лежит версия 1.0.2, которая про
# звонок не знает. Включи проверку раньше — и скачавший из магазина не сможет
# завести аккаунт.
#
#   scripts/go-live.sh         — посмотреть, пора ли
#   scripts/go-live.sh --go    — включить, если пора
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
G='\033[1;32m'; Y='\033[1;33m'; N='\033[0m'

STATE=$(python3 - <<'PY'
import importlib.util, pathlib
spec = importlib.util.spec_from_file_location('asc', pathlib.Path('scripts/asc/asc.py'))
asc = importlib.util.module_from_spec(spec); spec.loader.exec_module(asc)
st, out = asc.call('GET', '/v1/apps/6808335944/appStoreVersions?limit=1')
d = (out.get('data') or [{}])[0].get('attributes', {})
print(f"{d.get('versionString','?')} {d.get('appStoreState','?')}")
PY
)
VER=${STATE%% *}; APPSTORE=${STATE##* }
printf "${G}▸ Версия %s в магазине: %s${N}\n" "$VER" "$APPSTORE"

case "$APPSTORE" in
  READY_FOR_SALE|PENDING_DEVELOPER_RELEASE|PROCESSING_FOR_APP_STORE)
    printf "${G}  одобрено — пора включать${N}\n" ;;
  *)
    printf "${Y}  ещё не одобрено, ничего не трогаю${N}\n"
    exit 0 ;;
esac

if [ "${1:-}" != "--go" ]; then
  printf "\nВключить: scripts/go-live.sh --go\n"
  exit 0
fi

printf "${G}▸ Включаю подтверждение звонком при регистрации${N}\n"
scripts/calls-on.sh --on || exit 1

printf "${G}▸ Досылаю свежую сборку на бета-проверку TestFlight${N}\n"
# Отдельным скриптом: release.py выпускает версию целиком и на уже вышедшей
# версии буксует. Здесь нужно одно действие, и оно не обязательное.
python3 scripts/asc/beta-submit.py --go || printf "${Y}  TestFlight подождёт, магазину это не мешает${N}\n"

printf "${G}✓ Включено${N}\n"
printf "Откат, если понадобится: scripts/calls-on.sh --off\n"
