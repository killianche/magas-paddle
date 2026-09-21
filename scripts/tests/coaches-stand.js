/** Сквозная проверка тренеров на отдельном стенде: своя база, свой API,
 *  данные клуба не участвуют — всё заводится самим тестом.
 *
 *  Поднять стенд:
 *    docker run -d --name magas-test-db -e POSTGRES_DB=magas -e POSTGRES_USER=magas \
 *      -e POSTGRES_PASSWORD=test -p 127.0.0.1:55432:5432 postgres:16-alpine
 *    for f in server/sql/*.sql; do docker exec -i magas-test-db psql -U magas -d magas -q < "$f"; done
 *    cd server/api && npx nest build && DATABASE_URL=postgresql://magas:test@127.0.0.1:55432/magas \
 *      ADMIN_KEY=test STAFF_PASS_KEY=$(python3 -c "print('ab'*32)") PORT=3101 node dist/main.js &
 *    node tools/admin-user.js owner vladelec "Владелец клуба"   # напечатает пароль
 *
 *  Запуск:  STAND_PASS=<пароль владельца> node scripts/tests/coaches-stand.js */
const API = 'http://127.0.0.1:3101/api';
const ADMIN = { login: 'vladelec', password: process.env.STAND_PASS };

let ok = 0, bad = 0;
const say = (good, what, detail = '') => {
  good ? ok++ : bad++;
  console.log(`${good ? '  ✓' : '  ✗'} ${what}${detail ? ' — ' + detail : ''}`);
};
const head = t => console.log(`\n── ${t} ──`);
const rub = k => (k / 100).toLocaleString('ru-RU') + ' ₽';
const dateIn = n => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data };
}

(async () => {
  head('Вход в админку');
  const login = await call('/admin/login', { method: 'POST', body: ADMIN });
  const adm = login.data?.token;
  say(!!adm, 'владелец вошёл', login.data?.admin?.name || JSON.stringify(login.data));

  // Клуб работает с 9 до 23 все дни — чтобы проверка не зависела от дня недели
  await call('/admin/settings', { method: 'POST', token: adm,
    body: { week: Array.from({ length: 7 }, () => ({ open: 9, close: 23 })), morningUntil: 13, maxHours: 3 } });

  head('Профили тренеров');
  const day = dateIn(3);
  const week = h => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(d => [d, h]));
  const mk = async c => {
    const r = await call('/admin/coaches', { method: 'POST', token: adm, body: c });
    say(r.status < 300, `заведён ${c.name} ${c.surname || ''}`.trim(), r.data?.id ? `id ${r.data.id}` : JSON.stringify(r.data));
    return r.data.id;
  };
  const aId = await mk({ name: 'Алихан', surname: 'Проверкин', experience: 'в падел 7 лет, тренирует с 2021',
    phone: '9280000901', bio: 'Ставит удар и подачу.', price: 3000, courtExtra: true,
    payType: 'percent', payValue: 50, week: week([9, 22]), inApp: true, isActive: true, color: '#1B7A32' });
  const bId = await mk({ name: 'Бэлла', surname: 'Вечерняя', experience: 'мастер спорта, вечерние группы',
    bio: 'Работает вечером, корт входит в цену.', price: 4000, courtExtra: false,
    payType: 'per_hour', payValue: 1500, week: week([16, 22]), inApp: true, isActive: true, color: '#7A4B1B' });
  const cId = await mk({ name: 'Вахид', surname: 'Скрытый', experience: 'тренер клуба', price: 2500,
    courtExtra: true, payType: 'per_lesson', payValue: 2000, week: week([9, 22]), inApp: false, isActive: true });

  const full = await call(`/admin/coaches?from=${day}&to=${day}`, { token: adm });
  const card = full.data.coaches.find(x => x.id === aId);
  say(card?.surname === 'Проверкин' && /7 лет/.test(card?.experience || ''),
    'фамилия и опыт сохранились и вернулись', `${card?.surname}, ${card?.experience}`);

  head('Приложение: кто свободен');
  const free = (h, hours = 1, courtId = 'c1') =>
    call(`/coaches/free?date=${day}&hour=${h}&hours=${hours}&courtId=${courtId}`);
  let r = await free(10);
  let names = (r.data.coaches || []).map(x => x.name);
  say(names.includes('Алихан') && !names.includes('Бэлла'),
    'утром виден только работающий утром', names.join(', ') || 'никого');
  say(!names.includes('Вахид'), 'скрытого из приложения тренера нет в списке');

  r = await free(17, 2);
  const A = r.data.coaches.find(x => x.name === 'Алихан'), B = r.data.coaches.find(x => x.name === 'Бэлла');
  say(!!A && !!B, 'вечером видны оба');
  say(A?.total === 600000 && B?.total === 800000, 'цена за 2 часа верна', `${rub(A?.total || 0)} и ${rub(B?.total || 0)}`);
  say(A?.courtExtra === true && B?.courtExtra === false, 'видно, у кого корт входит в цену');
  say(!!B?.surname && !!B?.experience, 'фамилия и опыт уходят в приложение', `${B?.surname}, ${B?.experience}`);
  r = await free(17, 2, 'f1');
  say((r.data.coaches || []).length === 0, 'на футбольном поле тренеров не предлагают');
  r = await free(21, 2);
  say(!(r.data.coaches || []).some(x => x.name === 'Бэлла'), 'тренировка за пределы рабочего дня тренера не предлагается');

  head('Приложение: запись с тренером');
  const phone = '79280001234';
  const reg = await call('/clients/register', { method: 'POST',
    body: { name: 'Игрок', phone, password: 'Proverka2026' } });
  const cli = reg.data.token;
  say(!!cli, 'игрок завёл аккаунт');

  const bk = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c1', date: day, hour: 17, hours: 2, name: 'Игрок', phone, coachId: bId } });
  say(bk.status === 201 && bk.data.coachName === 'Бэлла', 'заявка с тренером принята', bk.data?.message || '');
  say(bk.data.price === 800000 && bk.data.coachPrice === 800000,
    'корт входит в цену — берём только за тренировку', rub(bk.data.price));

  const dbl = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c2', date: day, hour: 18, hours: 1, name: 'Игрок', phone, coachId: bId } });
  say(dbl.status === 409 && dbl.data.code === 'coach_busy', 'дважды тренера не занять', dbl.data?.message);

  const outside = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c2', date: day, hour: 10, hours: 1, name: 'Игрок', phone, coachId: bId } });
  say(outside.status === 409 && /не работает/.test(outside.data?.message || ''),
    'вне графика тренера записи нет', outside.data?.message);

  r = await free(17, 2, 'c3');
  say(!(r.data.coaches || []).some(x => x.id === bId), 'занятый тренер пропал из свободных');
  say((r.data.coaches || []).some(x => x.id === aId), 'свободный тренер остался');

  const plain = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c3', date: day, hour: 12, hours: 1, name: 'Игрок', phone } });
  say(plain.status === 201 && plain.data.price === 200000 && !plain.data.coachName,
    'обычная бронь без тренера считается по тарифу', rub(plain.data.price));

  head('Админка: менеджер уточняет тренера');
  const dayView = await call('/admin/day?date=' + day, { token: adm });
  const inGrid = dayView.data.bookings.find(x => x.id === bk.data.id);
  say(inGrid?.coach?.name === 'Бэлла', 'в сетке дня виден тренер', inGrid?.coach?.name);

  const ch = await call(`/admin/bookings/${bk.data.id}/coach`, { method: 'POST', token: adm, body: { coachId: aId } });
  say(ch.status < 300, 'тренера заменили', ch.data?.message || '');
  say(ch.data?.coachPrice === 600000 && ch.data?.price === 500000,
    'цена пересчитана: корт снова платный', `корт ${rub(ch.data?.price || 0)} + тренер ${rub(ch.data?.coachPrice || 0)}`);

  const mine = await call('/bookings?phone=' + phone, { token: cli });
  const seen = mine.data.find(x => x.id === bk.data.id);
  say(seen?.coachName === 'Алихан', 'игрок видит нового тренера', seen?.coachName);
  const notes = await call('/notifications?phone=' + phone, { token: cli });
  say((notes.data.items || []).some(n => /Тренер на вашу игру/.test(n.title)), 'игроку ушло уведомление');

  const busy = await call(`/admin/bookings/${plain.data.id}/coach`, { method: 'POST', token: adm, body: { coachId: bId } });
  say(busy.status >= 400, 'занятого по графику тренера менеджеру не поставить', busy.data?.message);

  const same = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c2', date: day, hour: 17, hours: 2, name: 'Игрок', phone } });
  const put = await call(`/admin/bookings/${same.data.id}/coach`, { method: 'POST', token: adm, body: { coachId: aId } });
  say(put.status >= 400 && /занят|ведёт/.test(put.data?.message || ''),
    'тренера, занятого в эти же часы другой бронью, не поставить', put.data?.message);

  const off = await call(`/admin/bookings/${bk.data.id}/coach`, { method: 'POST', token: adm, body: { coachId: null } });
  say(off.data?.coachId === null && off.data?.coachPrice === 0 && off.data?.price === 500000,
    'тренера можно убрать, корт остаётся по тарифу', rub(off.data?.price || 0));
  await call(`/admin/bookings/${bk.data.id}/coach`, { method: 'POST', token: adm, body: { coachId: aId } });

  head('Групповая тренировка держит тренера');
  const cls = await call('/admin/tournaments', { method: 'POST', token: adm,
    body: { kind: 'class', name: 'Группа проверки', startsAt: `${day}T20:00:00+03:00`, hours: 1,
      fee: 1500, seats: 6, state: 'open', coachId: bId, level: 'начинающие', format: 'групповая', courtIds: ['c4'] } });
  say(cls.status < 300, 'групповая создана', cls.data?.id ? `id ${cls.data.id}` : JSON.stringify(cls.data));
  r = await free(20, 1, 'c1');
  say(!(r.data.coaches || []).some(x => x.id === bId), 'во время группы тренера не предлагают',
    (r.data.coaches || []).map(x => x.name).join(', ') || 'никого');
  const inClass = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c1', date: day, hour: 20, hours: 1, name: 'Игрок', phone, coachId: bId } });
  say(inClass.status === 409 && /груп|занят/i.test(inClass.data?.message || ''),
    'на время группы к тренеру не записаться', inClass.data?.message);
  const classes = await call('/tournaments?kind=class');
  say((classes.data || []).some(t => t.name === 'Группа проверки' && t.coach?.name === 'Бэлла'),
    'групповая видна в приложении (вкладка «Турниры»)');

  head('Отчёт по тренеру');
  await call(`/admin/bookings/${bk.data.id}/status`, { method: 'POST', token: adm, body: { status: 'confirmed' } });
  const rep = await call(`/admin/coaches/${aId}/report?from=${day}&to=${day}`, { token: adm });
  say(rep.data.lessons.some(l => l.id === bk.data.id), 'будущая тренировка видна в отчёте тренера');
  say(rep.data.totals.upcoming >= 1, 'считается как «впереди», в проведённые не попадает',
    `впереди ${rep.data.totals.upcoming}, проведено ${rep.data.totals.lessons}`);

  // Прошедшая тренировка: деньги и начисление
  const past = dateIn(-1);
  const pastBk = await call('/admin/bookings', { method: 'POST', token: adm,
    body: { courtId: 'c1', date: past, hour: 18, hours: 2, name: 'Игрок вчерашний', phone: '79280005555', coachId: aId } });
  say(pastBk.status < 300, 'менеджер записал вчерашнюю тренировку', pastBk.data?.message || '');
  await call(`/admin/bookings/${pastBk.data.id}/status`, { method: 'POST', token: adm, body: { status: 'done' } });
  const rep2 = await call(`/admin/coaches/${aId}/report?from=${past}&to=${past}`, { token: adm });
  const t = rep2.data.totals;
  say(t.lessons === 1 && t.lessonHours === 2, 'проведённая тренировка попала в отчёт',
    `тренировок ${t.lessons}, часов ${t.lessonHours}`);
  say(t.revenue === 600000 && t.pay === 300000, 'начислено 50 % от тренировки',
    `выручка ${rub(t.revenue)}, тренеру ${rub(t.pay)}`);
  const payout = await call(`/admin/coaches/${aId}/payouts`, { method: 'POST', token: adm,
    body: { amount: 2000, method: 'cash', from: past, to: past } });
  say(payout.status < 300, 'выплата тренеру записалась');
  const rep3 = await call(`/admin/coaches/${aId}/report?from=${past}&to=${past}`, { token: adm });
  say(rep3.data.totals.paid === 200000, 'выплата видна в отчёте', rub(rep3.data.totals.paid));

  head('Выключатель «Тренеры в приложении»');
  await call('/admin/settings', { method: 'POST', token: adm, body: { coachesOn: false } });
  await new Promise(s => setTimeout(s, 16000));
  const clubOff = await call('/club');
  say(clubOff.data.coachesOn === false, 'приложение узнаёт, что функция выключена');
  r = await free(17, 2);
  say((r.data.coaches || []).length === 0, 'свободных тренеров не показывают');
  const offBook = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c5', date: day, hour: 15, hours: 1, name: 'Игрок', phone, coachId: aId } });
  say(offBook.status === 400, 'к тренеру не записаться', offBook.data?.message);
  const offPlain = await call('/bookings', { method: 'POST', token: cli,
    body: { courtId: 'c5', date: day, hour: 15, hours: 1, name: 'Игрок', phone } });
  say(offPlain.status === 201, 'обычные брони при этом работают');
  const listOff = await call('/coaches');
  say((listOff.data || []).length === 0, 'список тренеров пуст');

  await call('/admin/settings', { method: 'POST', token: adm, body: { coachesOn: true } });
  await new Promise(s => setTimeout(s, 16000));
  const clubOn = await call('/club');
  r = await free(17, 2);
  say(clubOn.data.coachesOn === true && (r.data.coaches || []).length > 0, 'включается обратно, данные на месте');
  const repAfter = await call(`/admin/coaches/${aId}/report?from=${dateIn(-1)}&to=${day}`, { token: adm });
  say(repAfter.data.totals.lessons >= 1 && repAfter.data.totals.paid === 200000,
    'история тренировок и выплат после выключения цела',
    `проведено ${repAfter.data.totals.lessons}, выплачено ${rub(repAfter.data.totals.paid)}`);

  console.log(`\nИтог: ${ok} проверок прошло, ${bad} не прошло\n`);
  process.exitCode = bad ? 1 : 0;
})();
