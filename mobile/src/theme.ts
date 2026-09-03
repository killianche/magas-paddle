// Токены оформления. Значения проверены на контраст по WCAG AA — см. docs/BRAND.md.
export const C = {
  ink: '#0B0F0C',
  ink2: '#12180F',
  surface: '#171E16',
  surface2: '#212A1F',
  surface3: '#2A3427',
  line: '#2C3729',
  lineSoft: '#222B20',
  lineStrong: '#576D51',   // 3,01:1 — граница поля ввода
  lime: '#C6F033',
  limeDim: '#9BC020',
  onLime: '#0B0F0C',       // текст на лаймовой заливке, 14,63:1
  greenDeep: '#1B5E20',
  greenMid: '#3DA84A',
  text: '#EDF2E9',
  dim: '#9AA795',
  dim2: '#889085',         // 5,86:1
  amber: '#F0A93B',
  busy: '#869182',         // 5,87:1
  red: '#E5644B',
} as const;

// Шкала как у Dynamic Type — размеры совпадают с системными стилями iOS
export const T = {
  largeTitle: 34, title1: 28, title2: 22, title3: 20,
  headline: 17, body: 17, callout: 16, subhead: 15,
  footnote: 13, caption1: 12, caption2: 11,
} as const;

export const R = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;
export const S = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

// Минимальная зона нажатия по требованию Apple
export const HIT = 44;

/** Плакатный гротеск для крупных заголовков. Подключается в app/_layout.tsx. */
export const DISP = 'Oswald-Bold';
export const DISP_MED = 'Oswald-Medium';
