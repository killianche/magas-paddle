// Скриншоты для App Store. Apple принимает 6.9" (1290×2796) — этого размера
// достаточно, остальные размеры магазин масштабирует сам.
//
// Снимаем с боевой веб-версии: это тот же код, что в приложении, и те же
// данные клуба. Каталог товаров в кадр намеренно не берём — там пока
// позиции с приставкой «ТЕСТ».
const { chromium } = require('playwright');
const B = process.env.SHOTS_BASE || 'https://padelmagas.ru/v1';
const W = 430, H = 932;   // логические точки; при deviceScaleFactor 3 даёт 1290×2796

/** Прокрутка внутри ScrollView, а не окна: у React Native Web свой контейнер. */
const scroll = async (p, y) => {
  await p.evaluate(y => {
    const sc = [...document.querySelectorAll('div')]
      .find(d => d.scrollHeight > d.clientHeight + 40 && getComputedStyle(d).overflowY !== 'visible');
    if (sc) sc.scrollTop = y; else window.scrollTo(0, y);
  }, y);
  await p.waitForTimeout(800);
};

(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const errs = []; p.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  const shot = async (n, name) => { await p.screenshot({ path: `as-${n}-${name}.png` }); console.log(`  снято ${n}. ${name}`) };

  await p.goto(`${B}/`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await shot(1, 'home');

  await p.goto(`${B}/courts`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2500);
  await shot(2, 'courts');

  // Страница корта: длительность и свободные часы с ценами.
  // Берём завтрашний день — сегодня к вечеру от сетки остаётся три часа.
  // Каталог проката в кадр не берём: там пока позиции с приставкой «ТЕСТ».
  await p.goto(`${B}/court?id=c1`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2800);
  const tomorrow = p.locator('text=/^\\d{1,2}$/').nth(1);
  if (await tomorrow.count()) { await tomorrow.click(); await p.waitForTimeout(2200) }
  await scroll(p, 430);
  await shot(3, 'court');

  // Турниры в витрину не берём: пока клуб их не объявил, экран пустой
  await p.goto(`${B}/prices`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2200);
  await shot(4, 'prices');

  await p.goto(`${B}/club`, { waitUntil: 'networkidle' }); await p.waitForTimeout(2200);
  await shot(5, 'club');

  console.log('ошибки страницы:', errs.length ? errs.slice(0, 4) : 'нет');
  await b.close();
})();
