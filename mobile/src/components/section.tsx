// Раскрывающаяся секция. Приём взят у Airbnb: экран разбит на понятные блоки,
// каждый показывает сводку в свёрнутом виде, а подробности открываются нажатием.
// Так длинный экран читается сверху вниз, а не сваливается всем сразу.
import { useState, type ReactNode } from 'react';
import { View, Text, Pressable, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP_MED, TITLE, BODY } from '../theme';
import { IconChevron } from './icons';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function Section({ title, summary, children, open: initial = false, locked }: {
  title: string;
  summary?: string;
  children: ReactNode;
  open?: boolean;
  /** Секцию нельзя свернуть — она главная на экране. */
  locked?: boolean;
}) {
  const [open, setOpen] = useState(initial || !!locked);

  const toggle = () => {
    if (locked) return;
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.create(
      180, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity));
    setOpen(v => !v);
  };

  return (
    <View style={s.wrap}>
      <Pressable onPress={toggle} disabled={locked}
        accessibilityRole={locked ? undefined : 'button'}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [s.head, pressed && !locked && { opacity: 0.7 }]}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          {!open && !!summary && <Text style={s.summary}>{summary}</Text>}
        </View>
        {!locked && (
          <View style={[s.chev, open && { transform: [{ rotate: '90deg' }] }]}>
            <IconChevron size={16} color={C.dim} />
          </View>
        )}
      </Pressable>
      {open && <View style={s.body}>{children}</View>}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line,
    paddingHorizontal: S.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 17, minHeight: HIT },
  title: { ...TITLE.section, color: C.text, textTransform: 'uppercase' },
  summary: { fontFamily: BODY, color: C.dim2, fontSize: 13, marginTop: 3 },
  chev: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  body: { paddingBottom: 20 },
});

/** Строка «ключ — значение» внутри секции. */
export function Line({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <View style={l.row}>
      <Text style={l.k}>{k}</Text>
      <Text style={[l.v, accent && { color: C.lime }]}>{v}</Text>
    </View>
  );
}

const l = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 9 },
  k: { fontFamily: BODY, color: C.dim, fontSize: 14, flex: 1 },
  v: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2,
    textAlign: 'right', flexShrink: 1 },
});
