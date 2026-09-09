// Общие части оформления «Velocity»: их использует больше одного экрана.
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';
import { C, S, HIT, TITLE, DISP, DISP_MED } from '../theme';

/** Слово контуром — приём из макета: вторая строка заголовка не залита,
 *  а обведена. В React Native обводки текста нет вовсе, поэтому рисуем
 *  через SVG: библиотека уже есть в проекте, отдельной зависимости не нужно. */
export function OutlineText({ children, size, width }: {
  children: string; size: number; width: number;
}) {
  const h = Math.round(size * 1.08);
  return (
    <Svg width={width} height={h} accessibilityLabel={children}>
      <SvgText
        x={0} y={size * 0.86}
        fontFamily={DISP} fontSize={size}
        letterSpacing={-size * 0.018}
        fill="none" stroke={C.text} strokeWidth={1.5}>
        {children}
      </SvgText>
    </Svg>
  );
}

/** Мелкая надпись вразрядку над заголовком. */
export function Eyebrow({ children, muted }: { children: string; muted?: boolean }) {
  return <Text style={[v.eyebrow, muted && { color: C.dim2 }]}>{children}</Text>;
}

/** Заголовок раздела в две строки, как в макете: «Courts / ready now». */
export function SectionHead({ title, action, onAction }: {
  title: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={v.head}>
      <Text style={v.headT} allowFontScaling={false}>{title}</Text>
      {!!action && (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={10}
          style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Text style={v.headA}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Бегущая строка с фактами о клубе. Не двигается: движение на первом экране
    отвлекает от кнопки, а роль строки — сказать три вещи разом. */
export function Ticker({ items }: { items: string[] }) {
  return (
    <View style={v.ticker}>
      {items.map((t, i) => (
        <View key={i} style={v.tickerItem}>
          <View style={v.dot} />
          <Text style={v.tickerT} numberOfLines={1}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

/** Прямоугольная кнопка-акцент во всю ширину. */
export function Action({ label, note, onPress, disabled }: {
  label: string; note?: string; onPress?: () => void; disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button"
      accessibilityLabel={note ? `${label}. ${note}` : label}
      style={({ pressed }) => [v.action, disabled && v.actionOff,
        pressed && !disabled && { opacity: 0.9 }]}>
      <Text style={[v.actionT, disabled && { color: C.busy }]}>{label}</Text>
      {!!note && <Text style={[v.actionN, disabled && { color: C.busy }]}>{note}</Text>}
    </Pressable>
  );
}

export const v = StyleSheet.create({
  eyebrow: { color: C.lime, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.6,
    textTransform: 'uppercase' },

  head: { paddingHorizontal: S.xl, paddingTop: 26, paddingBottom: 12,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  headT: { ...TITLE.section, color: C.text, textTransform: 'uppercase', flex: 1 },
  headA: { color: C.lime, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.3,
    textTransform: 'uppercase' },

  ticker: { height: 37, flexDirection: 'row', alignItems: 'center', gap: 18,
    paddingHorizontal: S.xl, borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  tickerItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  dot: { width: 4, height: 4, backgroundColor: C.lime },
  tickerT: { color: '#C1CAC3', fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.1,
    textTransform: 'uppercase' },

  action: { backgroundColor: C.lime, paddingVertical: 15, paddingHorizontal: 18,
    minHeight: HIT, justifyContent: 'center' },
  actionOff: { backgroundColor: '#15251B' },
  actionT: { color: C.onLime, fontFamily: DISP, fontSize: 15, letterSpacing: 0.4,
    textTransform: 'uppercase' },
  actionN: { color: 'rgba(7,16,8,.62)', fontFamily: DISP_MED, fontSize: 11,
    letterSpacing: 0.6, marginTop: 3 },
});
