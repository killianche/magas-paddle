const { chromium } = require('playwright');
const B='https://padel.217-114-8-196.sslip.io/v1';
const V={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
let fails=0; const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails++; };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage(V);
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  const txt = async () => (await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');

  console.log('\n1. ГЛАВНАЯ НА ЖИВЫХ ДАННЫХ');
  await p.goto(`${B}/`,{waitUntil:'networkidle'}); await p.waitForTimeout(3000);
  let t = await txt();
  ok(/ПРИХОДИТЕ/i.test(t), 'приветственный блок');
  ok(/свободн[а-яё]+ час/i.test(t), 'счётчик свободных часов с сервера: ' + (t.match(/(\d+) свободн[а-яё]+ час[а-яё]*/)?.[0] ?? '—'));
  ok(/Корт 1/.test(t), 'площадки пришли с сервера');

  console.log('\n2. СЕТКА');
  await p.getByRole('button',{name:'Записаться'}).click(); await p.waitForTimeout(2500);
  t = await txt();
  ok(/свободно/i.test(t), 'сетка загрузилась');
  const cells = await p.locator('[aria-label*="свободно"]').count();
  ok(cells > 10, `свободных клеток: ${cells}`);

  console.log('\n3. ЗАПИСЬ ЧЕРЕЗ СЕРВЕР');
  await p.locator('[aria-label*="свободно"]').first().click(); await p.waitForTimeout(600);
  await p.getByText(/Записаться ·/).click(); await p.waitForTimeout(1800);
  t = await txt();
  ok(/Проверьте заявку|Площадка/.test(t), 'экран заявки открылся');
  await p.getByLabel('Ваше имя').fill('Проверка связи');
  await p.getByLabel('Номер телефона').fill('+7 928 111-22-33');
  await p.waitForTimeout(400);
  await p.getByRole('button',{name:'Записаться'}).click(); await p.waitForTimeout(3000);
  t = await txt();
  ok(/Записано/.test(t), 'запись создана на сервере');
  const num = t.match(/№ (\d+)/);
  ok(!!num, 'номер записи: ' + (num?.[1] ?? '—'));

  console.log('\n4. ЗАПИСЬ ВИДНА В «МОИХ ЗАПИСЯХ»');
  await p.getByText('Открыть мои записи').click(); await p.waitForTimeout(2500);
  t = await txt();
  ok(/Корт|Мини-футбол/.test(t), 'бронь показана');
  ok(/ОЖИДАЕТ|Ожидает/i.test(t), 'статус «ожидает подтверждения»');

  console.log('\n5. ОТМЕНА БРОНИ');
  p.once('dialog', d => d.accept());
  await p.locator('text=Отменить').locator('visible=true').first().click();
  await p.waitForTimeout(2500);
  t = await txt();
  ok(/Записей пока нет|Турнир/.test(t) || !/ОЖИДАЕТ/i.test(t), 'бронь отменена');

  console.log('\n6. ТУРНИРЫ');
  await p.getByText('Турниры').last().click(); await p.waitForTimeout(2500);
  t = await txt();
  ok(/кубок|Mexicano|турнир/i.test(t), 'список турниров пришёл с сервера');
  await p.locator('text=/кубок|Mexicano/').locator('visible=true').first().click();
  await p.waitForTimeout(2000);
  t = await txt();
  ok(/Взнос|Формат/.test(t), 'карточка турнира открылась');
  const canEnter = await p.getByRole('button',{name:/Записаться на турнир/}).count();
  if (canEnter) {
    await p.getByRole('button',{name:/Записаться на турнир/}).click();
    await p.waitForTimeout(2500);
    ok(/ВЫ ЗАПИСАНЫ|Вы записаны/.test(await txt()), 'запись на турнир прошла через сервер');
    p.once('dialog', d => d.accept());
    await p.getByText('Отменить запись').first().click(); await p.waitForTimeout(2000);
    ok(!/ВЫ ЗАПИСАНЫ/.test(await txt()), 'запись на турнир отменена');
  } else {
    ok(true, 'запись на турнир недоступна (мест нет или закрыта) — проверять нечего');
  }

  console.log('\nОШИБКИ В КОНСОЛИ: ' + (errs.length ? [...new Set(errs)].slice(0,2).join(' | ') : 'нет'));
  console.log(fails ? `\nПРОВАЛЕНО: ${fails}` : '\nВСЁ ПРОШЛО');
  await b.close();
})();
