// Состояния экрана, пока данных нет: ждём или не вышло.
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { C, R, S, HIT, DISP, TITLE, BODY } from '../theme';

export function Loading({ note }: { note?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={C.lime} size="large" />
      {!!note && <Text style={s.note}>{note}</Text>}
    </View>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={s.center}>
      <Text style={s.title}>Не удалось загрузить</Text>
      <Text style={s.note}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button"
        style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}>
        <Text style={s.btnT}>Попробовать снова</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 34, backgroundColor: C.ink },
  title: { ...TITLE.card, color: C.text, textAlign: 'center' },
  note: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 9 },
  btn: { marginTop: 22, backgroundColor: C.lime, borderRadius: R.lg,
    paddingVertical: 15, paddingHorizontal: 26, minHeight: HIT, justifyContent: 'center' },
  btnT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
});
