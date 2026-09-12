import { Pressable, Text, View, ViewStyle, TextStyle, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet } from '../theme';

export function Btn({ title, onPress, kind = 'primary', style }: {
  title: string; onPress?: () => void;
  kind?: 'primary' | 'ghost' | 'danger' | 'wa'; style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.lime : kind === 'wa' ? C.wa : 'transparent';
  const fg = kind === 'primary' ? C.onLime : kind === 'wa' ? C.onWa
    : kind === 'danger' ? C.red : C.text;
  const border = kind === 'ghost' ? C.lineStrong : kind === 'danger' ? C.dangerBorder : 'transparent';
  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress?.() }}
      style={({ pressed }) => [{
        backgroundColor: bg, borderColor: border, borderWidth: 1,
        borderRadius: R.lg, paddingVertical: 15, paddingHorizontal: 22,
        alignItems: 'center', minHeight: HIT,
        opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.985 : 1 }],
      }, style]}>
      <Text style={{ color: fg, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
        textTransform: 'uppercase' }}>{title}</Text>
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Row({ k, v, mono, total }: { k: string; v: string; mono?: boolean; total?: boolean }) {
  return (
    <View style={[s.row, total && s.rowTotal]}>
      <Text style={{ fontFamily: BODY, color: C.dim2, fontSize: 14 }}>{k}</Text>
      <Text style={{
        color: total ? C.accent : C.text, fontFamily: total ? DISP : DISP_MED,
        fontSize: total ? 22 : 14, letterSpacing: total ? -1 : -0.2,
        fontVariant: mono || total ? ['tabular-nums'] : undefined,
      }}>{v}</Text>
    </View>
  );
}

export function Pill({ text, kind }: { text: string; kind: 'wait' | 'ok' | 'past' }) {
  const map = {
    wait: { bg: C.warnSoft, fg: C.amber, bd: C.warnBorder },
    ok:   { bg: C.accentSoft, fg: C.accent,  bd: C.accentBorder },
    past: { bg: C.surface2,             fg: C.dim2,  bd: C.line },
  }[kind];
  return (
    <View style={{ backgroundColor: map.bg, borderColor: map.bd, borderWidth: 1,
      borderRadius: 0, paddingVertical: 4, paddingHorizontal: 9 }}>
      <Text style={{ color: map.fg, ...EYEBROW }}>
        {text.toUpperCase()}
      </Text>
    </View>
  );
}

export function SectionTitle({ children, action, onAction }: {
  children: string; action?: string; onAction?: () => void;
}) {
  return (
    <View style={s.sec}>
      <Text style={{ ...TITLE.section, color: C.text, textTransform: 'uppercase' }}>{children}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={{ color: C.accent, fontFamily: DISP_MED, fontSize: 11,
            letterSpacing: 1.4, textTransform: 'uppercase' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = sheet(() => ({
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1,
    borderRadius: R.xl, padding: S.lg, marginHorizontal: S.xl, marginBottom: S.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, gap: 14 },
  rowTotal: { borderTopColor: C.line, borderTopWidth: 1, marginTop: 4, paddingTop: 12 },
  sec: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingHorizontal: S.xl, paddingTop: S.xxl, paddingBottom: S.md },
}));
