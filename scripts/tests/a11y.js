const { chromium } = require('playwright');
const B = process.env.APP_URL || 'https://padel.217-114-8-196.sslip.io/v1';
let fails=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.goto(`${B}/`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);

  console.log('\nДОСТУПНОСТЬ: ГЛАВНАЯ');
  const r = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="button"]')];
    const noName = btns.filter(e => !(e.getAttribute('aria-label')||e.innerText||'').trim()).length;
    const cells = btns.filter(e => (e.getAttribute('aria-label')||'').includes(':00'));
    return { total: btns.length, noName, cells: cells.length,
      sample: cells.slice(0,3).map(e=>e.getAttribute('aria-label')),
      disabled: btns.filter(e=>e.getAttribute('aria-disabled')==='true').length };
  });
  ok(r.noName === 0, `все ${r.total} кнопок озвучены (без имени: ${r.noName})`);
  ok(r.cells === 36, `клетки открытых площадок подписаны: ${r.cells} (6 часов x 6 площадок)`);
  ok(r.disabled > 0, `занятые клетки помечены недоступными: ${r.disabled}`);
  console.log('    пример: ' + r.sample.join(' / '));

  console.log('\nПОДЗАГОЛОВОК');
  ok((await p.evaluate(()=>document.body.innerText)).includes('сейчас свободно 5 из 6'),
     'сегодня — «сейчас свободно 5 из 6»');
  await p.getByText('Ср', { exact: true }).click(); await p.waitForTimeout(1000);
  const t = await p.evaluate(()=>document.body.innerText);
  const m = t.match(/свободно (\d+) час[а-яё]* за день/);
  ok(!!m, 'другой день — счёт свободных часов: ' + (m ? m[0] : 'НЕТ'));

  console.log('\nВЫДЕЛЕНИЕ ВЫБОРА');
  await p.getByText('Сегодня').first().click(); await p.waitForTimeout(700);
  await p.getByRole('button',{name:/Корт 5, 20:00, свободно/}).click(); await p.waitForTimeout(500);
  await p.getByText('2 часа').first().click(); await p.waitForTimeout(600);
  const sel = await p.evaluate(() =>
    [...document.querySelectorAll('[aria-label*="выбрано"]')].map(e=>e.getAttribute('aria-label')));
  ok(sel.length === 2, 'два часа озвучены как выбранные: ' + sel.join(' + '));
  const lime = await p.evaluate(() => [...document.querySelectorAll('[aria-label*="Корт 5"]')]
    .filter(e => getComputedStyle(e).backgroundColor === 'rgb(198, 240, 51)').length);
  ok(lime === 2, 'обе клетки подсвечены в сетке: ' + lime);

  await b.close();
  console.log(fails ? `\nПРОБЛЕМ: ${fails}` : '\nДОСТУПНОСТЬ В ПОРЯДКЕ');
})();
