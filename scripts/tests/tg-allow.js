/** Отчёты приходят только разрешённым ID. */
const API = 'http://127.0.0.1:3101/api';
const TG = 'http://127.0.0.1:3199/botTEST';
let ok = 0, bad = 0;
const say = (g, w, d = '') => { g ? ok++ : bad++; console.log(`${g ? '  ✓' : '  ✗'} ${w}${d ? ' — ' + d : ''}`) };
const head = t => console.log(`\n── ${t} ──`);
const wait = ms => new Promise(r => setTimeout(r, ms));
const norm = t => String(t ?? '').replace(/[   ]/g, ' ');
async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data };
}
const sent = async () => (await (await fetch(TG + '/__sent')).json()).map(m => ({ ...m, text: norm(m.text) }));
const clear = () => fetch(TG + '/__clear', { method: 'POST', body: '{}' });
const push = u => fetch(TG + '/__push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(u) });
const got = async (re, ms = 4000) => {
  const till = Date.now() + ms;
  while (Date.now() < till) { const all = await sent(); const h = all.find(m => re.test(m.text)); if (h) return h; await wait(250) }
  return null;
};

(async () => {
  // Чистая база на каждый прогон: иначе второй запуск подряд упирается
  // в брони и подписки от первого и даёт ложные «не прошло»
  try {
    require('child_process').execSync('docker exec -i magas-test-db psql -U magas -d magas -q -c ' +
      '"truncate bookings, payments, sales, refunds, stock_moves, products, clients, admin_log, tg_subs ' +
      'restart identity cascade"', { stdio: 'ignore' });
  } catch { console.error('  (не смог очистить базу стенда — данные прошлого прогона останутся)') }

  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data.token;

  head('Посторонний нажал «Старт»');
  await clear();
  await push({ update_id: 11, message: { chat: { id: 777001, first_name: 'Посторонний' }, text: '/start' } });
  const hi = await got(/Ваш ID/);
  say(!!hi && /777001/.test(hi.text), 'бот показывает ему его ID и не подписывает',
    (hi?.text ?? '').replace(/\n/g, ' · '));
  say(!/Уведомления включены/.test((await sent()).map(m => m.text).join(' ')), 'уведомления ему не включены');

  const info = await call('/admin/telegram', { token: adm });
  const pend = info.data.subs.find(x => x.chatId === '777001');
  say(!!pend && pend.approved === false, 'в админке он в списке «ждут разрешения»');

  head('Событие клуба при неразрешённом получателе');
  await clear();
  const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: 'c1', date: day, hour: 11, hours: 1, name: 'Гость', phone: '79990001212' } });
  await wait(1500);
  say((await sent()).length === 0, 'посторонний ничего не получает');

  head('Руководитель разрешает ID');
  await clear();
  const allow = await call('/admin/telegram/allow', { method: 'POST', token: adm,
    body: { chatId: '777001', name: 'Руководитель' } });
  say(allow.status < 300 && allow.data.approved, 'ID разрешён из админки');
  say(!!(await got(/включил вам отчёты/)), 'боту ушло сообщение «отчёты включены»');

  await clear();
  await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: 'c2', date: day, hour: 12, hours: 1, name: 'Гость Второй', phone: '79990001313' } });
  say(!!(await got(/Менеджер записал клиента/)), 'теперь события приходят');

  head('Заранее вписанный ID');
  await clear();
  await call('/admin/telegram/allow', { method: 'POST', token: adm, body: { chatId: '777002', name: 'Партнёр' } });
  await push({ update_id: 12, message: { chat: { id: 777002, first_name: 'Партнёр' }, text: '/start' } });
  say(!!(await got(/Уведомления включены/)), 'кто вписан заранее — подключается сразу');

  head('Запрет');
  await clear();
  await call('/admin/telegram/allow', { method: 'POST', token: adm, body: { chatId: '777001', approved: false } });
  await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: 'c3', date: day, hour: 13, hours: 1, name: 'Гость Третий', phone: '79990001414' } });
  await wait(1500);
  const to = (await sent()).map(m => String(m.chat_id));
  say(!to.includes('777001'), 'запрещённому больше не приходит');
  say(to.includes('777002'), 'остальным приходит', to.join(', '));

  head('Команды от неразрешённого');
  await clear();
  await push({ update_id: 13, message: { chat: { id: 777003 }, text: '/today' } });
  const deny = await got(/Ваш ID/);
  say(!!deny && !/Итог за/.test((await sent()).map(m => m.text).join(' ')), 'итог за день чужому не показывается');

  console.log(`\nИтог: ${ok} прошло, ${bad} не прошло\n`);
  process.exitCode = bad ? 1 : 0;
})();
