/** Показать, как выглядят все уведомления в Telegram.
 *
 *  Работает на стенде (scripts/tests/tg-stand.sh up): своя база, свой API,
 *  поддельный Telegram. Скрипт по очереди устраивает каждое событие клуба —
 *  заявку из приложения, подтверждение, оплату, продажу, возврат, отмену,
 *  неявку, запись на тренировку — и печатает текст, который ушёл бы в чат.
 *
 *  Запуск:  STAND_PASS=<пароль владельца> node scripts/tests/tg-preview.js
 *
 *  Печатается два вида: «как увидит человек» (разметка убрана) и сырой текст
 *  с тегами — по нему правят оформление.
 */
const { execSync } = require('child_process');
const API = 'http://127.0.0.1:3101/api';
const TG = 'http://127.0.0.1:3199/botTEST';

const wait = ms => new Promise(r => setTimeout(r, ms));
// Узкий неразрывный пробел в суммах: в терминале он не виден, а сравнение ломает
const norm = t => String(t ?? '').replace(/[  ]/g, ' ');

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  if (r.status >= 400) console.error(`  ! ${method} ${path} → ${r.status}: ${JSON.stringify(data)}`);
  return data;
}
const sent = async () => (await (await fetch(TG + '/__sent')).json()).map(m => norm(m.text));
const clear = () => fetch(TG + '/__clear', { method: 'POST', body: '{}' });

/** Дождаться сообщения: уведомления уходят в фоне, не дожидаясь ответа API. */
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

const plain = t => t
  .replace(/<a href="[^"]*">([^<]*)<\/a>/g, '$1')
  .replace(/<\/?(b|i|u|s|code|pre|blockquote)[^>]*>/g, '');

let n = 0;
function show(title, msgs) {
  if (!msgs.length) { console.log(`\n\x1b[1;31m${++n}. ${title} — сообщения не было\x1b[0m`); return }
  for (const t of msgs) {
    console.log(`\n\x1b[1;32m${++n}. ${title}\x1b[0m`);
    console.log('┌─ как увидит человек ' + '─'.repeat(45));
    for (const ln of plain(t).split('\n')) console.log('│ ' + ln);
    console.log('└' + '─'.repeat(66));
    console.log('\x1b[2m' + t.replace(/\n/g, '\n  ') + '\x1b[0m');
  }
}

// День и час — по часам клуба (Москва), иначе после 21:00 UTC стенд уходит
// на сутки вперёд от того, что считает сервер
const mskDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
const dateIn = d => mskDay(Date.now() + d * 864e5);
const mskHour = () => Number(new Date().toLocaleString('ru-RU',
  { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }));

(async () => {
  // Чистая база на каждый прогон: иначе второй запуск упирается
  // в брони от первого («это время уже занято»)
  try {
    execSync('docker exec -i magas-test-db psql -U magas -d magas -q -c ' +
      '"truncate bookings, payments, sales, refunds, stock_moves, products, clients, admin_log ' +
      'restart identity cascade"', { stdio: 'ignore' });
  } catch { console.error('  (не смог очистить базу стенда — данные прошлого прогона останутся)') }

  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } }))?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS из вывода tg-stand.sh'); process.exit(1) }

  // Клуб открыт весь день — чтобы разбор не зависел от дня недели
  await call('/admin/settings', { method: 'POST', token: adm,
    body: { week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), morningUntil: 13, maxHours: 3 } });
  // Получатель отчётов: без разрешённого ID бот молчит
  await call('/admin/telegram/allow', { method: 'POST', token: adm,
    body: { chatId: '900001', name: 'Руководитель (стенд)' } });
  await clear();

  // Каждый прогон берёт свой день и свои часы: иначе второй запуск подряд
  // упирается в «это время уже занято» от прошлого
  const rnd = Math.floor(Math.random() * 9000 + 1000);
  const day = dateIn(3);
  const today = dateIn(0);
  const h1 = 12, h2 = 19;

  /* 1. Заявка из приложения */
  const client = await call('/clients/register', { method: 'POST',
    body: { phone: `9280000${rnd}`, name: 'Ахмед', surname: 'Тестов', password: 'padel-2026' } });
  const app = await call('/bookings', { method: 'POST', token: client?.token,
    body: { courtId: 'c1', date: day, hour: h2, hours: 2, name: 'Ахмед', phone: `9280000${rnd}` } });
  show('Клиент оставил заявку из приложения', await grab());

  /* 2. Менеджер подтвердил */
  await call(`/admin/bookings/${app.id}/status`, { method: 'POST', token: adm, body: { status: 'confirmed' } });
  show('Менеджер подтвердил бронь', await grab());

  /* 3. Оплата */
  await call(`/admin/bookings/${app.id}/pay`, { method: 'POST', token: adm,
    body: { amount: 5000, method: 'card' } });
  show('Клиент оплатил', await grab());

  /* 4. Возврат денег по броне */
  await call(`/admin/bookings/${app.id}/pay`, { method: 'POST', token: adm,
    body: { amount: 1000, method: 'card', kind: 'refund' } });
  show('Менеджер вернул часть денег', await grab());

  /* 5. Клиент отменил бронь сам */
  await call(`/bookings/${app.id}`, { method: 'DELETE', token: client?.token });
  show('Клиент отменил бронь в приложении', await grab());

  /* 6. Менеджер записал клиента со стойки */
  const walk = await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: 'c2', date: day, hour: h1, hours: 1, name: 'Магомед Гость', phone: `9280001${rnd}` } });
  show('Менеджер записал клиента', await grab());

  /* 7. Неявка с возвратом предоплаты.
     Неявку отмечают только по начавшейся игре, поэтому бронь нужна на
     сегодня и на уже прошедший час — раньше 11 утра показать нечего. */
  const nowH = mskHour();
  if (nowH >= 11) {
    const past = await call('/admin/bookings', { method: 'POST', token: adm,
      body: { courtId: 'c4', date: today, hour: nowH - 2, hours: 1,
              name: 'Забывчивый Гость', phone: `9280003${rnd}` } });
    await grab(2000);
    await call(`/admin/bookings/${past.id}/pay`, { method: 'POST', token: adm,
      body: { amount: 2500, method: 'cash' } });
    await grab(2000);
    await call(`/admin/bookings/${past.id}/status`, { method: 'POST', token: adm,
      body: { status: 'no_show', money: 'refund', refundMethod: 'cash' } });
    show('Клиент не пришёл, деньги вернули', await grab());
  } else {
    console.log('\n  (неявку показываем только после 11:00 — игра должна начаться)');
  }

  /* 8. Продажа и возврат покупки */
  const prod = await call('/admin/products', { method: 'POST', token: adm,
    body: { name: 'Мяч Head Padel', price: 900, cost: 500, category: 'shop', stock: 20, isActive: true } });
  // Касса в админке ходит именно в checkout — уведомление шлёт только он
  const sale = await call('/admin/sales/checkout', { method: 'POST', token: adm,
    body: { clientId: client?.profile?.id, method: 'cash', lines: [{ productId: prod?.id, qty: 2 }] } });
  show('Продажа в кассе', await grab());
  // checkout отдаёт только итог, номер строки берём из списка продаж
  const list = await call(`/admin/sales?from=${today}&to=${today}`, { token: adm });
  const saleId = (Array.isArray(list) ? list : list?.rows ?? list?.items ?? [])
    .map(x => x.id).filter(Boolean).pop();
  await call(`/admin/sales/${saleId}/delete`, { method: 'POST', token: adm, body: { method: 'cash' } });
  show('Возврат покупки', await grab());

  /* 9. Итог дня */
  await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: 'c3', date: today, hour: 9 + rnd % 12, hours: 1,
            name: 'Итоговый гость', phone: `9280002${rnd}` } });
  await grab(1500);
  await call('/admin/telegram/test', { method: 'POST', token: adm });
  const all = await grab(3000);
  show('Итог за день', all.filter(t => /Итог/.test(t)));

  console.log('\nВсего сообщений показано: ' + n + '\n');
})();
