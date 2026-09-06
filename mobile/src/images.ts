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
export const HERO = require('../assets/img/hero.webp');
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
