const { chromium } = require('playwright');
const B = process.env.APP_URL || 'https://padel.217-114-8-196.sslip.io/v1';
const V={viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true};
let fails=0;
const ok=(c,m)=>{ console.log((c?'  ✓ ':'  ✗ ')+m); if(!c) fails++; };

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage(V);
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).split('\n')[0]));
  const txt = async () => (await p.evaluate(()=>document.body.innerText)).replace(/\s+/g,' ');

  console.log('\n1. ЗАПИСЬ НА КОРТ, ДВА ЧАСА');
  await p.goto(`${B}/schedule`,{waitUntil:'networkidle'}); await p.waitForTimeout(1600);
  await p.getByRole('button',{name:/Корт 1, 18:00, свободно/}).click(); await p.waitForTimeout(500);
  ok((await txt()).includes('18:00 – 19:00 · 4 500 ₽'), 'один час — 4 500 ₽');
  await p.getByText('2 часа').first().click(); await p.waitForTimeout(500);
  ok((await txt()).includes('18:00 – 20:00 · 9 000 ₽'), 'два часа — 9 000 ₽ (складывается по часам)');
  ok((await txt()).includes('подряд можно взять 2 часа'), 'объяснено, почему нельзя 3 часа');
  await p.getByText(/Записаться ·/).locator("visible=true").last().click(); await p.waitForTimeout(1300);
  ok((await txt()).includes('Проверьте заявку'), 'открылась заявка');
  ok((await txt()).includes('9 000 ₽'), 'сумма перенеслась');
  await p.getByText('Отправить заявку').click(); await p.waitForTimeout(1400);
  ok((await txt()).includes('Заявка принята'), 'заявка отправлена');

  console.log('\n2. МОИ ЗАПИСИ И ПОДТВЕРЖДЕНИЕ');
  await p.getByText('Открыть мои записи').click(); await p.waitForTimeout(1200);
  let t = await txt();
  ok(t.includes('Корт 1'), 'бронь появилась в списке');
  ok(t.includes('ОЖИДАЕТ'), 'статус «ожидает»');
  await p.waitForTimeout(6500);
  t = await txt();
  ok(t.includes('ПОДТВЕРЖДЕНО'), 'через 6 с менеджер подтвердил (заглушка пуша)');

  console.log('\n3. ОТМЕНА БРОНИ');
  p.once('dialog', d => d.accept());
  await p.locator("text=Отменить").locator("visible=true").first().click(); await p.waitForTimeout(1000);
  ok((await txt()).includes('Записей пока нет'), 'бронь отменена, список пуст');

  console.log('\n4. ТУРНИР');
  await p.getByText('Турниры').last().click(); await p.waitForTimeout(1200);
  await p.locator("text=Осенний кубок Магаса").locator("visible=true").first().click(); await p.waitForTimeout(1100);
  ok((await txt()).includes('6 из 20'), 'свободных мест 6 из 20');
  await p.getByText('Записаться на турнир').click(); await p.waitForTimeout(900);
  t = await txt();
  ok(t.includes('ВЫ ЗАПИСАНЫ'), 'отметка «вы записаны»');
  ok(t.includes('5 из 20'), 'счётчик мест уменьшился');
  await p.getByText('Мои записи').last().click(); await p.waitForTimeout(1100);
  ok((await txt()).includes('Осенний кубок'), 'турнир виден в «Моих записях»');
  p.once('dialog', d => d.accept());
  await p.locator("text=Отменить").locator("visible=true").first().click(); await p.waitForTimeout(900);
  ok((await txt()).includes('Записей пока нет'), 'запись на турнир отменена');

  console.log('\n5. ВРЕМЯ УВЕЛИ');
  await p.getByText('Запись').last().click(); await p.waitForTimeout(1100);
  ok((await txt()).includes('Выбрать время'), 'на главной есть кнопка «Выбрать время»');
  await p.getByRole('button',{name:/^Выбрать время/}).click(); await p.waitForTimeout(1300);
  ok((await txt()).includes('свободно'), 'кнопка открыла сетку');
  await p.getByRole('button',{name:/Корт 5, 21:00, свободно/}).click(); await p.waitForTimeout(500);
  await p.getByText(/Записаться ·/).locator("visible=true").last().click(); await p.waitForTimeout(1200);
  await p.getByText('Отправить заявку').click(); await p.waitForTimeout(1200);
  t = await txt();
  ok(t.includes('Это время только что заняли'), 'показан увод слота');
  ok(!t.includes('Мини-футбол'), 'мини-футбол не предлагается вместо корта');
  ok(t.includes('23:00 – 24:00'), 'предложено ближайшее время на той же площадке');
  await p.locator("text=Корт 1").locator("visible=true").first().click(); await p.waitForTimeout(1300);
  ok((await txt()).includes('Заявка принята'), 'замена довела до заявки');

  console.log('\n6. ДРУГОЙ ДЕНЬ И ДНЕВНОЙ ТАРИФ');
  await p.goto(`${B}/schedule`,{waitUntil:'networkidle'}); await p.waitForTimeout(1500);
  await p.getByText('Ср').click(); await p.waitForTimeout(700);
  // У корта 2 занято в 12:00 — два часа подряд с 11:00 взять нельзя
  await p.getByRole('button',{name:/Корт 2, 11:00, свободно/}).click(); await p.waitForTimeout(500);
  ok((await txt()).includes('3 000 ₽'), 'дневной тариф 3 000 ₽');
  await p.getByText('2 часа').first().click(); await p.waitForTimeout(400);
  ok((await txt()).includes('11:00 – 12:00 · 3 000 ₽'), 'недоступные два часа не выбираются');
  ok((await txt()).includes('свободен только один час'), 'сказано, почему только час');

  // У корта 1 свободны 11:00 и 12:00 — два дневных часа берутся
  await p.getByRole('button',{name:/Корт 1, 11:00, свободно/}).click(); await p.waitForTimeout(500);
  await p.getByText('2 часа').first().click(); await p.waitForTimeout(500);
  ok((await txt()).includes('11:00 – 13:00 · 6 000 ₽'), 'два дневных часа — 6 000 ₽');

  console.log('\n7. ГРАНИЦЫ ДНЯ');
  await p.getByRole('button',{name:/Корт 1, 23:00, свободно/}).click(); await p.waitForTimeout(500);
  ok((await txt()).includes('23:00 – 24:00'), 'последний час дня заканчивается в 24:00');
  ok((await txt()).includes('свободен только один час'), 'после закрытия часы не предлагаются');

  console.log('\nОШИБОК В КОНСОЛИ: ' + (errs.length ? [...new Set(errs)].join(' | ') : 'нет'));
  console.log(fails ? `\nПРОВАЛЕНО ПРОВЕРОК: ${fails}` : '\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
  await b.close();
  process.exit(fails ? 1 : 0);
})();
