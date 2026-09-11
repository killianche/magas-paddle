// Фотографии площадок. Свободные лицензии Pexels и Unsplash — docs/PHOTO-CREDITS.md.
// ЗАГЛУШКИ: это чужие корты. Заменяются на снимки клуба без изменения кода.
export const IMG: Record<string, any> = {
  c1: require('../assets/img/c1.webp'),
  c2: require('../assets/img/c2.webp'),
  c3: require('../assets/img/c3.webp'),
  c4: require('../assets/img/c4.webp'),
  c5: require('../assets/img/c5.webp'),
  c6: require('../assets/img/c1.webp'),
  f1: require('../assets/img/f1.webp'),
};
/** Фотографии для галереи на экране площадки.
 *  ЗАГЛУШКИ: у клуба пока по одному кадру на корт, и те чужие. Как только
 *  придут настоящие снимки — правится только этот список, код не трогается.
 *  ВОПРОС К ЗАКАЗЧИКУ: нужны 3–5 фотографий каждого корта. */
export const COURT_PHOTOS: Record<string, any[]> = {
  c1: [require('../assets/img/c1.webp'), require('../assets/img/club-hero.webp'),
       require('../assets/img/club-band.webp')],
  c2: [require('../assets/img/c2.webp'), require('../assets/img/club-band.webp')],
  c3: [require('../assets/img/c3.webp'), require('../assets/img/club-hero.webp')],
  c4: [require('../assets/img/c4.webp'), require('../assets/img/club-band.webp')],
  c5: [require('../assets/img/c5.webp'), require('../assets/img/club-hero.webp')],
  c6: [require('../assets/img/c1.webp'), require('../assets/img/club-band.webp')],
  f1: [require('../assets/img/f1.webp')],
};

// Снимки клуба, присланные заказчиком. В отличие от остальных — настоящие.
export const HERO = require('../assets/img/club-hero.webp');
/** Первый экран в светлой теме. ЗАГЛУШКА: присланные клубом снимки тёмные
 *  (яркость 47 из 255), на белом фоне такой кадр выглядит чужеродно. Здесь
 *  светлый снимок корта, пока клуб не загрузит свой в админке. */
export const HERO_LIGHT = require('../assets/img/c1.webp');
export const CLUB_BAND = require('../assets/img/club-band.webp');
export const TOURN = require('../assets/img/tourn.webp');

// Обложки турниров. Менеджер меняет их из админки — здесь это просто ключ в данных.
export const TOURN_IMG: Record<string, any> = {
  t1: require('../assets/img/t1.webp'),
  t2: require('../assets/img/t2.webp'),
  t3: require('../assets/img/t3.webp'),
  t4: require('../assets/img/t4.webp'),
};

// Логотип клуба. Из него же собраны иконки приложения — scripts/brand/make-icons.py.
export const LOGO = require('../assets/img/logo.png');
export const LOGO_RATIO = 844 / 1182;   // щит вытянутый: ширина / высота
