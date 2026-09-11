// Цвет покрытия и особенности корта — ярлыки, которые клуб задаёт в админке.
//
// Пока клуб их не заполнил, ничего не рисуется: какой корт синий, а какой
// ультраширокий, знает только клуб, выдумывать это нельзя.
import { StyleSheet, Text, View } from 'react-native';
import { C, BODY, EYEBROW, sheet } from '../theme';
import type { CourtColor } from '../api';

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
    paddingHorizontal: 8, borderWidth: 1, borderColor: C.lineStrong },
  onPhoto: { backgroundColor: 'rgba(2,7,5,0.62)', borderColor: 'rgba(255,255,255,0.28)' },
  swatch: { width: 10, height: 10 },
  t: { ...EYEBROW, color: C.text, letterSpacing: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lineT: { fontFamily: BODY, color: C.dim, fontSize: 11, flexShrink: 1 },
}));
