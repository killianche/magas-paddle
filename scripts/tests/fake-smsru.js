/** Поддельный SMS.ru для стенда: callcheck/add и callcheck/status.
 *  Наружу ничего не уходит, звонок «совершается» запросом /__call.
 */
const http = require('http');
const PORT = Number(process.env.FAKE_SMSRU_PORT || 3198);
const checks = new Map();   // check_id → {phone, confirmed}
let seq = 0;

const body = req => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)) });
const send = (res, obj) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)) };

http.createServer(async (req, res) => {
  const [path, query] = req.url.split('?');
  const p = new URLSearchParams(await body(req) || query || '');

  if (path.endsWith('/add')) {
    const id = String(++seq);
    checks.set(id, { phone: p.get('phone'), confirmed: false });
    return send(res, { status: 'OK', status_code: 100, check_id: id,
      call_phone: '+78007779999', call_phone_pretty: '8-800-777-9999' });
  }
  if (path.endsWith('/status')) {
    const c = checks.get(p.get('check_id'));
    if (!c) return send(res, { status: 'OK', status_code: 100, check_status: 402 });
    return send(res, { status: 'OK', status_code: 100, check_status: c.confirmed ? 401 : 400 });
  }
  // Проверка «человек позвонил»: /__call?phone=7928...
  if (path === '/__call') {
    const phone = p.get('phone') || new URLSearchParams(query || '').get('phone');
    let hit = false;
    for (const c of checks.values()) if (c.phone === phone) { c.confirmed = true; hit = true }
    return send(res, { ok: hit });
  }
  if (path === '/__clear') { checks.clear(); return send(res, { ok: true }) }
  res.writeHead(404); res.end('{}');
}).listen(PORT, '127.0.0.1', () => console.log('поддельный SMS.ru на', PORT));
