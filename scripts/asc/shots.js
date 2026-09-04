// Скриншоты для App Store. Apple принимает 6.9" (1290x2796) — этого размера
// достаточно, остальные размеры магазин масштабирует сам.
const { chromium } = require('playwright');
const B='https://padel.217-114-8-196.sslip.io/v1';
const W=430, H=932;   // логические точки; при deviceScaleFactor 3 даёт 1290x2796
const scroll = async (p,y)=>{await p.evaluate(y=>{const sc=[...document.querySelectorAll('div')]
  .find(d=>d.scrollHeight>d.clientHeight+40&&getComputedStyle(d).overflowY!=='visible');
  if(sc) sc.scrollTop=y; else window.scrollTo(0,y);},y); await p.waitForTimeout(700);};
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:3,isMobile:true,hasTouch:true});

  await p.goto(`${B}/`,{waitUntil:'networkidle'}); await p.waitForTimeout(2000);
  await p.screenshot({path:'as-1-home.png'});

  await p.getByRole('button',{name:'Записаться'}).click(); await p.waitForTimeout(1600);
  await p.getByRole('button',{name:/Корт 1, 18:00, свободно/}).click(); await p.waitForTimeout(500);
  await p.getByText('2 часа').first().click(); await p.waitForTimeout(700);
  await p.screenshot({path:'as-2-grid.png'});

  await p.goto(`${B}/court?id=c1&hour=18`,{waitUntil:'networkidle'}); await p.waitForTimeout(1800);
  await p.screenshot({path:'as-3-court.png'});

  await p.goto(`${B}/tournaments`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
  await p.screenshot({path:'as-4-tournaments.png'});

  await p.goto(`${B}/club`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
  await p.screenshot({path:'as-5-club.png'});

  await b.close();
  console.log('снято 5 экранов');
})();
