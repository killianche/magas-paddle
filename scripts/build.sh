#!/usr/bin/env bash
# Собирает автономные страницы сайта из макетов в design/.
# Подставляет локальные шрифты вместо Google Fonts и добавляет панель навигации.
# Использование: scripts/build.sh <каталог_сборки>
set -euo pipefail
OUT="${1:?укажите каталог сборки}"
SRC="$(cd "$(dirname "$0")/.." && pwd)/design"
mkdir -p "$OUT"

nav () { # $1 = активная страница
  cat <<HTML
<nav class="sitebar">
  <a class="sb-h" href="/"><svg viewBox="0 0 26 30" fill="none" aria-hidden="true"><path d="M13 1 24.5 6.2v11.4C24.5 24 19.4 27.6 13 29 6.6 27.6 1.5 24 1.5 17.6V6.2L13 1Z" fill="#1B5E20" stroke="#C6F033" stroke-width="1.3"/><path d="M8.4 19.6 17 9.6M17.6 19.6 9 9.6" stroke="#EDF2E9" stroke-width="1.9" stroke-linecap="round"/><circle cx="13" cy="7.4" r="1.9" fill="#C6F033"/></svg>Padel Magas</a>
  <a class="sb-l $([ "$1" = app ] && echo on)" href="/app.html">Приложение</a>
  <a class="sb-l $([ "$1" = admin ] && echo on)" href="/admin.html">Админка</a>
</nav>
HTML
}

build () { # $1=исходник $2=результат $3=активная
  awk -v o1="$OUT/.p1" -v o2="$OUT/.p2" 'BEGIN{p=1}{ if(p==1) print > o1; else print > o2 } /<\/style>/ && p==1 {p=2}' "$1"
  sed -i 's|<link rel="stylesheet" href="https://fonts.googleapis.com[^"]*">|<link rel="stylesheet" href="/fonts.css">|' "$OUT/.p1"
  { echo '<!doctype html>'
    echo '<html lang="ru"><head>'
    echo '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    echo '<meta name="robots" content="noindex,nofollow">'
    echo '<link rel="icon" href="/favicon.svg" type="image/svg+xml">'
    cat "$OUT/.p1"
    cat <<'CSS'
<style>
html{color-scheme:dark}img{max-width:100%}
.sitebar{position:sticky;top:0;z-index:99;display:flex;gap:4px;align-items:center;padding:10px 24px;
 background:rgba(11,15,12,.93);backdrop-filter:blur(10px);border-bottom:1px solid #2C3729}
.sitebar .sb-h{font-family:'Oswald',sans-serif;font-size:13px;font-weight:600;text-transform:uppercase;
 letter-spacing:.09em;color:#EDF2E9;margin-right:16px;display:flex;align-items:center;gap:8px;text-decoration:none}
.sitebar .sb-h svg{width:17px;height:20px}
.sitebar a.sb-l{font-family:'Golos Text',sans-serif;font-size:12.5px;color:#9AA795;text-decoration:none;
 padding:5px 11px;border-radius:7px;border:1px solid transparent}
.sitebar a.sb-l:hover{color:#EDF2E9;border-color:#2C3729}
.sitebar a.sb-l.on{background:#C6F033;color:#0B0F0C;font-weight:600}
.sitebar a.sb-l:focus-visible,.sitebar .sb-h:focus-visible{outline:2px solid #C6F033;outline-offset:2px}
@media(max-width:600px){.sitebar{padding:9px 14px;overflow-x:auto}.sitebar .sb-h{margin-right:9px}}
</style>
CSS
    echo '</head><body>'
    nav "$3"
    cat "$OUT/.p2"
    echo '</body></html>'
  } > "$2"
  rm -f "$OUT/.p1" "$OUT/.p2"
}

build "$SRC/mockups.html" "$OUT/app.html"   app
build "$SRC/admin.html"   "$OUT/admin.html" admin
echo "собрано: app.html $(wc -c < "$OUT/app.html") б, admin.html $(wc -c < "$OUT/admin.html") б"
