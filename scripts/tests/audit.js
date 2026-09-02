const { chromium } = require('playwright');
const B = process.env.APP_URL || 'https://padel.217-114-8-196.sslip.io/v1';
const V={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};

const routes = ['/', '/tournaments', '/bookings', '/court?id=c1&hour=18', '/court',
  '/court?id=zzz', '/tournament?id=t1', '/tournament', '/tournament?id=zzz',
  '/book?courtId=c1&name=%D0%9A%D0%BE%D1%80%D1%82%201&hour=18&hours=1&price=4500',
  '/book', '/sent?name=X&hour=18&hours=1&price=4500', '/sent', '/grid', '/nope'];

(async () => {
  const b = await chromium.launch();
  for (const r of routes) {
    const p = await b.newPage(V);
    const errs=[], warns=[];
    p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
    p.on('console', m => { if (m.type()==='error') warns.push(m.text().slice(0,120)) });
    let status = 0;
    try {
      const resp = await p.goto(B+r, {waitUntil:'networkidle', timeout:30000});
      status = resp ? resp.status() : 0;
      await p.waitForTimeout(1600);
    } catch(e) { errs.push('НАВИГАЦИЯ: '+String(e).split('\n')[0]) }
    const text = await p.evaluate(() => document.body.innerText.replace(/\s+/g,' ').trim().slice(0,90));
    console.log(`${status} ${r}`);
    console.log(`   текст: ${text || '(ПУСТО)'}`);
    if (errs.length) console.log('   ОШИБКИ: ' + [...new Set(errs)].join(' | '));
    if (warns.length) console.log('   консоль: ' + [...new Set(warns)].slice(0,2).join(' | '));
    await p.close();
  }
  await b.close();
})();
