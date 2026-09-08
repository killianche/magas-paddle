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

DOMAIN="${1:?укажите домен: scripts/set-domain.sh padel.example.ru}"
HOST="${HOST:-xtrud-beget}"
SERVER_IP="217.114.8.196"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

say(){ printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }
die(){ printf '\n\033[1;31m✗ %s\033[0m\n\n' "$1"; exit 1; }

# ---------- 1. Домен действительно наш? ----------
say "Проверяю, куда указывает $DOMAIN"
GOT="$(dig +short "$DOMAIN" A | tail -1)"
[ -n "$GOT" ] || die "$DOMAIN никуда не указывает. Добавьте у регистратора запись A: $DOMAIN → $SERVER_IP и подождите несколько минут."
[ "$GOT" = "$SERVER_IP" ] || die "$DOMAIN указывает на $GOT, а наш сервер $SERVER_IP. Поправьте запись A."
echo "  указывает на $GOT — верно"

# ---------- 2. nginx ----------
say "Настраиваю nginx на сервере"
ssh "$HOST" "DOMAIN='$DOMAIN' bash -s" <<'REMOTE'
set -euo pipefail
CONF=/etc/nginx/sites-available/padelmagas
# Добавляем новое имя к существующим, старое не убираем: по нему ещё ходят
# ранее собранные версии приложения
if ! grep -q "$DOMAIN" "$CONF"; then
  sed -i "s/^\(\s*server_name .*\)padel\.217-114-8-196\.sslip\.io/\1padel.217-114-8-196.sslip.io $DOMAIN/" "$CONF"
fi
nginx -t && systemctl reload nginx
grep -h "server_name" "$CONF" | head -3
REMOTE

# ---------- 3. Сертификат ----------
say "Выпускаю сертификат Let's Encrypt"
ssh "$HOST" "certbot --nginx -d '$DOMAIN' --expand --non-interactive --agree-tos \
  --register-unsafely-without-email --redirect 2>&1 | tail -6"

say "Проверяю сертификат"
echo | openssl s_client -connect "$DOMAIN:443" -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -subject -dates

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
