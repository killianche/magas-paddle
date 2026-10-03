/** Прокат и мячи, отмеченные клиентом при записи, попадают в счёт брони.
 *
 *  Решения заказчика 04.10.2026: клиенту показываем только прокат и товары
 *  (бар продают на стойке), склад списывается сразу, отмена возвращает товар.
 *
 *  Запуск на стенде: STAND_PASS=<пароль> node scripts/tests/booking-goods.js
 */
const { execSync } = require('child_process');
const API = process.env.STAND_API || 'http://127.0.0.1:3101/api';

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data };
}

let bad = 0;
const check = (what, ok, detail) => {
  console.log(`  ${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m`);
  if (!ok) { bad++; if (detail !== undefined) console.log('    ', JSON.stringify(detail)?.slice(0, 240)) }
};
const head = t => console.log(`\n\x1b[1m── ${t} ──\x1b[0m`);
const mskDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });
const stockOf = name => {
  const out = execSync('docker exec -i magas-test-db psql -U magas -d magas -t -A -c ' +
    `"select stock from products where name = '${name}'"`).toString().trim();
  return out === '' ? null : Number(out);
};

(async () => {
  try {
    execSync('docker exec -i magas-test-db psql -U magas -d magas -q -c ' +
      '"truncate bookings, payments, sales, refunds, stock_moves, products, clients, admin_log restart identity cascade"',
      { stdio: 'ignore' });
  } catch {}

  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS'); process.exit(1) }
  await call('/admin/settings', { method: 'POST', token: adm,
    body: { week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), morningUntil: 13, maxHours: 3 } });

  for (const p of [
    { name: 'Прокат ракетки', category: 'rental', price: 300 },
    { name: 'Банка мячей', category: 'shop', price: 800, stock: 3 },
    { name: 'Вода 0,5 л', category: 'bar', price: 100, stock: 40 },
  ]) await call('/admin/products', { method: 'POST', token: adm, body: p });

  head('Что видно клиенту');
  const goods = (await call('/goods')).data ?? [];
  const names = goods.map(g => g.name);
  check('прокат и мячи показываются', names.includes('Прокат ракетки') && names.includes('Банка мячей'), names);
  check('бар клиенту не показывается', !names.includes('Вода 0,5 л'), names);
  check('у проката остаток не ограничен', goods.find(g => g.name === 'Прокат ракетки')?.left === null);
  check('у товара виден остаток', goods.find(g => g.name === 'Банка мячей')?.left === 3);

  const rentalId = goods.find(g => g.name === 'Прокат ракетки').id;
  const ballsId = goods.find(g => g.name === 'Банка мячей').id;
  const barId = (await call('/admin/products', { token: adm })).data.find(p => p.category === 'bar').id;

  const rnd = Math.floor(Math.random() * 9000 + 1000);
  const day = mskDay(Date.now() + 5 * 864e5);
  const phone = `9286000${rnd}`;
  const cl = (await call('/clients/register', { method: 'POST',
    body: { phone, name: 'Прокат', surname: 'Тестов', password: 'padel-2026' } })).data;

  head('Запись с прокатом');
  const made = await call('/bookings', { method: 'POST', token: cl?.token,
    body: { courtId: 'c2', date: day, hour: 18, hours: 1, name: 'Прокат', phone,
      items: [{ productId: rentalId, qty: 2 }, { productId: ballsId, qty: 1 }] } });
  check('бронь создалась', made.status < 300, made.data);
  check('в ответе есть позиции', (made.data?.extras ?? []).length === 2, made.data?.extras);
  check('сумма включает прокат', made.data?.price === 2500 * 100 + 300 * 2 * 100 + 800 * 100,
    { price: made.data?.price });
  check('банка мячей списана со склада', stockOf('Банка мячей') === 2, stockOf('Банка мячей'));

  const mine = (await call('/bookings', { token: cl?.token })).data ?? [];
  check('в своих записях видны позиции', (mine[0]?.extras ?? []).length === 2, mine[0]?.extras);

  head('Чего нельзя');
  const barTry = await call('/bookings', { method: 'POST', token: cl?.token,
    body: { courtId: 'c3', date: day, hour: 18, hours: 1, name: 'Прокат', phone,
      items: [{ productId: barId, qty: 1 }] } });
  check('бар к брони не добавить', barTry.status === 404, barTry.data);
  check('бронь при отказе не создалась',
    ((await call('/bookings', { token: cl?.token })).data ?? []).filter(b => b.courtId === 'c3').length === 0);

  const tooMany = await call('/bookings', { method: 'POST', token: cl?.token,
    body: { courtId: 'c4', date: day, hour: 18, hours: 1, name: 'Прокат', phone,
      items: [{ productId: ballsId, qty: 9 }] } });
  check('больше, чем есть на складе, не заказать', tooMany.status === 409, tooMany.data);
  check('склад от неудачной попытки не пострадал', stockOf('Банка мячей') === 2, stockOf('Банка мячей'));

  head('Отмена возвращает товар');
  const del = await call(`/bookings/${made.data.id}?phone=${phone}`, { method: 'DELETE', token: cl?.token });
  check('бронь отменилась', del.status < 300, del.data);
  check('банка мячей вернулась на склад', stockOf('Банка мячей') === 3, stockOf('Банка мячей'));

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё прошло\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
