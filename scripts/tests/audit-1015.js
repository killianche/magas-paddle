/** Проверки правок по аудиту 15.10.2026 — каждая воспроизводила ошибку до правки.
 *
 *    1. Ошибка проверки данных приходит одной строкой по-русски, а не массивом.
 *    2. Удаление аккаунта возвращает мячи на склад и пишет менеджеру с номером.
 *    3. Две одновременные отмены: отменяет одна, товар возвращается один раз.
 *    4. Запрещённому получателю кнопка «Итог за сегодня» отчёт не присылает.
 *
 *  Работает на стенде: API_PORT=3401 scripts/tests/tg-stand.sh up
 *  Запуск: STAND_PASS=<пароль> STAND_API=http://127.0.0.1:3401/api node scripts/tests/audit-1015.js
 */
const { execSync } = require('child_process');
const API = process.env.STAND_API || 'http://127.0.0.1:3101/api';
const TG = (process.env.STAND_TG || 'http://127.0.0.1:3199') + '/botTEST';

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data };
}
const sent = () => fetch(TG + '/__sent').then(r => r.json());
const push = u => fetch(TG + '/__push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) });
const wait = ms => new Promise(r => setTimeout(r, ms));
let bad = 0;
const check = (what, ok, detail) => {
  console.log(`  ${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m`);
  if (!ok) { bad++; if (detail !== undefined) console.log('    ', JSON.stringify(detail)?.slice(0, 300)) }
};
const head = t => console.log(`\n\x1b[1m── ${t} ──\x1b[0m`);
const mskDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
const stockOf = name => Number(execSync('docker exec -i magas-test-db psql -U magas -d magas -t -A -c ' +
  `"select stock from products where name = '${name}'"`).toString().trim());

(async () => {
  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS'); process.exit(1) }
  await call('/admin/settings', { method: 'POST', token: adm, body: { phoneVerifyOn: false,
    week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), maxHours: 3 } });
  const ballsName = `Мячи аудит ${Date.now() % 100000}`;
  await call('/admin/products', { method: 'POST', token: adm, body: { name: ballsName, category: 'shop', price: 800, stock: 10 } });
  const balls = ((await call('/goods')).data ?? []).find(g => g.name === ballsName);
  const day = mskDay(Date.now() + 6 * 864e5);
  const newClient = async () => {
    const phone = `9287${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    const r = (await call('/clients/register', { method: 'POST',
      body: { phone, name: 'Аудит', password: 'padel-2026' } })).data;
    return { phone, token: r?.token };
  };
  const book = (cl, court, hour) => call('/bookings', { method: 'POST', token: cl.token,
    body: { courtId: court, date: day, hour, hours: 1, name: 'Аудит', phone: cl.phone,
      items: [{ productId: balls.id, qty: 1 }] } });

  head('1. Ошибка проверки данных');
  const cl0 = await newClient();
  const badDate = await call('/bookings', { method: 'POST', token: cl0.token,
    body: { courtId: 'c1', date: 'завтра', hour: 10, hours: 1, name: 'Аудит', phone: cl0.phone } });
  check('отказ 400', badDate.status === 400, badDate);
  check('message — строка, а не массив', typeof badDate.data?.message === 'string', badDate.data);
  check('текст по-русски', /[а-яё]/i.test(badDate.data?.message ?? ''), badDate.data);
  check('есть код validation', badDate.data?.code === 'validation', badDate.data);

  head('2. Удаление аккаунта');
  await call('/admin/telegram/allow', { method: 'POST', token: adm, body: { chatId: '881015', name: 'Менеджер' } });
  await fetch(TG + '/__clear');
  const cl1 = await newClient();
  const before = stockOf(ballsName);
  const b1 = await book(cl1, 'c5', 12);
  check('бронь с мячами создана', b1.status < 300, b1.data);
  check('мячи списаны', stockOf(ballsName) === before - 1, stockOf(ballsName));
  const del = await call('/clients/me/delete', { method: 'POST', token: cl1.token, body: { password: 'padel-2026' } });
  check('аккаунт удалён', del.status < 300, del.data);
  check('мячи вернулись на склад', stockOf(ballsName) === before, stockOf(ballsName));
  await wait(1500);
  const msg = (await sent()).find(m => String(m.text).includes('удалил аккаунт'));
  check('менеджеру ушло сообщение', !!msg, (await sent()).map(m => String(m.text).slice(0, 60)));
  check('в сообщении есть номер для связи', !!msg && String(msg.text).includes(cl1.phone.slice(-4)), msg?.text);

  head('3. Две отмены одновременно');
  const cl2 = await newClient();
  const s0 = stockOf(ballsName);
  const b2 = await book(cl2, 'c6', 15);
  check('бронь с мячами создана', b2.status < 300, b2.data);
  const both = await Promise.all([1, 2].map(() =>
    call(`/bookings/${b2.data.id}`, { method: 'DELETE', token: cl2.token })));
  const okCount = both.filter(r => r.status < 300).length;
  check('отменила ровно одна', okCount === 1, both.map(r => r.status));
  check('мячи вернулись один раз', stockOf(ballsName) === s0, { было: s0, стало: stockOf(ballsName) });

  head('4. Запрещённому — без отчёта');
  await fetch(TG + '/__clear');
  await push({ update_id: 901015, callback_query: { id: 'q1', data: 'today',
    message: { chat: { id: 991015 }, message_id: 1 } } });
  await wait(2500);
  const leaked = (await sent()).filter(m => String(m.chat_id) === '991015');
  check('отчёт не прислан', leaked.length === 0, leaked.map(m => String(m.text).slice(0, 80)));

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё прошло\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
