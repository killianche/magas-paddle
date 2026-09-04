const { chromium } = require('playwright');
const B = process.env.APP_URL || 'https://padel.217-114-8-196.sslip.io/v1';
let fails=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
  await p.goto(`${B}/`,{waitUntil:'networkidle'}); await p.waitForTimeout(1700);

  console.log('\nДОСТУПНОСТЬ: ГЛАВНАЯ');
  const h = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="button"]')];
    return { total: btns.length,
      noName: btns.filter(e => !(e.getAttribute('aria-label')||e.innerText||'').trim()).length,
      cta: !!btns.find(e => (e.innerText||'').trim() === 'Записаться'),
      courts: btns.filter(e => /Корт \d/.test(e.getAttribute('aria-label')||'')).length };
  });
  ok(h.noName === 0, `все ${h.total} кнопок главной озвучены`);
  ok(h.cta, 'есть большая кнопка «Записаться»');
  ok(h.courts >= 5, `карточки площадок подписаны: ${h.courts}`);

  await p.goto(`${B}/schedule`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);

  console.log('\nДОСТУПНОСТЬ: ЭКРАН ВЫБОРА ВРЕМЕНИ');
  const r = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('[role="button"]')];
    const noName = btns.filter(e => !(e.getAttribute('aria-label')||e.innerText||'').trim()).length;
    const cells = btns.filter(e => (e.getAttribute('aria-label')||'').includes(':00'));
    return { total: btns.length, noName, cells: cells.length,
      sample: cells.slice(0,3).map(e=>e.getAttribute('aria-label')),
      disabled: btns.filter(e=>e.getAttribute('aria-disabled')==='true').length };
  });
  ok(r.noName === 0, `все ${r.total} кнопок озвучены (без имени: ${r.noName})`);
  ok(r.cells >= 30, `клетки сетки подписаны для VoiceOver: ${r.cells}`);
  ok(r.disabled > 0, `занятые клетки помечены недоступными: ${r.disabled}`);
  console.log('    пример: ' + r.sample.join(' / '));

  console.log('\nПОДЗАГОЛОВОК');
  ok(/свободно \d+ из \d+ площадок/.test(await p.evaluate(()=>document.body.innerText)),
     'сегодня — счёт свободных площадок');
  // Второй день в ленте — всегда «завтра», как бы он ни назывался
  await p.locator('[role="button"]').filter({ hasText: /^(Пн|Вт|Ср|Чт|Пт|Сб|Вс)\d+$/ }).first()
    .click(); await p.waitForTimeout(1500);
  const t = await p.evaluate(()=>document.body.innerText);
  const m = t.match(/[Сс]вободно (\d+) час[а-яё]* за день/);
  ok(!!m, 'другой день — счёт свободных часов: ' + (m ? m[0] : 'НЕТ'));

  console.log('\nВЫДЕЛЕНИЕ ВЫБОРА');
  await p.locator('[aria-label*="свободно"]').first().click(); await p.waitForTimeout(600);
  const two = await p.getByText('2 часа').first();
  if (await two.count()) { await two.click(); await p.waitForTimeout(700) }
  const sel = await p.evaluate(() =>
    [...document.querySelectorAll('[aria-label*="выбрано"]')].map(e=>e.getAttribute('aria-label')));
  ok(sel.length >= 1, 'выбор озвучен для VoiceOver: ' + sel.join(' + '));
  const lime = await p.evaluate(() => [...document.querySelectorAll('[aria-label*="выбрано"]')]
    .filter(e => getComputedStyle(e).backgroundColor === 'rgb(198, 240, 51)').length);
  ok(lime === sel.length, `выбранные клетки подсвечены: ${lime}`);

  await b.close();
  console.log(fails ? `\nПРОБЛЕМ: ${fails}` : '\nДОСТУПНОСТЬ В ПОРЯДКЕ');
})();
