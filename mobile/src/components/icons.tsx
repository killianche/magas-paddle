// Иконки. Рисованные линией, в духе SF Symbols: одна толщина, скруглённые концы,
// оптический размер 24. Никаких эмодзи — они выглядят как заглушка, а не как продукт.
import Svg, { Path, Circle, Rect, Line, Ellipse } from 'react-native-svg';
import { C } from '../theme';

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

/** Знак клуба: щит, скрещённые падел-лопатки, мяч.
    Раньше ручки рисовались двумя линиями и читались просто как крестик —
    добавлены головки лопаток, иначе ракеток в знаке не видно. */
export function Mark({ size = 30 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 26 30" fill="none">
      <Path d="M13 1 24.5 6.2v11.4C24.5 24 19.4 27.6 13 29 6.6 27.6 1.5 24 1.5 17.6V6.2L13 1Z"
        fill={C.greenDeep} stroke={C.lime} strokeWidth={1.3} strokeLinejoin="round" />
      <Ellipse cx="9.3" cy="13" rx="3" ry="4" transform="rotate(-30 9.3 13)"
        stroke={C.text} strokeWidth={1.5} />
      <Ellipse cx="16.7" cy="13" rx="3" ry="4" transform="rotate(30 16.7 13)"
        stroke={C.text} strokeWidth={1.5} />
      <Path d="M11.5 16.6 14.6 22M14.5 16.6 11.4 22"
        stroke={C.text} strokeWidth={1.5} strokeLinecap="round" />
      <Circle cx="13" cy="7" r="1.7" fill={C.lime} />
    </Svg>
  );
}

/** Мяч — колонка мини-футбольного поля */
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
