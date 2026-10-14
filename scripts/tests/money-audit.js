/** Деньги и записи: проверки по находкам аудита 14.10.2026.
 *
 *  Каждая проверка здесь — это ошибка, которая однажды уже стоила клубу денег
 *  или продавала один час дважды. Пусть больше не возвращается.
 *
 *  Запуск на стенде:
 *    STAND_API=http://127.0.0.1:3401/api STAND_PASS=<пароль> node scripts/tests/money-audit.js
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
  if (!ok) { bad++; if (detail !== undefined) console.log('    ', JSON.stringify(detail)?.slice(0, 300)) }
};
const head = t => console.log(`\n\x1b[1m── ${t} ──\x1b[0m`);
// Каждый прогон занимает свои дни: иначе второй запуск упирается в брони
// первого и проверки врут про «время занято»
const SHIFT = 7 + Math.floor(Math.random() * 300);
const day = (plus = 1) => {
  const d = new Date(Date.now() + (SHIFT + plus) * 86400_000);
  return d.toISOString().slice(0, 10);
};

(async () => {
  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS'); process.exit(1) }
  const A = { token: adm };

  const courts = ((await call('/courts')).data ?? []).filter(c => !c.closedUntil);
  const c1 = courts[0]?.id, c2 = courts[1]?.id;
  const family = courts.find(c => c.isFamily)?.id;
  const plain = courts.find(c => c.id !== family)?.id;

  if (!c1) { console.error('на стенде нет кортов'); process.exit(1) }

  // Товар со складом заводим сами: на чистом стенде его нет
  const made = await call('/admin/products', { method: 'POST', token: adm,
    body: { name: `Вода проверочная ${Date.now() % 10000}`, price: 100, cost: 40,
            category: 'bar', stock: 50, isActive: true } });
  const list = (await call('/admin/products', { token: adm })).data;
  const rows = Array.isArray(list) ? list : (list?.items ?? list?.products ?? []);
  const stocked = rows.find(g => g.id === (made.data?.id ?? -1)) ?? rows.find(g => g.stock != null && g.stock > 3);
  if (!stocked) { console.error('не удалось завести товар', made.data, list); process.exit(1) }

  const stockOf = async id => {
    const l = (await call('/admin/products', { token: adm })).data;
    const rr = Array.isArray(l) ? l : (l?.items ?? l?.products ?? []);
    return rr.find(g => g.id === id)?.stock;
  };

  // ── 1. Турнир на занятой площадке ───────────────────────────────────────
  head('Турнир не занимает чужое время и не остаётся половинчатым');
  const tDate = day(3), tHour = 20;
  const mine = await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: c1, date: tDate, hour: tHour, hours: 1, name: 'Занял заранее', phone: '79281110001' } });
  check('частная бронь на площадке создана', mine.status < 300, mine.data);

  const before = ((await call('/tournaments')).data ?? []).length;
  const t = await call('/admin/tournaments', { method: 'POST', token: adm, body: {
    name: 'Проверочный турнир', startsAt: `${tDate}T${String(tHour).padStart(2, '0')}:00:00+03:00`,
    hours: 1, courtIds: [c1, c2], fee: 1000, seats: 8, state: 'open' } });
  check('турнир на занятой площадке не заводится', t.status === 409, { status: t.status, data: t.data });
  const after = ((await call('/tournaments')).data ?? []).length;
  check('и в базе его не осталось', after === before, { before, after });

  // ── 2. Отмена не стирает проданное на стойке ────────────────────────────
  head('Отмена убирает заказанное в приложении и не трогает проданное на стойке');
  const bDate = day(4);
  const withGoods = await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: c1, date: bDate, hour: 10, hours: 1, name: 'Счёт', phone: '79281110002' } });
  const bid = withGoods.data?.id;
  check('бронь заведена', !!bid, withGoods.data);

  const stock0 = await stockOf(stocked.id);
  const counter = await call('/admin/sales', { method: 'POST', token: adm,
    body: { productId: stocked.id, qty: 2, amount: 200, category: 'bar', bookingId: bid } });
  check('продажа на стойке записана в счёт', counter.status < 300, counter.data);
  const stock1 = await stockOf(stocked.id);
  check('склад уменьшился на проданное', stock1 === stock0 - 2, { stock0, stock1 });

  // Неявку задним числом не ставят — игра ещё не начиналась, поэтому отменяем.
  // Код удаления строк счёта один и тот же для отмены и неявки.
  const off = await call(`/admin/bookings/${bid}/status`, { method: 'POST', token: adm,
    body: { status: 'cancelled' } });
  check('бронь отменена', off.status < 300, off.data);

  const sold = ((await call(`/admin/sales?from=${bDate}&to=${bDate}`, { token: adm })).data ?? []);
  const soldRows = Array.isArray(sold) ? sold : (sold.items ?? sold.rows ?? []);
  // Сравниваем по названию: у каждого прогона товар свой, а id брони
  // в этом перечне не отдаётся
  const kept = soldRows.some(x => x.item === stocked.name);
  check('строка счёта за проданное на стойке осталась', kept,
    soldRows.map(x => x.item).slice(0, 5));
  const stock2 = await stockOf(stocked.id);
  check('выпитое не вернулось на склад', stock2 === stock1, { stock1, stock2 });

  // ── 3. «Семейный» не переезжает на обычный корт ─────────────────────────
  if (family && plain) {
    head('Услуга «Семейный» не переезжает туда, где её не оказать');
    const f = await call('/admin/bookings', { method: 'POST', token: adm,
      body: { courtId: family, date: day(5), hour: 12, hours: 1, name: 'Семья', phone: '79281110003', family: true } });
    if (f.data?.id) {
      const moved = await call(`/admin/bookings/${f.data.id}/move`, { method: 'POST', token: adm,
        body: { courtId: plain, date: day(5), hour: 12, hours: 1 } });
      check('перенос на обычный корт отклонён', moved.status >= 400, { status: moved.status, data: moved.data });
    } else {
      check('бронь с «Семейным» заведена', false, f.data);
    }
  } else {
    console.log('  (на стенде нет пары «семейный / обычный» корт — проверка пропущена)');
  }

  // ── 4. Перенос на дешёвое время не оставляет переплату молча ────────────
  head('Переплата при переносе не проходит молча');
  const pDate = day(6);
  const pricey = await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: c1, date: pDate, hour: 20, hours: 1, name: 'Вечер', phone: '79281110004' } });
  const pid = pricey.data?.id;
  const evening = courts.find(c => c.id === c1);
  const payRub = (evening?.priceStandard ?? 250000) / 100;   // платим вечернюю цену целиком
  check('вечер дороже утра — иначе проверка бессмысленна',
    (evening?.priceStandard ?? 0) > (evening?.priceMorning ?? 0),
    { вечер: evening?.priceStandard, утро: evening?.priceMorning });
  if (pid) {
    const paid = await call(`/admin/bookings/${pid}/pay`, { method: 'POST', token: adm,
      body: { amount: payRub, method: 'cash' } });
    check('полная оплата принята', paid.status < 300, paid.data);
    const moved = await call(`/admin/bookings/${pid}/move`, { method: 'POST', token: adm,
      body: { courtId: c1, date: pDate, hour: 10, hours: 1 } });
    check('перенос на более дешёвое время после полной оплаты отклонён',
      moved.status === 409, { status: moved.status, data: moved.data });
  }

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё прошло\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
