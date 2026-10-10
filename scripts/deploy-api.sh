#!/usr/bin/env bash
# Выкладка API на боевой сервер.
#
# Почему именно так. На сервере git не развёрнут: в /opt/magas-padel/api лежит
# копия исходников, а образ magas-padel-api собирается там же из Dockerfile.
# Значит выкладка — это синхронизация src и пересборка контейнера.
# Рядом на той же машине живёт чужой Supabase: трогаем только свою службу.
#
#   scripts/deploy-api.sh        — показать, что уедет, и ничего не делать
#   scripts/deploy-api.sh --go   — выложить
set -uo pipefail
HOST="${HOST:-xtrud-beget}"
SSHO="-o BatchMode=yes -o StrictHostKeyChecking=no"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE=/opt/magas-padel
G='\033[1;32m'; R='\033[1;31m'; N='\033[0m'

cd "$ROOT"

printf "${G}▸ Проверяю, что код вообще собирается${N}\n"
( cd server/api && npx tsc --noEmit ) || { printf "${R}✗ не компилируется — выкладывать нечего${N}\n"; exit 1; }

printf "${G}▸ Что разойдётся с сервером${N}\n"
rsync -azn --delete --itemize-changes -e "ssh $SSHO" server/api/src/ "$HOST:$REMOTE/api/src/" || exit 1

if [ "${1:-}" != "--go" ]; then
  printf "\nЭто был только показ. Выложить: scripts/deploy-api.sh --go\n"
  exit 0
fi

printf "${G}▸ Синхронизирую исходники${N}\n"
rsync -az --delete -e "ssh $SSHO" server/api/src/ "$HOST:$REMOTE/api/src/" || exit 1

printf "${G}▸ Пересобираю образ и перезапускаю службу${N}\n"
ssh $SSHO "$HOST" "cd $REMOTE && docker compose build api && docker compose up -d api" || exit 1

printf "${G}▸ Жду, пока служба станет здоровой${N}\n"
st=''
for _ in $(seq 1 30); do
  st=$(ssh $SSHO "$HOST" "docker inspect magas-api --format '{{.State.Health.Status}}' 2>/dev/null" | tr -d '\r')
  [ "$st" = healthy ] && break
  sleep 4
done
[ "$st" = healthy ] || { printf "${R}✗ служба не поднялась, состояние: %s${N}\n" "$st"; exit 1; }
printf "  здорова\n"

printf "${G}▸ Проверяю снаружи${N}\n"
code=$(curl -s -o /dev/null -w '%{http_code}' https://padelmagas.ru/api/club)
printf "  /api/club → HTTP %s\n" "$code"
[ "$code" = 200 ] || { printf "${R}✗ API снаружи не отвечает${N}\n"; exit 1; }

printf "${G}✓ API выложен${N}\n"
