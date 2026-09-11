// Общие состояния экранов: загрузка каркаса и «ничего не найдено».
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { C, R, S, HIT, DISP, TITLE, BODY, sheet } from '../theme';

/** Нейтральный каркас на время, пока экран не получил параметры адреса. */
export function ScreenSkeleton() {
  return (
    <View style={s.wrap}>
      <View style={[s.sk, { height: 172, marginHorizontal: 0, borderRadius: 0 }]} />
      <View style={[s.sk, { width: 150, height: 14, marginTop: 20 }]} />
      <View style={[s.sk, { height: 74, marginTop: 12 }]} />
      <View style={[s.sk, { width: 190, height: 14, marginTop: 20 }]} />
      <View style={[s.sk, { height: 130, marginTop: 12 }]} />
    </View>
  );
}

/** Экран не нашёл того, что просили: неверная ссылка, удалённая площадка, старая закладка. */
export function NotFound({ title, note }: { title: string; note: string }) {
  return (
    <View style={s.nf}>
      <Text style={s.nfT}>{title}</Text>
      <Text style={s.nfS}>{note}</Text>
      <Pressable onPress={() => router.replace('/')}
        style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}>
        <Text style={s.btnT}>На главную</Text>
      </Pressable>
    </View>
  );
}

const s = sheet(() => ({
  wrap: { flex: 1, backgroundColor: C.ink },
  sk: { backgroundColor: C.surface2, borderRadius: R.lg, marginHorizontal: S.xl },
  nf: { flex: 1, backgroundColor: C.ink, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 34 },
  nfT: { ...TITLE.card, color: C.text, textAlign: 'center' },
  nfS: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 9 },
  btn: { marginTop: 24, backgroundColor: C.lime, borderRadius: R.lg,
    paddingVertical: 15, paddingHorizontal: 26, minHeight: HIT, justifyContent: 'center' },
  btnT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
}));
