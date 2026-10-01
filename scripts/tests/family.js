/** Проверка услуги «Семейный»: отмечается только на своём корте,
 *  выключается из админки, видна в брони и в Telegram.
 *
 *  Запуск на стенде: STAND_PASS=<пароль> node scripts/tests/family.js
 */
const { execSync } = require('child_process');
const API = 'http://127.0.0.1:3101/api';
const TG = 'http://127.0.0.1:3199/botTEST';
const wait = ms => new Promise(r => setTimeout(r, ms));

async function call(path, { method = 'GET', body, token, raw } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  return raw ? { status: r.status, data } : data;
}
const sent = async () => (await (await fetch(TG + '/__sent')).json()).map(m => m.text);
const clear = () => fetch(TG + '/__clear', { method: 'POST', body: '{}' });

let bad = 0;
const check = (what, ok, detail) => {
  console.log(`  ${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m`);
  if (!ok) { bad++; if (detail !== undefined) console.log('    ', JSON.stringify(detail)?.slice(0, 220)) }
};
const head = t => console.log(`\n\x1b[1m── ${t} ──\x1b[0m`);
const mskDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });

(async () => {
  try {
    execSync('docker exec -i magas-test-db psql -U magas -d magas -q -c ' +
      '"truncate bookings, payments, sales, refunds, clients, admin_log, tg_subs restart identity cascade"',
      { stdio: 'ignore' });
    // Стенд закрывает шестой корт на ремонт — для проверки услуги открываем
    execSync('docker exec -i magas-test-db psql -U magas -d magas -q -c ' +
      '"update courts set closed_until = null, closed_reason = null where id = \'c6\'"',
      { stdio: 'ignore' });
  } catch {}

  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } }))?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS'); process.exit(1) }
  await call('/admin/settings', { method: 'POST', token: adm,
    body: { week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), morningUntil: 13, maxHours: 3 } });
  await call('/admin/telegram/allow', { method: 'POST', token: adm, body: { chatId: '900700', name: 'Стенд' } });

  const rnd = Math.floor(Math.random() * 9000 + 1000);
  const day = mskDay(Date.now() + 5 * 864e5);

  head('Корт 6 отмечен как семейный');
  const courts = await call('/courts');
  const c6 = courts.find(c => c.id === 'c6');
  check('у шестого корта isFamily = true', c6?.isFamily === true, c6 && { id: c6.id, isFamily: c6.isFamily });
  check('у остальных кортов услуги нет',
    courts.filter(c => c.id !== 'c6').every(c => !c.isFamily),
    courts.map(c => [c.id, c.isFamily]));
  check('услуга включена в настройках клуба', (await call('/club'))?.familyOn === true);

  head('Запись с услугой');
  const cl = await call('/clients/register', { method: 'POST',
    body: { phone: `9281000${rnd}`, name: 'Семья', surname: 'Тестова', password: 'padel-2026' } });
  await clear();
  const ok = await call('/bookings', { method: 'POST', token: cl?.token, raw: true,
    body: { courtId: 'c6', date: day, hour: 19, hours: 1, name: 'Семья', phone: `9281000${rnd}`, family: true } });
  check('бронь создалась', ok.status < 300, ok.data);
  check('в ответе family = true', ok.data?.family === true, ok.data);

  const mine = await call(`/bookings`, { token: cl?.token });
  check('в своих записях услуга видна', mine?.[0]?.family === true, mine?.[0]);

  await wait(2500);
  const msgs = await sent();
  check('в Telegram строка про услугу',
    msgs.some(t => t.includes('Семейный')), msgs);

  head('На других кортах услуги нет');
  const no = await call('/bookings', { method: 'POST', token: cl?.token, raw: true,
    body: { courtId: 'c1', date: day, hour: 20, hours: 1, name: 'Семья', phone: `9281000${rnd}`, family: true } });
  check('корт 1 с услугой не записывает', no.status === 400, no.data);

  head('Выключатель в админке');
  await call('/admin/settings', { method: 'POST', token: adm, body: { familyOn: false } });
  check('клуб отдаёт familyOn = false', (await call('/club'))?.familyOn === false);
  const off = await call('/bookings', { method: 'POST', token: cl?.token, raw: true,
    body: { courtId: 'c6', date: day, hour: 21, hours: 1, name: 'Семья', phone: `9281000${rnd}`, family: true } });
  check('при выключенной услуге запись с ней не проходит', off.status === 400, off.data);
  const plain = await call('/bookings', { method: 'POST', token: cl?.token, raw: true,
    body: { courtId: 'c6', date: day, hour: 22, hours: 1, name: 'Семья', phone: `9281000${rnd}` } });
  check('обычная бронь на тот же корт проходит', plain.status < 300, plain.data);
  await call('/admin/settings', { method: 'POST', token: adm, body: { familyOn: true } });

  head('Запись со стойки');
  await clear();
  const walk = await call('/admin/bookings', { method: 'POST', token: adm, raw: true,
    body: { courtId: 'c6', date: day, hour: 12, hours: 1, name: 'Гость Семейный', phone: `9282000${rnd}`, family: true } });
  check('менеджер записал с услугой', walk.status < 300, walk.data);
  await wait(2500);
  check('в Telegram про запись со стойки есть услуга',
    (await sent()).some(t => t.includes('Семейный')));
  const dayView = await call(`/admin/day?date=${day}`, { token: adm });
  const row = (dayView?.bookings ?? []).find(b => b.hour === 12);
  check('в сетке админки бронь помечена', row?.family === true, row && { hour: row.hour, family: row.family });

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё прошло\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
