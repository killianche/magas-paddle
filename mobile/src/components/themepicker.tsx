// Оформление: тёмная тема, светлая или как в телефоне.
//
// Три плашки с образцом цвета: выбор виден сразу, без подписей «вкл/выкл».
// Переключается мгновенно, экран остаётся тем же.
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, S, DISP_MED, sheet } from '../theme';
import { setThemePref, useThemePref, type ThemePref } from '../themepref';

const OPTIONS: { key: ThemePref; label: string }[] = [
  { key: 'dark', label: 'Тёмная' },
  { key: 'light', label: 'Светлая' },
  { key: 'system', label: 'Как в телефоне' },
];

export function ThemePicker() {
  const pref = useThemePref();
  return (
    <View style={s.row}>
      {OPTIONS.map(o => {
        const on = pref === o.key;
        return (
          <Pressable key={o.key}
            onPress={() => { Haptics.selectionAsync(); setThemePref(o.key) }}
            accessibilityRole="button" accessibilityState={{ selected: on }}
            accessibilityLabel={`Оформление: ${o.label}`}
            style={({ pressed }) => [s.opt, on && s.optOn, pressed && !on && { opacity: 0.8 }]}>
            <Swatch k={o.key} />
            <Text style={[s.t, on && { color: C.onLime }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Образец: чёрный квадрат, белый или пополам — «как в телефоне». */
function Swatch({ k }: { k: ThemePref }) {
  return (
    <View style={s.sw}>
      <View style={[s.half, { backgroundColor: k === 'light' ? '#FFFFFF' : '#020705' }]} />
      <View style={[s.half, { backgroundColor: k === 'dark' ? '#020705' : '#FFFFFF' }]} />
    </View>
  );
}

const s = sheet(() => ({
  row: { flexDirection: 'row', gap: 8, marginHorizontal: S.xl },
  opt: { flex: 1, minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 6, borderWidth: 1, borderColor: C.lineStrong,
    backgroundColor: C.surface },
  optOn: { backgroundColor: C.lime, borderColor: C.lime },
  t: { color: C.text, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 0.8,
    textTransform: 'uppercase', textAlign: 'center' },
  sw: { width: 26, height: 18, flexDirection: 'row', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(128,128,128,0.55)' },
  half: { flex: 1 },
}));
