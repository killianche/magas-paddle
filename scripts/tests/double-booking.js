/** Повторная заявка на то же время не создаёт вторую бронь.
 *
 *  Зачем: человек нажимает «Забронировать в WhatsApp», заявка уходит, и только
 *  потом открывается WhatsApp. Если он не открылся, человек возвращается
 *  и нажимает снова. Раньше он упирался в «это время только что заняли» —
 *  хотя занял его сам минуту назад.
 *
 *  Запуск на стенде: STAND_PASS=<пароль> node scripts/tests/double-booking.js
 */
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

(async () => {
  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS'); process.exit(1) }
  await call('/admin/settings', { method: 'POST', token: adm,
    body: { week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), morningUntil: 13, maxHours: 3 } });

  const rnd = Math.floor(Math.random() * 9000 + 1000);
  const day = mskDay(Date.now() + 6 * 864e5);
  const phone = `9283000${rnd}`;
  const cl = (await call('/clients/register', { method: 'POST',
    body: { phone, name: 'Повтор', surname: 'Тестов', password: 'padel-2026' } })).data;
  const body = { courtId: 'c2', date: day, hour: 18, hours: 1, name: 'Повтор', phone };

  head('Два нажатия подряд');
  const first = await call('/bookings', { method: 'POST', token: cl?.token, body });
  check('первая заявка создалась', first.status < 300, first.data);
  const second = await call('/bookings', { method: 'POST', token: cl?.token, body });
  check('вторая не упала с ошибкой', second.status < 300, second.data);
  check('вернулась та же бронь', first.data?.id === second.data?.id,
    { first: first.data?.id, second: second.data?.id });
  check('помечена как повтор', second.data?.repeated === true, second.data);

  head('В базе одна бронь, а не две');
  const mine = (await call('/bookings', { token: cl?.token })).data ?? [];
  const same = mine.filter(b => b.courtId === 'c2' && b.hour === 18);
  check('запись одна', same.length === 1, same.map(b => b.id));

  head('Одновременные нажатия');
  const phone2 = `9284000${rnd}`;
  const cl2 = (await call('/clients/register', { method: 'POST',
    body: { phone: phone2, name: 'Гонка', surname: 'Тестов', password: 'padel-2026' } })).data;
  const body2 = { courtId: 'c3', date: day, hour: 19, hours: 1, name: 'Гонка', phone: phone2 };
  const both = await Promise.all([
    call('/bookings', { method: 'POST', token: cl2?.token, body: body2 }),
    call('/bookings', { method: 'POST', token: cl2?.token, body: body2 }),
  ]);
  const okBoth = both.filter(r => r.status < 300);
  check('обе попытки без ошибки', okBoth.length === 2, both.map(r => [r.status, r.data?.message]));
  check('номер брони один и тот же', okBoth.length === 2 && okBoth[0].data.id === okBoth[1].data.id,
    okBoth.map(r => r.data?.id));
  const mine2 = (await call('/bookings', { token: cl2?.token })).data ?? [];
  check('в базе одна бронь', mine2.filter(b => b.courtId === 'c3' && b.hour === 19).length === 1);

  head('Чужое время по-прежнему занято');
  const other = (await call('/clients/register', { method: 'POST',
    body: { phone: `9285000${rnd}`, name: 'Чужой', surname: 'Тестов', password: 'padel-2026' } })).data;
  const taken = await call('/bookings', { method: 'POST', token: other?.token,
    body: { courtId: 'c2', date: day, hour: 18, hours: 1, name: 'Чужой', phone: `9285000${rnd}` } });
  check('другому человеку это время не отдаётся', taken.status === 409, taken.data);

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё прошло\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
