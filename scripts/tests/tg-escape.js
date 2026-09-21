/** Проверка: угловые скобки и амперсанд в именах не ломают уведомление.
 *
 *  Bot API (раздел HTML style): символы `<`, `>` и `&`, которые не часть тега,
 *  должны быть заменены на `&lt;`, `&gt;`, `&amp;`. Иначе Telegram отвечает 400,
 *  сообщение не доходит, а служба пишет это только в лог — то есть бронь
 *  такого клиента руководитель молча не увидит.
 *
 *  Работает на стенде (scripts/tests/tg-stand.sh up): своя база, свой API,
 *  поддельный Telegram. Наружу ничего не уходит.
 *
 *  Запуск:  STAND_PASS=<пароль владельца> node scripts/tests/tg-escape.js
 */
const API = 'http://127.0.0.1:3101/api';
const TG = 'http://127.0.0.1:3199/botTEST';

const wait = ms => new Promise(r => setTimeout(r, ms));

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  if (r.status >= 400) console.error(`  ! ${method} ${path} → ${r.status}: ${JSON.stringify(data)}`);
  return data;
}
const sent = async () => (await (await fetch(TG + '/__sent')).json()).map(m => m.text);
const clear = () => fetch(TG + '/__clear', { method: 'POST', body: '{}' });

async function grab(ms = 5000) {
  const till = Date.now() + ms;
  let last = [];
  while (Date.now() < till) {
    const all = await sent();
    if (all.length && all.length === last.length) break;
    last = all; await wait(300);
  }
  await clear();
  return last;
}

const mskDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });

let bad = 0;
function check(what, ok, detail) {
  console.log(`  ${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m`);
  if (!ok) { bad++; if (detail) console.log('    ' + detail) }
}

/** Разметка допустима только та, что Telegram понимает; всё остальное —
 *  признак неэкранированной подстановки. */
const TAGS = /<\/?(?:b|strong|i|em|u|ins|s|strike|del|a|code|pre|blockquote|tg-spoiler|tg-emoji)(?:\s[^>]*)?>/g;

(async () => {
  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } }))?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS из вывода tg-stand.sh'); process.exit(1) }

  await call('/admin/settings', { method: 'POST', token: adm,
    body: { week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), morningUntil: 13, maxHours: 3 } });
  await call('/admin/telegram/allow', { method: 'POST', token: adm,
    body: { chatId: '900001', name: 'Руководитель (стенд)' } });
  await clear();

  const rnd = Math.floor(Math.random() * 9000 + 1000);
  const day = mskDay(Date.now() + 4 * 864e5);
  const NAME = 'Иса <Малыш> & Co';

  console.log('\nЗапись со стойки на имя ' + JSON.stringify(NAME));
  await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: 'c3', date: day, hour: 20, hours: 1, name: NAME, phone: `9280002${rnd}` } });
  const [msg] = await grab();

  if (!msg) { console.log('\x1b[31m  ✗ сообщения не было вовсе\x1b[0m'); process.exit(1) }
  console.log('\x1b[2m' + msg.replace(/\n/g, '\n  ') + '\x1b[0m\n');

  check('имя экранировано', msg.includes('Иса &lt;Малыш&gt; &amp; Co'), msg);
  check('сырых < > & в тексте не осталось',
    !msg.replace(TAGS, '').replace(/&(?:lt|gt|amp|quot|#\d+);/g, '').match(/[<>&]/),
    'осталось: ' + JSON.stringify(msg.replace(TAGS, '').replace(/&(?:lt|gt|amp|quot|#\d+);/g, '').match(/[<>&].{0,20}/g)));

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё чисто\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
