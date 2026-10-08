/** Вход по номеру: знакомый номер просит пароль, новый — подтверждение звонком.
 *
 *  Решения заказчика 08.10.2026: вход начинается с номера; подтверждаем
 *  обратным звонком через SMS.ru, а не кодом в SMS (имя отправителя стоит
 *  2000–3000 ₽/мес у каждого оператора).
 *
 *  Работает на стенде: поддельный SMS.ru, наружу ничего не уходит.
 *  Запуск: STAND_PASS=<пароль> node scripts/tests/phone-auth.js
 */
const API = process.env.STAND_API || 'http://127.0.0.1:3101/api';
const SMS = process.env.STAND_SMS || 'http://127.0.0.1:3198';

async function call(path, { method = 'GET', body, token } = {}) {
  const r = await fetch(API + path, { method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await r.json() } catch {}
  return { status: r.status, data };
}
/** «Человек позвонил» на поддельном SMS.ru. */
const ring = phone => fetch(`${SMS}/__call?phone=${phone}`).then(r => r.json());

let bad = 0;
const check = (what, ok, detail) => {
  console.log(`  ${ok ? '\x1b[32m✓' : '\x1b[31m✗'} ${what}\x1b[0m`);
  if (!ok) { bad++; if (detail !== undefined) console.log('    ', JSON.stringify(detail)?.slice(0, 240)) }
};
const head = t => console.log(`\n\x1b[1m── ${t} ──\x1b[0m`);

(async () => {
  // Подтверждение по умолчанию выключено (старые сборки его не умеют) —
  // для проверки включаем его так же, как это сделает клуб в админке
  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data?.token;
  if (!adm) { console.error('не вошёл: задайте STAND_PASS'); process.exit(1) }
  await call('/admin/settings', { method: 'POST', token: adm,
    body: { phoneGate: true, phoneVerifyOn: true } });

  const rnd = Math.floor(Math.random() * 9000 + 1000);
  const fresh = `7928500${rnd}`;

  head('Клуб говорит приложению, что вход начинается с номера');
  const club = (await call('/club')).data;
  check('phoneGate включён', club?.phoneGate === true, club?.phoneGate);
  check('подтверждение звонком доступно', club?.phoneVerifyOn === true, club?.phoneVerifyOn);

  head('Незнакомый номер');
  const unknown = (await call(`/clients/check?phone=${fresh}`)).data;
  check('номер неизвестен', unknown?.known === false && unknown?.hasPassword === false, unknown);

  head('Регистрация без подтверждения не проходит');
  const noToken = await call('/clients/register', { method: 'POST',
    body: { phone: fresh, name: 'Новый', password: 'padel-2026' } });
  check('сервер требует подтвердить номер', noToken.status === 428, noToken.data);
  check('причина названа', noToken.data?.code === 'phone_verification_required', noToken.data);

  head('Подтверждение звонком');
  const start = await call('/clients/call/start', { method: 'POST', body: { phone: fresh } });
  check('выдан номер для звонка', start.status < 300 && !!start.data?.callPhone, start.data);
  check('номер показан по-человечески', !!start.data?.callPhonePretty, start.data);
  const secret = start.data?.secret;

  const waiting = await call('/clients/call/status', { method: 'POST', body: { phone: fresh, secret } });
  check('пока не позвонили — ждём', waiting.data?.confirmed === false, waiting.data);

  const otherTab = await call('/clients/call/status', { method: 'POST', body: { phone: fresh, secret: 'нечужой' } });
  check('без своего секрета статус не отдаётся', otherTab.status === 410, otherTab.data);

  const busy = await call('/clients/call/start', { method: 'POST', body: { phone: fresh } });
  check('другой клиент тот же номер не займёт', busy.status === 429 && busy.data?.code === 'call_busy', busy.data);
  const same = await call('/clients/call/start', { method: 'POST', body: { phone: fresh, secret } });
  check('своей вкладке возвращается тот же номер',
    same.status < 300 && same.data?.callPhone === start.data?.callPhone, same.data);

  await ring(fresh);
  await new Promise(r => setTimeout(r, 2200));   // к SMS.ru — не чаще раза в 2 с
  const done = await call('/clients/call/status', { method: 'POST', body: { phone: fresh, secret } });
  check('звонок принят', done.data?.confirmed === true, done.data);
  const token = done.data?.verificationToken;
  check('выдано подтверждение', !!token);

  head('Регистрация с подтверждением');
  const reg = await call('/clients/register', { method: 'POST',
    body: { phone: fresh, name: 'Новый', password: 'padel-2026', verificationToken: token } });
  check('аккаунт создан', reg.status < 300 && !!reg.data?.token, reg.data);

  const again = await call('/clients/register', { method: 'POST',
    body: { phone: `7928501${rnd}`, name: 'Второй', password: 'padel-2026', verificationToken: token } });
  check('подтверждение одноразовое и только на свой номер', again.status === 428, again.data);

  head('Знакомый номер');
  const known = (await call(`/clients/check?phone=${fresh}`)).data;
  check('номер известен и с паролем', known?.known === true && known?.hasPassword === true, known);
  const login = await call('/clients/login', { method: 'POST', body: { phone: fresh, password: 'padel-2026' } });
  check('вход по паролю работает', login.status < 300 && !!login.data?.token, login.data);
  const started = await call('/clients/call/start', { method: 'POST', body: { phone: fresh } });
  check('зарегистрированному номеру звонок не предлагают',
    started.status === 409 && started.data?.code === 'phone_taken', started.data);

  // Возвращаем как было: с включённым подтверждением прочие проверки
  // не смогут завести клиента — они не присылают подтверждение
  await call('/admin/settings', { method: 'POST', token: adm, body: { phoneVerifyOn: false } });

  console.log(bad ? `\n\x1b[31mНе прошло: ${bad}\x1b[0m` : '\n\x1b[32mВсё прошло\x1b[0m');
  process.exit(bad ? 1 : 0);
})();
