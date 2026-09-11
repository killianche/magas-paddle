// Оформление «Velocity» — по макету заказчика MAGAS-PADEL-Velocity.
//
// Что отличает эту систему от прежней:
//  · почти чёрный фон вместо тёмно-зелёного, панели заметно светлее фона;
//  · прямые углы. Скруглений нет нигде, кроме круглых кнопок — это главный
//    признак макета, и именно он даёт ощущение спортивной строгости;
//  · заголовки очень жирные, прописные, с ОТРИЦАТЕЛЬНЫМ трекингом и
//    межстрочным меньше кегля — буквы стоят вплотную;
//  · мелкие надписи наоборот с широкой разрядкой.
//
// Шрифт. В макете стоял Archivo Black, но **кириллицы в нём нет ни в одном
// начертании** — русские заголовки в браузере молча подменялись системным
// шрифтом. Взят Inter: то же семейство, что в макете для текста, начертание
// 900 держит тот же плакатный вес, и кириллица полная. Статические начертания
// собраны из переменного шрифта и урезаны до латиницы с кириллицей —
// 53 КБ на файл вместо 876 КБ исходника.
//
// Две темы: тёмная (основная, как в макете) и светлая — по просьбе заказчика.
// Выбирается в «Аккаунте»: тёмная, светлая или как в телефоне.
//
// Как устроено переключение. Цвета лежат в объекте C, и при смене темы он
// переписывается целиком. Стили экранов собираются через sheet(): это тот же
// StyleSheet.create, только пересобирается при смене темы. Экраны вызывают
// useTheme() и перерисовываются. Навигация при этом не сбрасывается —
// человек остаётся там, где переключил.
import { useSyncExternalStore } from 'react';
import { StyleSheet } from 'react-native';

export type Mode = 'dark' | 'light';

const DARK = {
  mode: 'dark' as Mode,

  /** Фон приложения */
  ink: '#020705',
  /** Фон панелей поверх основного */
  ink2: '#06120D',
  surface: '#0A1D14',
  surface2: '#10281C',
  surface3: '#163424',

  /** Разделители: тонкие светлые линии поверх тёмного */
  line: 'rgba(255,255,255,0.11)',
  lineSoft: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.24)',

  /** Акцент — «вольт». Кислотно-салатовый, только на важном. Это ЗАЛИВКА:
   *  кнопки, плашки, выбранное время. Для текста и значков — accent. */
  lime: '#C9F23D',
  limeDim: '#9CBE2C',
  /** Текст на заливке акцентом */
  onLime: '#071008',
  /** Акцент текстом и значками. На тёмном это тот же салатовый, на светлом —
   *  тёмно-оливковый: салатовые буквы на белом не читаются. */
  accent: '#C9F23D',
  accentLine: 'rgba(201,242,61,0.5)',
  accentSoft: 'rgba(198,240,51,0.07)',
  accentBorder: 'rgba(198,240,51,0.3)',

  greenDeep: '#0A1D14',
  greenMid: '#3DA84A',

  text: '#F5F8F2',
  dim: '#A5B0A8',
  dim2: '#849188',
  busy: '#4C5A50',

  amber: '#F0A93B',
  red: '#FF5538',

  /** Предупреждения и ошибки: подложка, рамка, текст */
  warnSoft: 'rgba(240,169,59,0.08)',
  warnBorder: 'rgba(240,169,59,0.36)',
  warnText: '#DFCCA8',
  dangerSoft: 'rgba(229,100,75,0.1)',
  dangerBorder: 'rgba(229,100,75,0.4)',
  dangerText: '#F0B6A8',
  /** Занятое время в записи */
  busyText: '#D98B7C',
  busyLine: 'rgba(255,85,56,0.3)',

  /** Нижняя панель брони, затемнение под окнами, выключенная кнопка */
  sheet: 'rgba(6,18,13,0.98)',
  scrim: 'rgba(2,7,5,0.72)',
  off: '#15251B',

  /** Стекло панели вкладок и полосы под часами */
  blur: 'dark' as Mode,
  glass: 'rgba(6,18,13,0.62)',
  glassWeb: 'rgba(6,18,13,0.35)',
  glassLine: 'rgba(255,255,255,0.14)',
  topGlassA: 'rgba(9,13,10,0.72)',
  topGlassB: 'rgba(9,13,10,0.34)',
  shadow: 0.45,
  tabInactive: '#8D9A91',

  ticker: '#C1CAC3',
  /** День недели на выбранной (инверсной) плашке даты */
  dayOnW: '#647068',
};

export type Palette = typeof DARK;

/** Светлая тема. Бренд тот же: салатовый остаётся заливкой главных кнопок,
 *  тёмный текст, белые панели на чуть тёплом светлом фоне. Текст акцентом —
 *  тёмно-оливковый, чтобы читался на белом (контраст выше 4.5). */
const LIGHT: Palette = {
  mode: 'light',

  ink: '#F2F4EF',
  ink2: '#FFFFFF',
  surface: '#FFFFFF',
  surface2: '#EBEFE8',
  surface3: '#DFE6DA',

  line: 'rgba(7,16,8,0.11)',
  lineSoft: 'rgba(7,16,8,0.06)',
  lineStrong: 'rgba(7,16,8,0.24)',

  lime: '#C9F23D',
  limeDim: '#4A7300',
  onLime: '#071008',
  accent: '#4A7300',
  accentLine: 'rgba(74,115,0,0.5)',
  accentSoft: 'rgba(150,200,20,0.13)',
  accentBorder: 'rgba(74,115,0,0.32)',

  greenDeep: '#0A1D14',
  greenMid: '#2F8A3C',

  text: '#0B130D',
  dim: '#4A564E',
  dim2: '#5F6B63',
  busy: '#A9B3AC',

  amber: '#9A5A00',
  red: '#C8341A',

  warnSoft: 'rgba(214,137,16,0.10)',
  warnBorder: 'rgba(154,90,0,0.35)',
  warnText: '#6B4100',
  dangerSoft: 'rgba(200,52,26,0.07)',
  dangerBorder: 'rgba(200,52,26,0.35)',
  dangerText: '#A22E17',
  busyText: '#B04A35',
  busyLine: 'rgba(200,52,26,0.28)',

  sheet: 'rgba(255,255,255,0.98)',
  scrim: 'rgba(10,20,14,0.45)',
  off: '#E2E7DF',

  blur: 'light',
  glass: 'rgba(255,255,255,0.72)',
  glassWeb: 'rgba(255,255,255,0.62)',
  glassLine: 'rgba(7,16,8,0.12)',
  topGlassA: 'rgba(242,244,239,0.9)',
  topGlassB: 'rgba(242,244,239,0.55)',
  shadow: 0.16,
  tabInactive: '#5F6B63',

  ticker: '#3B473F',
  dayOnW: '#A5B0A8',
};

/** Текущие цвета. Объект один и тот же, при смене темы переписывается. */
export const C: Palette = { ...DARK };

let current: Mode = 'dark';
let version = 0;
const subs = new Set<() => void>();

/** Включить тему. Экраны с useTheme() перерисуются сами. */
export function applyTheme(mode: Mode) {
  if (mode === current) return;
  current = mode;
  Object.assign(C, mode === 'light' ? LIGHT : DARK);
  version++;
  // Веб: фон страницы за приложением — иначе при оттяге виден старый цвет
  if (typeof document !== 'undefined') document.body.style.backgroundColor = C.ink;
  subs.forEach(f => f());
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f) } };
const getVersion = () => version;

/** Подписка экрана на смену темы. Возвращает текущую тему. */
export function useTheme(): Mode {
  useSyncExternalStore(subscribe, getVersion, getVersion);
  return current;
}

/** StyleSheet, который пересобирается при смене темы.
 *
 *  Пишется как StyleSheet.create, только стили — функцией: sheet(() => ({…})).
 *  Обращение s.card всегда отдаёт стиль текущей темы. */
export function sheet<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  make: () => T & StyleSheet.NamedStyles<any>,
): T {
  let builtFor = -1;
  let styles = {} as T;
  const get = () => {
    if (builtFor !== version) { styles = StyleSheet.create(make()); builtFor = version }
    return styles;
  };
  return new Proxy({} as T, {
    get: (_, key) => (get() as any)[key],
    has: (_, key) => key in (get() as any),
    ownKeys: () => Reflect.ownKeys(get() as any),
    getOwnPropertyDescriptor: (_, key) => Reflect.getOwnPropertyDescriptor(get() as any, key),
  });
}

/** Углы. В макете почти всё прямое; pill остался для круглых кнопок. */
export const R = { sm: 0, md: 0, lg: 0, xl: 0, pill: 999 } as const;

export const S = { xs: 4, sm: 8, md: 12, lg: 14, xl: 18, xxl: 26 } as const;

// Минимальная зона нажатия по требованию Apple
export const HIT = 44;

/** Запас снизу под плавающей панелью вкладок: сама панель, её отступ от края
 *  и немного воздуха. Экраны внутри вкладок добавляют его к прокрутке,
 *  иначе последняя карточка уезжает под панель. */
export const TAB_SPACE = 104;

/** Плакатное начертание. Подключается в app/_layout.tsx. */
export const DISP = 'Inter-Black';
export const DISP_MED = 'Inter-SemiBold';
export const BODY = 'Inter-Regular';

/** Размеры и посадка заголовков — из макета.
 *  Межстрочный меньше кегля там задан как 0.82–0.9; в React Native при таком
 *  соотношении iOS срезает верх прописных, поэтому минимум 1.0 плюс запас.
 *
 *  Трекинг мягче макетного −0.05 em. В макете заголовки латиницей, а
 *  кириллические прописные шире: при исходной плотности пробел между словами
 *  пропадал совсем — «ЧАСЫ РАБОТЫ» читалось как одно слово. Оставлено ровно
 *  столько минуса, чтобы держался плакатный вид и слова не слипались. */
export const TITLE = {
  hero:    { fontFamily: DISP, fontSize: 52, lineHeight: 54, letterSpacing: -1.7 },
  page:    { fontFamily: DISP, fontSize: 42, lineHeight: 44, letterSpacing: -1.3 },
  section: { fontFamily: DISP, fontSize: 22, lineHeight: 24, letterSpacing: -0.3 },
  card:    { fontFamily: DISP, fontSize: 27, lineHeight: 29, letterSpacing: -0.5 },
  bar:     { fontFamily: DISP, fontSize: 17, lineHeight: 19, letterSpacing: -0.3 },
} as const;

/** Мелкая надпись вразрядку: «COURT CULTURE · MAGAS», «01 · Дата».
 *  В макете такие подписи 9 px, но макет — веб-страница на большом экране.
 *  На телефоне 9 pt читается с трудом, а этим стилем набраны в том числе
 *  «Ассаламу алейкум» и названия шагов записи. Взято 11 pt — нижняя граница
 *  из рекомендаций Apple по размеру шрифта; разрядка чуть уменьшена,
 *  чтобы строка занимала столько же места. */
export const EYEBROW = {
  fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase',
} as const;
