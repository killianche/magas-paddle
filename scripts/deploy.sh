#!/usr/bin/env bash
# Полное развёртывание сайта проекта на чистый сервер.
# Ставит nginx, собирает страницы, копирует шрифты и картинки, настраивает раздачу.
# Идемпотентен: можно запускать повторно.
#
# Использование:
#   SSHPASS='пароль' scripts/deploy.sh root@IP
#   scripts/deploy.sh root@IP            (если настроен вход по ключу)
set -euo pipefail

HOST="${1:?укажите хост: root@IP}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAGE="$(mktemp -d)"
SSHO="-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=25"

if [ -n "${SSHPASS:-}" ]; then SSH="sshpass -e ssh $SSHO"; RSYNC="sshpass -e rsync"
else SSH="ssh $SSHO"; RSYNC="rsync"; fi

say(){ printf '\n\033[1;32m▸ %s\033[0m\n' "$1"; }

# ---------- 1. Сборка страниц ----------
say "Собираю страницы"
"$ROOT/scripts/build.sh" "$STAGE" >/dev/null

wrap () { # $1=исходник $2=результат $3=viewport
  python3 - "$1" "$2" "$3" <<'PY'
import sys
src=open(sys.argv[1],encoding='utf-8').read()
src=src.replace('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Golos+Text:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap">','<link rel="stylesheet" href="/fonts.css">')
i=src.find('</style>')+len('</style>')
open(sys.argv[2],'w',encoding='utf-8').write(
 '<!doctype html>\n<html lang="ru"><head>\n<meta charset="utf-8">\n'
 '<meta name="viewport" content="'+sys.argv[3]+'">\n'
 '<meta name="robots" content="noindex,nofollow">\n<meta name="theme-color" content="#0B0F0C">\n'
 '<link rel="icon" href="/favicon.png" type="image/png">\n'+src[:i]+'\n</head><body>\n'+src[i:]+'\n</body></html>')
PY
}
wrap "$ROOT/design/demo.html"       "$STAGE/demo.html"       "width=device-width,initial-scale=1,viewport-fit=cover"
wrap "$ROOT/design/admin-demo.html" "$STAGE/admin-demo.html" "width=device-width,initial-scale=1"
wrap "$ROOT/design/index-src.html"  "$STAGE/index.html"      "width=device-width,initial-scale=1"
wrap "$ROOT/design/manager-src.html" "$STAGE/manager.html"   "width=device-width,initial-scale=1"
# Политика конфиденциальности. Адрес /privacy.html выдан Apple при подаче
# приложения — менять его нельзя, а без страницы по нему ревью отклоняют
# по правилу 5.1.1.
wrap "$ROOT/design/privacy-src.html" "$STAGE/privacy.html"   "width=device-width,initial-scale=1"

# ---------- 2. Статика ----------
say "Готовлю шрифты, картинки и иконку"
mkdir -p "$STAGE/fonts" "$STAGE/img"
if [ -d "$ROOT/assets/fonts" ]; then
  cp "$ROOT/assets/fonts/"* "$STAGE/fonts/" && cp "$ROOT/assets/fonts.css" "$STAGE/fonts.css"
else
  UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36'
  URL='https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Golos+Text:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap'
  curl -sS -A "$UA" "$URL" -o "$STAGE/gf.css"
  grep -o 'https://fonts.gstatic.com/[^)]*\.woff2' "$STAGE/gf.css" | sort -u | while read -r u; do
    curl -sS -o "$STAGE/fonts/$(basename "$u")" "$u"; done
  sed 's|https://fonts.gstatic.com/[^)]*/\([^/)]*\.woff2\)|fonts/\1|g' "$STAGE/gf.css" > "$STAGE/fonts.css"
  rm -f "$STAGE/gf.css"
fi
[ -d "$ROOT/assets/img" ] && cp "$ROOT/assets/img/"*.webp "$STAGE/img/" 2>/dev/null || true

cp "$ROOT/design/manager-favicon.png" "$STAGE/favicon.png"
printf 'User-agent: *\nDisallow: /\n' > "$STAGE/robots.txt"

# ---------- 3. Сервер ----------
say "Ставлю nginx на $HOST"
$SSH "$HOST" 'export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null 2>&1
  apt-get install -y -qq nginx rsync >/dev/null 2>&1
  mkdir -p /var/www/padelmagas
  nginx -v 2>&1'

say "Копирую файлы"
# --exclude обязателен: в /v1 лежит веб-версия приложения, её кладёт
# build-app.sh; в /uploads — фото площадок, которые клуб загрузил из админки,
# их --delete иначе стёр бы при каждом выкладывании сайта.
# scripts/build-app.sh. Без исключения --delete стирал приложение целиком.
$RSYNC -az --delete --exclude 'v1/' --exclude 'uploads/' -e "ssh $SSHO" "$STAGE/" "$HOST:/var/www/padelmagas/"

say "Настраиваю раздачу"
$SSH "$HOST" 'cat > /etc/nginx/sites-available/padelmagas <<'"'"'CONF'"'"'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /var/www/padelmagas;
    index index.html;

    add_header X-Robots-Tag "noindex, nofollow" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;

    gzip on; gzip_comp_level 6; gzip_min_length 512;
    gzip_types text/plain text/css application/javascript image/svg+xml application/json;

    location / { try_files $uri $uri/ =404; }
    location /fonts/ { expires 30d; add_header Cache-Control "public, immutable"; }
    location /img/   { expires 30d; add_header Cache-Control "public, immutable"; }
    location = /fonts.css { expires 7d; }

    access_log /var/log/nginx/padelmagas.access.log;
    error_log  /var/log/nginx/padelmagas.error.log;
}
CONF
rm -f /etc/nginx/sites-enabled/default
ln -sfn /etc/nginx/sites-available/padelmagas /etc/nginx/sites-enabled/padelmagas
chown -R www-data:www-data /var/www/padelmagas
find /var/www/padelmagas -type d -exec chmod 755 {} \;
find /var/www/padelmagas -type f -exec chmod 644 {} \;
# Фото площадок пишет приложение из контейнера от имени node (uid 1000).
# Общий chown выше отдал бы папку www-data, и загрузка из админки падала бы
# с «permission denied». Читать nginx может и так: права 755 и 644.
mkdir -p /var/www/padelmagas/uploads
chown -R 1000:1000 /var/www/padelmagas/uploads
nginx -t && systemctl enable --now nginx >/dev/null 2>&1 && systemctl reload nginx
echo "готово"'

rm -rf "$STAGE"
IP="${HOST#*@}"
say "Проверяю"
for p in / /demo.html /admin-demo.html /app.html /admin.html /fonts.css; do
  printf '  %-18s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "http://$IP$p")"
done
printf '\n\033[1;32m✓ Сайт: http://%s/\033[0m\n\n' "$IP"
