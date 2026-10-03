#!/usr/bin/env bash
# Переезд на настоящий домен вместо padel.217-114-8-196.sslip.io.
#
# Зачем: sslip.io — бесплатный сервис подстановки адреса в имя, делегированный
# на nip.io. В России такие имена режет техника блокировки по имени соединения,
# из-за чего приложение работало только через VPN. Сервер при этом здоров
# и стоит в России, у Beget.
#
# Что делает: проверяет, что домен указывает на наш сервер, настраивает nginx,
# выпускает сертификат, переключает приложение и выкладывает всё заново.
#
# Использование:
#   scripts/set-domain.sh padel.xtrud.pro
#   scripts/set-domain.sh magaspadel.ru
#
# Перед запуском у регистратора нужна запись:
#   тип A, имя <поддомен>, значение 217.114.8.196
set -euo pipefail

DOMAIN="${1:?укажите домен: scripts/set-domain.sh padelmagas.ru www.padelmagas.ru}"
# Остальные имена — те же страницы под другим написанием (чаще всего www).
# Сертификат и server_name получают их вместе с основным.
shift
EXTRA=("$@")
ALL=("$DOMAIN" "${EXTRA[@]}")
HOST="${HOST:-xtrud-beget}"
SERVER_IP="217.114.8.196"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

say(){ printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n\n' "$1"; exit 1; }

# ---------- 1. Домен действительно наш? ----------
say "Проверяю, куда указывают имена"
for d in "${ALL[@]}"; do
  GOT="$(dig +short "$d" A | tail -1)"
  [ -n "$GOT" ] || die "$d никуда не указывает. Добавьте у регистратора запись A: $d → $SERVER_IP и подождите, пока разойдётся."
  [ "$GOT" = "$SERVER_IP" ] || die "$d указывает на $GOT, а наш сервер $SERVER_IP. Поправьте запись A."
  echo "  $d → $GOT, верно"
done

# ---------- 2. Сертификат ----------
# Сначала бумага, потом имя: если сперва добавить server_name, nginx начнёт
# отвечать на новое имя сертификатом от старого — и браузер покажет ошибку.
#
# Расширяем существующий сертификат, а не выпускаем второй: тогда пути к файлам
# в конфиге остаются прежними и certbot не трогает настройку nginx.
# Проверка домена — через каталог сайта: блок на 80 порту (server_name _)
# отвечает на любое имя и отдаёт /var/www/padelmagas.
say "Добавляю имена в сертификат Let's Encrypt"
CERT_ARGS="-d padel.217-114-8-196.sslip.io"
for d in "${ALL[@]}"; do CERT_ARGS="$CERT_ARGS -d $d"; done
ssh "$HOST" "certbot certonly --webroot -w /var/www/padelmagas \
  --cert-name padel.217-114-8-196.sslip.io $CERT_ARGS \
  --expand --non-interactive --agree-tos --register-unsafely-without-email 2>&1 | tail -8"

# ---------- 3. nginx ----------
say "Добавляю имена в nginx"
ssh "$HOST" "NAMES='${ALL[*]}' bash -s" <<'REMOTE'
set -euo pipefail
# Имя падела стоит в блоке HTTPS, а не в padelmagas: там server_name _ и порт 80
CONF=/etc/nginx/sites-available/padelmagas-ssl
cp -a "$CONF" "$CONF.bak-$(date +%Y%m%d-%H%M%S)"
# Новое имя добавляем к старому, старое не убираем: по нему ходят
# ранее собранные версии приложения
for DOMAIN in $NAMES; do
  if ! grep -q " $DOMAIN[ ;]" "$CONF"; then
    sed -i "s/^\(\s*server_name .*\)padel\.217-114-8-196\.sslip\.io/\1padel.217-114-8-196.sslip.io $DOMAIN/" "$CONF"
  fi
  grep -q " $DOMAIN[ ;]" "$CONF" || { echo "не удалось добавить $DOMAIN в $CONF"; exit 1; }
done
nginx -t && systemctl reload nginx
grep -h "server_name" "$CONF"
REMOTE

say "Проверяю сертификат"
echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -dates -ext subjectAltName

# ---------- 4. Приложение ----------
say "Переключаю приложение на $DOMAIN"
python3 - "$DOMAIN" <<'PY'
import json, pathlib, sys, collections
domain = sys.argv[1]
p = pathlib.Path('mobile/app.json')
cfg = json.load(p.open(), object_pairs_hook=collections.OrderedDict)
cfg['expo']['extra']['apiUrl'] = f'https://{domain}/api'
json.dump(cfg, p.open('w'), ensure_ascii=False, indent=2)
p.open('a').write('\n')
print('  apiUrl =', cfg['expo']['extra']['apiUrl'])
PY

say "Собираю и выкладываю веб-версию"
"$ROOT/scripts/build-app.sh"

say "Проверяю через новый домен"
for p in / /api/courts "/v1/"; do
  printf '  %-14s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN$p")"
done

cat <<EOF

Готово. Осталось:
  1. Собрать новую версию для TestFlight — в ней будет новый адрес сервера
  2. Поменять адрес политики конфиденциальности в App Store Connect
     на https://$DOMAIN/privacy.html

EOF
