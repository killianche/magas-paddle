// Проверки правок аудита 29.10.2026 на стенде. Запуск: STAND_PASS=... STAND_API=... node audit-1029.js
const { execSync } = require('child_process');
const API = process.env.STAND_API;
async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data };
}
const sql = q => execSync(`docker exec -i magas-test-db psql -U magas -d magas -t -A -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
const wait = ms => new Promise(r => setTimeout(r, ms));
let bad = 0;
const check = (what, ok, detail) => {
  console.log(`  ${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m`);
  if (!ok) { bad++; if (detail !== undefined) console.log('    ', JSON.stringify(detail)?.slice(0, 400)) }
};
const head = t => console.log(`\n\x1b[1m── ${t} ──\x1b[0m`);
const mskDay = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' });

(async () => {
  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data?.token;
  if (!adm) { console.error('не вошёл'); process.exit(1) }
  await call('/admin/settings', { method: 'POST', token: adm, body: { phoneVerifyOn: false,
    week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), maxHours: 3 } });
  const newClient = async () => {
    const phone = `7928${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
    const r = (await call('/clients/register', { method: 'POST',
      body: { phone, name: 'Проверка', password: 'padel-2026' } })).data;
    return { phone, token: r?.token, id: r?.profile?.id };
  };

  head('Сетка прошедшего дня');
  const yest = mskDay(Date.now() - 864e5);
  const g = (await call('/availability?date=' + yest)).data;
  const free = g.courts.flatMap(c => c.hours).filter(h => h.status === 'free').length;
  check('вчера нет свободных часов', free === 0, { free });
  const tomorrow = mskDay(Date.now() + 864e5);
  const g2 = (await call('/availability?date=' + tomorrow)).data;
  check('завтра свободные есть', g2.courts.flatMap(c => c.hours).some(h => h.status === 'free'));

  head('Ошибки ввода админки — 400, а не 500');
  const day = mskDay(Date.now() + (10 + Math.floor(Math.random() * 15)) * 864e5);
  const noHours = await call('/admin/bookings', { method: 'POST', token: adm, body: { courtId: 'c1', date: day, hour: 10 } });
  check('запись без длительности — 400', noHours.status === 400, noHours);
  const mb = await call('/admin/bookings', { method: 'POST', token: adm, body: { courtId: 'c2', date: day, hour: 10, hours: 1, name: 'Гость' } });
  check('ручная запись создана', mb.status === 201 || mb.status === 200, mb);
  const mv = await call(`/admin/bookings/${mb.data?.id}/move`, { method: 'POST', token: adm, body: { courtId: 'c2', date: day, hour: 'abc' } });
  check('перенос с часом-не-числом — 400', mv.status === 400, mv);
  const ex = await call('/admin/expenses/99999999/delete', { method: 'POST', token: adm });
  check('удаление несуществующего расхода — 404', ex.status === 404, ex);
  const pr = await call('/admin/price-rules/99999999/delete', { method: 'POST', token: adm });
  check('удаление несуществующего правила — 404', pr.status === 404, pr);

  head('Оплата заявки подтверждает её, отменённую — нет');
  const cl = await newClient();
  const b = await call('/bookings', { method: 'POST', token: cl.token, body: { courtId: 'c3', date: day, hour: 12, hours: 1, name: 'Проверка', phone: cl.phone } });
  check('заявка создана', !!b.data?.id, b);
  const p = await call(`/admin/bookings/${b.data.id}/pay`, { method: 'POST', token: adm, body: { amount: 100, method: 'cash' } });
  check('оплата принята и подтвердила', p.data?.confirmed === true, p);
  const st = sql(`select status from bookings where id=${b.data.id}`);
  check('в базе confirmed', st === 'confirmed', st);

  head('Футбольное поле без тренера');
  const fc = sql(`select id from courts where is_football limit 1`);
  if (fc) {
    const coach = sql(`select id from coaches where is_active and in_app limit 1`) || null;
    const r = await call('/bookings', { method: 'POST', token: cl.token, body: { courtId: fc, date: day, hour: 15, hours: 1, name: 'Проверка', phone: cl.phone, coachId: Number(coach || 1) } });
    check('тренер на футбольное поле — 400', r.status === 400, r);
  } else console.log('  (футбольного поля нет — пропущено)');

  head('Перебор пароля через удаление аккаунта');
  const cl2 = await newClient();
  let last;
  for (let i = 0; i < 6; i++) last = await call('/clients/me/delete', { method: 'POST', token: cl2.token, body: { password: 'wrong-' + i } });
  check('после 5 ошибок — 429', last.status === 429, last);
  const login = await call('/clients/login', { method: 'POST', body: { phone: cl2.phone, password: 'padel-2026' } });
  check('вход по номеру тоже заперт', login.status === 429, login);

  head('Удаление аккаунта убирает номер из журнала');
  const cl3 = await newClient();
  await call('/admin/notify', { method: 'POST', token: adm, body: { phone: cl3.phone, title: 'Проверка', body: 'Текст проверки' } });
  const b3 = await call('/bookings', { method: 'POST', token: cl3.token, body: { courtId: 'c4', date: day, hour: 13, hours: 1, name: 'Проверка', phone: cl3.phone, comment: 'Ахмед, перезвоните' } });
  check('номер в журнале до удаления', Number(sql(`select count(*) from admin_log where details like '%${cl3.phone}%'`)) > 0);
  const del = await call('/clients/me/delete', { method: 'POST', token: cl3.token, body: { password: 'padel-2026' } });
  check('аккаунт удалён', del.data?.ok === true, del);
  check('номера в журнале нет', Number(sql(`select count(*) from admin_log where details like '%${cl3.phone}%'`)) === 0);
  check('вместо номера ID', Number(sql(`select count(*) from admin_log where details like '%ID ${cl3.id}%'`)) > 0);
  check('комментарий к заявке стёрт', sql(`select coalesce(comment,'') from bookings where id=${b3.data.id}`) === '');

  head('Уведомления: прочитано без отдельного запроса на каждую рассылку');
  await call('/admin/notify', { method: 'POST', token: adm, body: { title: 'Всем 1', body: 'Рассылка один' } });
  await call('/admin/notify', { method: 'POST', token: adm, body: { title: 'Всем 2', body: 'Рассылка два' } });
  const cl4 = cl;
  const before = (await call('/notifications', { token: cl4.token })).data;
  check('непрочитанные есть', before.unread >= 1, before);
  const rd = await call('/notifications/read', { method: 'POST', token: cl4.token });
  const rd2 = await call('/notifications/read', { method: 'POST', token: cl4.token });
  check('повторное «прочитано» без ошибки', rd.status < 300 && rd2.status < 300, [rd, rd2]);
  const after = (await call('/notifications', { token: cl4.token })).data;
  check('всё прочитано', after.unread === 0, after);

  head('Склад: приход и списание');
  const pname = 'Вода проверка ' + Date.now() % 100000;
  const np = await call('/admin/products', { method: 'POST', token: adm, body: { name: pname, category: 'bar', price: 100, stock: 5 } });
  const r1 = await call(`/admin/products/${np.data.id}/move`, { method: 'POST', token: adm, body: { kind: 'receipt', qty: 3 } });
  const r2 = await call(`/admin/products/${np.data.id}/move`, { method: 'POST', token: adm, body: { kind: 'writeoff', qty: 2 } });
  check('приход и списание: 5 + 3 − 2 = 6', r1.data?.stock === 8 && r2.data?.stock === 6, [r1, r2]);

  head('Турнир: оплаченная заявка не сгорает, взнос складывается');
  const starts = new Date(Date.now() + 5 * 864e5).toISOString();
  const t = await call('/admin/tournaments', { method: 'POST', token: adm, body: { name: 'Проверка взноса', startsAt: starts, fee: 1000, seats: 2, state: 'open', courtIds: [] } });
  check('турнир заведён', !!t.data?.id, t);
  const cl5 = cl;
  const en = await call(`/tournaments/${t.data.id}/entries`, { method: 'POST', token: cl5.token, body: { name: 'Проверка', phone: cl5.phone } });
  check('заявка подана', !!en.data?.id, en);
  const pe1 = await call(`/admin/entries/${en.data.id}/pay`, { method: 'POST', token: adm, body: { amount: 400, method: 'cash' } });
  const pe2 = await call(`/admin/entries/${en.data.id}/pay`, { method: 'POST', token: adm, body: { amount: 600, method: 'cash' } });
  check('взнос частями: 400 + 600', pe1.status < 300 && pe2.status < 300 && sql(`select paid_amount from tournament_entries where id=${en.data.id}`) === '100000', [pe1, pe2]);
  sql(`update tournament_entries set hold_until = now() - interval '1 minute' where id=${en.data.id}`);
  await wait(21000);   // releaseExpired смотрит не чаще раза в 20 секунд
  await call('/tournaments');
  check('оплаченная заявка не сгорела', sql(`select status from tournament_entries where id=${en.data.id}`) === 'pending');
  const cl6 = cl2;
  const en2 = await call(`/tournaments/${t.data.id}/entries`, { method: 'POST', token: cl6.token, body: { name: 'Проверка', phone: cl6.phone } });
  check('её место по-прежнему занято: второй достаётся последнее', en2.data?.left === 0, en2);
  const conf = await call(`/admin/entries/${en.data.id}/status`, { method: 'POST', token: adm, body: { status: 'confirmed' } });
  check('менеджер подтверждает', conf.data?.status === 'confirmed', conf);

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё прошло\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
