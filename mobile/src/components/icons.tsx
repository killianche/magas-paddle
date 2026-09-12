// Иконки. Рисованные линией, в духе SF Symbols: одна толщина, скруглённые концы,
// оптический размер 24. Никаких эмодзи — они выглядят как заглушка, а не как продукт.
import { Image } from 'react-native';
import Svg, { Path, Circle, Rect, Line } from 'react-native-svg';
import { C } from '../theme';
import { LOGO, LOGO_RATIO } from '../images';

type P = { size?: number; color?: string; active?: boolean };

const base = (size: number, color: string, active?: boolean) => ({
  width: size, height: size, viewBox: '0 0 24 24',
  fill: 'none', stroke: color,
  strokeWidth: active ? 2.1 : 1.7,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
});

/** Дом — главная */
export function IconHome({ size = 24, color = C.dim2, active }: P) {
  return (
    <Svg {...base(size, color, active)}>
      <Path d="M3.5 10.2 12 3.5l8.5 6.7" />
      <Path d="M5.6 9v10.5h12.8V9" />
      <Path d="M9.9 19.5v-5.2h4.2v5.2" />
    </Svg>
  );
}

/** Сетка расписания */
export function IconGrid({ size = 24, color = C.dim2, active }: P) {
  return (
    <Svg {...base(size, color, active)}>
      <Rect x="3.2" y="4.6" width="17.6" height="15.8" rx="3" />
      <Line x1="3.2" y1="9.4" x2="20.8" y2="9.4" />
      <Line x1="9.1" y1="9.4" x2="9.1" y2="20.4" />
      <Line x1="14.9" y1="9.4" x2="14.9" y2="20.4" />
      <Line x1="7.8" y1="2.6" x2="7.8" y2="6.2" />
      <Line x1="16.2" y1="2.6" x2="16.2" y2="6.2" />
    </Svg>
  );
}

/** Кубок — турниры */
export function IconTrophy({ size = 24, color = C.dim2, active }: P) {
  return (
    <Svg {...base(size, color, active)}>
      <Path d="M7.4 3.6h9.2v5.1a4.6 4.6 0 0 1-9.2 0V3.6Z" />
      <Path d="M7.4 5.1H4.6v1.7a2.9 2.9 0 0 0 2.8 2.9" />
      <Path d="M16.6 5.1h2.8v1.7a2.9 2.9 0 0 1-2.8 2.9" />
      <Line x1="12" y1="13.3" x2="12" y2="17.4" />
      <Path d="M8.6 20.4h6.8" />
      <Path d="M9.9 17.4h4.2v3H9.9z" />
    </Svg>
  );
}

/** Билет — мои записи. Ракетка в 24px не читается: превращается то в лупу,
    то в лампочку. Билет однозначно значит «моя бронь». */
export function IconRacket({ size = 24, color = C.dim2, active }: P) {
  return (
    <Svg {...base(size, color, active)}>
      <Path d="M4.3 6.6h15.4c.7 0 1.2.6 1.2 1.2v2.3a1.9 1.9 0 0 0 0 3.8v2.3c0 .6-.5 1.2-1.2 1.2H4.3c-.7 0-1.2-.6-1.2-1.2v-2.3a1.9 1.9 0 0 0 0-3.8V7.8c0-.6.5-1.2 1.2-1.2Z" />
      <Path d="M14.6 7.4v1.7M14.6 11.2v1.7M14.6 15v1.6" strokeWidth={1.3} />
    </Svg>
  );
}

/** Календарь — выбор даты */
export function IconCalendar({ size = 22, color = C.text }: P) {
  return (
    <Svg {...base(size, color)}>
      <Rect x="3.4" y="5" width="17.2" height="15.4" rx="3" />
      <Line x1="3.4" y1="9.6" x2="20.6" y2="9.6" />
      <Line x1="8" y1="3" x2="8" y2="6.6" />
      <Line x1="16" y1="3" x2="16" y2="6.6" />
      <Circle cx="8.6" cy="13.6" r="1" fill={color} stroke="none" />
      <Circle cx="12" cy="13.6" r="1" fill={color} stroke="none" />
      <Circle cx="15.4" cy="13.6" r="1" fill={color} stroke="none" />
    </Svg>
  );
}

/** Стрелка — переход */
export function IconChevron({ size = 18, color = C.dim2 }: P) {
  return (
    <Svg {...base(size, color)}>
      <Path d="M9.5 5.5 16 12l-6.5 6.5" />
    </Svg>
  );
}

/** Знак клуба — настоящий логотип Magas Padel (щит, ракетки, мяч).
    Размер задаётся по высоте: щит вытянутый, ширина считается сама. */
export function Mark({ size = 34 }: { size?: number }) {
  return (
    <Image source={LOGO} accessibilityIgnoresInvertColors
      style={{ height: size, width: size * LOGO_RATIO }} resizeMode="contain" />
  );
}

/** Трубка — позвонить */
export function IconPhone({ size = 20, color = C.text }: P) {
  return (
    <Svg {...base(size, color)}>
      <Path d="M6.4 3.6h3l1.5 3.8-1.9 1.4a11 11 0 0 0 5.2 5.2l1.4-1.9 3.8 1.5v3a1.8 1.8 0 0 1-2 1.8C10.9 17.7 6.3 13.1 4.6 5.6a1.8 1.8 0 0 1 1.8-2Z" />
    </Svg>
  );
}

/** Человек — аккаунт. Тот же силуэт, что в системных иконках iOS:
    голова кружком и плечи дугой. */
export function IconAccount({ size = 20, color = C.text, active }: P) {
  return (
    <Svg {...base(size, color, active)}>
      <Circle cx="12" cy="8.4" r="3.9" />
      <Path d="M4.9 20.3c1.2-3.7 3.9-5.7 7.1-5.7s5.9 2 7.1 5.7" />
    </Svg>
  );
}

/** Колокольчик — уведомления клуба */
export function IconBell({ size = 20, color = C.text }: P) {
  return (
    <Svg {...base(size, color)}>
      <Path d="M18 9.4a6 6 0 1 0-12 0c0 4.1-1.3 5.6-2 6.3h16c-.7-.7-2-2.2-2-6.3Z" />
      <Path d="M10.2 19.2a2 2 0 0 0 3.6 0" />
    </Svg>
  );
}

/** Мяч — колонка футбольного поля */
export function IconBall({ size = 15, color = C.dim }: P) {
  return (
    <Svg {...base(size, color)}>
      <Circle cx="12" cy="12" r="9.2" />
      <Path d="M12 7.2 15.9 10l-1.5 4.6H9.6L8.1 10 12 7.2Z" />
      <Path d="M12 2.8v4.4M20.9 10.2 15.9 10M17.6 20.1l-3.2-5.5M6.4 20.1l3.2-5.5M3.1 10.2 8.1 10" strokeWidth={1.2} />
    </Svg>
  );
}

/** Галочка — подтверждение */
export function IconCheck({ size = 14, color = C.onLime, active }: P) {
  return (
    <Svg {...base(size, color, active)} strokeWidth={active ? 2.6 : 2.2}>
      <Path d="M4.6 12.4 9.5 17.2 19.4 6.8" />
    </Svg>
  );
}

/** Часы — ждём подтверждения */
export function IconClock({ size = 14, color = C.amber, active }: P) {
  return (
    <Svg {...base(size, color, active)} strokeWidth={active ? 2.2 : 1.9}>
      <Circle cx={12} cy={12} r={8.4} />
      <Path d="M12 7.2V12l3.2 2" />
    </Svg>
  );
}

/** Крестик — бронь не состоялась */
export function IconCross({ size = 14, color = C.dangerText, active }: P) {
  return (
    <Svg {...base(size, color, active)} strokeWidth={active ? 2.4 : 2.1}>
      <Path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />
    </Svg>
  );
}

/** Метка на карте — «мы здесь» */
export function IconPin({ size = 20, color = C.accent }: P) {
  return (
    <Svg {...base(size, color)}>
      <Path d="M12 21.2c4.1-4.4 6.2-7.8 6.2-10.4a6.2 6.2 0 1 0-12.4 0c0 2.6 2.1 6 6.2 10.4Z" />
      <Circle cx="12" cy="10.6" r="2.4" />
    </Svg>
  );
}

/** WhatsApp — трубка в облачке сообщения */
export function IconWhatsApp({ size = 20, color = '#04240F' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12.04 2.2c-5.4 0-9.8 4.4-9.8 9.8 0 1.73.45 3.4 1.32 4.89L2.2 21.8l5.05-1.32a9.76 9.76 0 0 0 4.79 1.22h.004c5.4 0 9.8-4.4 9.8-9.8s-4.4-9.7-9.8-9.7Zm0 17.86h-.004a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.07.8.82-3-.19-.31a8.09 8.09 0 0 1-1.24-4.32c0-4.48 3.65-8.13 8.14-8.13a8.13 8.13 0 0 1 .003 16.27Z" />
      <Path d="M16.5 14.3c-.24-.12-1.45-.72-1.68-.8-.22-.08-.39-.12-.55.12-.16.25-.63.8-.77.97-.14.16-.28.18-.53.06-.24-.12-1.03-.38-1.97-1.22-.73-.65-1.22-1.45-1.36-1.7-.14-.24-.02-.37.11-.5.11-.11.24-.28.36-.43.12-.14.16-.24.24-.4.08-.17.04-.31-.02-.43-.06-.12-.55-1.33-.75-1.82-.2-.47-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.85.83-.85 2.03s.87 2.35.99 2.51c.12.17 1.71 2.62 4.15 3.67.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.45-.59 1.65-1.17.2-.57.2-1.06.14-1.16-.06-.1-.22-.16-.46-.28Z" />
    </Svg>
  );
}

/** Instagram — рамка, объектив, вспышка */
export function IconInstagram({ size = 20, color = C.text }: P) {
  return (
    <Svg {...base(size, color)}>
      <Rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5.2" />
      <Circle cx="12" cy="12" r="4.1" />
      <Circle cx="16.9" cy="7.1" r="1.05" fill={color} stroke="none" />
    </Svg>
  );
}
