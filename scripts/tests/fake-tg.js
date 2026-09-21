const http = require('http');
const sent = []; let queue = []; let nextId = 100;
http.createServer(async (req, res) => {
  const body = await new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)) });
  const m = req.url.split('/').pop();
  const data = body ? JSON.parse(body) : {};
  const ok = result => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result })) };
  if (m === 'getUpdates') { if (!queue.length) await new Promise(r => setTimeout(r, 900)); const out = queue; queue = []; return ok(out) }
  if (m === 'sendMessage') { sent.push(data); return ok({ message_id: ++nextId }) }
  if (m === 'answerCallbackQuery' || m === 'editMessageReplyMarkup') return ok(true);
  if (m === '__sent') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(sent)) }
  if (m === '__clear') { sent.length = 0; return ok(true) }
  if (m === '__push') { queue.push(data); return ok(true) }
  ok(true);
}).listen(3199, '127.0.0.1', () => console.log('поддельный Telegram на 3199'));
