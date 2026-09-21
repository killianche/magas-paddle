const API = 'http://127.0.0.1:3101/api';
const out = []; const say = (g, w, d = '') => out.push((g ? '  ✓ ' : '  ✗ ') + w + (d ? ' — ' + d : ''));
const call = async (p, o = {}) => {
  const r = await fetch(API + p, { method: o.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}) },
    body: o.body ? JSON.stringify(o.body) : undefined });
  let d = null; try { d = await r.json() } catch {}
  return { status: r.status, data: d };
};
(async () => {
  const adm = (await call('/admin/login', { method: 'POST',
    body: { login: 'vladelec', password: process.env.STAND_PASS } })).data.token;
  say((await call('/admin/telegram', { token: adm })).status === 200, 'владелец видит раздел Telegram');

  const mgr = await call('/admin/staff', { method: 'POST', token: adm, body: { login: 'mgrfull', name: 'Менеджер',
    perms: ['club', 'clients', 'cancel', 'refunds', 'analytics', 'prices', 'tournaments', 'stock', 'coaches', 'staff'] } });
  const mt = (await call('/admin/login', { method: 'POST',
    body: { login: 'mgrfull', password: mgr.data.password } })).data.token;

  const probes = [
    ['список получателей', '/admin/telegram', 'GET', undefined],
    ['добавить ID', '/admin/telegram/allow', 'POST', { chatId: '999001' }],
    ['ссылка-приглашение', '/admin/telegram/link', 'POST', {}],
    ['пробный итог', '/admin/telegram/test', 'POST', {}],
  ];
  for (const [what, path, method, body] of probes) {
    const r = await call(path, { method, token: mt, body });
    say(r.status === 403, 'менеджеру закрыто: ' + what, r.status === 403 ? '' : 'отдал ' + r.status);
  }
  say((await call('/admin/day?date=2026-09-21', { token: mt })).status === 200,
    'остальная работа менеджера не задета');
  console.log(out.join('\n'));
})();
