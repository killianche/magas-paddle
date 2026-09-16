// Цвет покрытия и особенности корта — ярлыки, которые клуб задаёт в админке.
//
// Пока клуб их не заполнил, ничего не рисуется: какой корт синий, а какой
// ультраширокий, знает только клуб, выдумывать это нельзя.
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Rect, Line, Circle, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { C, BODY, EYEBROW, sheet, R } from '../theme';
import type { CourtColor } from '../api';

/** Клуб отметил корт одиночным. */
export const isSingle = (tags?: string[]) =>
  (tags ?? []).some(t => t.toLowerCase().startsWith('одиноч'));

/** Клуб отметил корт ультрашироким. */
export const isWide = (tags?: string[]) =>
  (tags ?? []).some(t => t.toLowerCase().startsWith('ультрашир'));

/** Корт сверху, как на плане: покрытие цветом корта, белая разметка, сетка.
 *  Парный корт 20×10 м и одиночный 20×6 м — по правилам FIP, линии подачи
 *  в 6,95 м от сетки. Ультраширокий нарисован шире парного (13 м) — это
 *  условный знак, не размер: насколько он шире, клуб не сообщал
 *  (docs/OPEN-QUESTIONS.md, Q60). Высота плана у всех одна — под самый
 *  широкий, чтобы плитки в сетке были ровными. */
export function CourtPlan({ width, color, single, wide, dim }: {
  width: number; color?: CourtColor | null; single?: boolean; wide?: boolean; dim?: boolean;
}) {
  const pad = 6;
  const k = (width - pad * 2) / 20;                       // точек на метр
  const H = Math.round(13 * k + pad * 2);
  const w = 20 * k, h = (single ? 6 : wide ? 13 : 10) * k;
  const x0 = pad, y0 = (H - h) / 2, mid = y0 + h / 2;
  const svc = 3.05 * k;
  const fill = color?.hex ?? '#6B7A70';
  const line = 'rgba(255,255,255,0.92)';
  return (
    <Svg width={width} height={H} opacity={dim ? 0.4 : 1}>
      <Defs>
        <SvgGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.16" />
          <Stop offset="1" stopColor="#000000" stopOpacity="0.14" />
        </SvgGradient>
      </Defs>
      <Rect x={x0 - 2} y={y0 - 2} width={w + 4} height={h + 4} rx={4}
        fill="none" stroke="rgba(120,135,125,0.55)" strokeWidth={1.5} />
      <Rect x={x0} y={y0} width={w} height={h} rx={2.5} fill={fill} />
      <Rect x={x0} y={y0} width={w} height={h} rx={2.5} fill="url(#sheen)" />
      <Line x1={x0 + svc} y1={y0} x2={x0 + svc} y2={y0 + h} stroke={line} strokeWidth={1.2} />
      <Line x1={x0 + w - svc} y1={y0} x2={x0 + w - svc} y2={y0 + h} stroke={line} strokeWidth={1.2} />
      <Line x1={x0 + svc} y1={mid} x2={x0 + w - svc} y2={mid} stroke={line} strokeWidth={1.2} />
      <Line x1={x0 + w / 2} y1={y0 - 3} x2={x0 + w / 2} y2={y0 + h + 3}
        stroke="#F5F8F2" strokeWidth={2.4} strokeLinecap="round" />
      <Circle cx={x0 + w / 2} cy={y0 - 3} r={2.2} fill="#1C2420" />
      <Circle cx={x0 + w / 2} cy={y0 + h + 3} r={2.2} fill="#1C2420" />
    </Svg>
  );
}

/** Ярлыки в ряд: «▮ Синий», «Ультраширокий», «Одиночный». */
export function Look({ color, tags, onPhoto }: {
  color?: CourtColor | null; tags?: string[]; onPhoto?: boolean;
}) {
  const list = tags ?? [];
  if (!color && list.length === 0) return null;
  return (
    <View style={l.row}>
      {color && (
        <View style={[l.chip, onPhoto && l.onPhoto]}>
          <View style={[l.swatch, { backgroundColor: color.hex }]} />
          <Text style={l.t}>{color.name}</Text>
        </View>
      )}
      {list.map(t => (
        <View key={t} style={[l.chip, onPhoto && l.onPhoto]}>
          <Text style={l.t}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** Одной строкой — для маленьких плиток на главной: «▮ Синий · Ультраширокий». */
export function LookLine({ color, tags }: { color?: CourtColor | null; tags?: string[] }) {
  const parts = [color?.name, ...(tags ?? [])].filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <View style={l.line}>
      {color && <View style={[l.swatch, { backgroundColor: color.hex }]} />}
      <Text style={l.lineT} numberOfLines={1}>{parts.join(' · ')}</Text>
    </View>
  );
}

const l = sheet(() => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 26,
    paddingHorizontal: 8, borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.sm },
  onPhoto: { backgroundColor: 'rgba(2,7,5,0.62)', borderColor: 'rgba(255,255,255,0.28)' },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  t: { ...EYEBROW, color: C.text, letterSpacing: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineT: { fontFamily: BODY, color: C.dim, fontSize: 11, flexShrink: 1 },
}));
