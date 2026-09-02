const { chromium } = require('playwright');
const B = process.env.APP_URL || 'https://padel.217-114-8-196.sslip.io/v1';
let fails=0;
const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails++; };

const pages = [['/', 'главная'], ['/tournaments','турниры'], ['/bookings','мои записи'],
  ['/court?id=c1&hour=18','корт'], ['/tournament?id=t1','турнир'],
  ['/book?courtId=c1&name=A&hour=18&hours=1&price=4500','заявка']];

(async () => {
  const b = await chromium.launch();
  for (const w of [320, 375, 390, 430]) {
    console.log(`\nШИРИНА ${w}pt`);
    for (const [url,label] of pages) {
      const p = await b.newPage({viewport:{width:w,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      await p.goto(B+url,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
      const r = await p.evaluate(() => {
        const small = [];
        document.querySelectorAll('[role="button"],[tabindex]').forEach(e => {
          const b = e.getBoundingClientRect();
          if (b.width === 0 || b.height === 0) return;
          if (b.height < 28 || b.width < 28) small.push(
            (e.innerText||e.getAttribute('aria-label')||'?').slice(0,22)+' '+Math.round(b.width)+'x'+Math.round(b.height));
        });
        return {
          small: [...new Set(small)].slice(0,4),
          overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        };
      });
      const bad = [];
      if (r.overflowX) bad.push(`горизонт. прокрутка ${r.scrollW}>${r.clientW}`);
      if (r.small.length) bad.push('мелкие цели: '+r.small.join(', '));
      ok(bad.length===0, `${label}${bad.length? ' — '+bad.join('; '):''}`);
      await p.close();
    }
  }
  await b.close();
  console.log(fails ? `\nПРОБЛЕМ: ${fails}` : '\nМЕТРИКИ В ПОРЯДКЕ');
})();
