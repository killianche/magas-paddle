// Фотографии клуба — прислал заказчик (f1–f8), разрешил использовать в
// приложении. Карточки и галереи кортов, обложка главной, обложки турниров.
// Своё фото площадки, загруженное в админке, показывается вместо этих.
const F1 = require('../assets/img/club-f1.webp');
const F2 = require('../assets/img/club-f2.webp');
const F3 = require('../assets/img/club-f3.webp');
const F4 = require('../assets/img/club-f4.webp');
const F5 = require('../assets/img/club-f5.webp');
const F6 = require('../assets/img/club-f6.webp');
const F8 = require('../assets/img/club-f8.webp');
/** Мини-футбольное поле — 777.png от заказчика (мяч и бутсы Padel Magas), обрезано в 4:3. */
const PITCH = require('../assets/img/club-777.webp');

export const IMG: Record<string, any> = {
  c1: F1, c2: F2, c3: F3, c4: F4, c5: F5, c6: F6,
  f1: PITCH,
};
/** Фотографии для галереи на экране площадки: первый кадр — карточка корта. */
export const COURT_PHOTOS: Record<string, any[]> = {
  c1: [F1, F8, F3],
  c2: [F2, F5, F4],
  c3: [F3, F1, F6],
  c4: [F4, F2, F5],
  c5: [F5, F6, F8],
  c6: [F6, F3, F1],
  f1: [PITCH],
};

/** Обложка главной — mm.png от заказчика (ракетка и мячи на закате), по его
 *  референсу первого экрана. Одна для обеих тем. */
const MM = require('../assets/img/club-mm.webp');
export const HERO = MM;
export const HERO_LIGHT = MM;

// Обложки турниров. Менеджер выбирает их в админке — здесь это ключ в данных.
export const TOURN_IMG: Record<string, any> = {
  t1: F6, t2: F2, t3: F1, t4: F5,
};

// Логотип клуба. Из него же собраны иконки приложения — scripts/brand/make-icons.py.
export const LOGO = require('../assets/img/logo.png');
export const LOGO_RATIO = 844 / 1182;   // щит вытянутый: ширина / высота
