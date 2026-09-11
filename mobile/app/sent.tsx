// Заявка отправлена.
//
// Человек попадает сюда, вернувшись из WhatsApp, где уже написал менеджеру.
// Значит, всё главное он сделал, и экран должен только подтвердить: что
// записано, когда и что место придержано. Заказчик просил убрать отсюда
// кнопки («написать в WhatsApp», «позвонить», «мои записи») и объяснение про
// менеджера: это повтор того, что уже произошло. Деньги и номер заявки нужны,
// но мелкой строкой — их смотрят, только если что-то пошло не так.
import { Text, View, Pressable, Linking, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { C, S, HIT, DISP, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { rub } from '../src/api';
import { IconCheck } from '../src/components/icons';
import { ScreenSkeleton, NotFound } from '../src/components/state';
import { useHydrated } from '../src/hydrated';
import { prettyPhone } from '../src/profile';
import { hh, longDate, plural } from '../src/dates';
import { useClub } from '../src/club';

export default function Sent() {
  useTheme();
  const club = useClub();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ id: string; name: string; date: string; hour: string;
    hours: string; price: string; holdUntil?: string }>();
  const hydrated = useHydrated();
  const hour = Number(p.hour ?? 0), hours = Number(p.hours ?? 1);
  const price = Number(p.price ?? 0);
  // Доля предоплаты задана в админке; округляем до рубля вверх —
  // так менеджеру называть сумму проще
  const prepay = Math.ceil(price * club.prepayPercent / 100 / 100) * 100;
  // Телефон клуба; пока его нет — номер WhatsApp, по нему тоже звонят
  const phone = club.phone ?? club.whatsapp;

  if (!hydrated) return <ScreenSkeleton />;
  if (!p.name || !p.hour) return (
    <NotFound title="Заявки здесь нет"
      note="Похоже, вы открыли ссылку напрямую. Отправленные заявки лежат в «Моих записях»." />
  );

  const call = async () => {
    if (!phone) return;
    const url = `tel:${phone.replace(/[^\d+]/g, '')}`;
    try {
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      throw new Error();
    } catch {
      const msg = `Телефон клуба: ${prettyPhone(phone)}`;
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Не получилось позвонить', msg);
    }
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      {/* Выход — крупный крестик слева вверху: заявка уже отправлена */}
      <Pressable onPress={() => router.replace('/')} accessibilityRole="button"
        accessibilityLabel="Закрыть" hitSlop={10}
        style={({ pressed }) => [s.close, { top: insets.top + 8 }, pressed && { opacity: 0.6 }]}>
        <Text style={s.closeT} allowFontScaling={false}>✕</Text>
      </Pressable>

      <View style={s.done}>
        <View style={s.tick}><IconCheck size={34} color={C.accent} active /></View>
        <Text style={s.h}>Заявка отправлена</Text>
        <Text style={s.p}>
          <Text style={s.strong}>{String(p.name)}</Text>
          {'\n'}{longDate(String(p.date))}
          {'\n'}<Text style={s.strong}>{hh(hour)} – {hh(hour + hours)}</Text>
          {' '}· {hours} {plural(hours, 'час', 'часа', 'часов')}
        </Text>

        <View style={s.pill}>
          <View style={s.dot} />
          <Text style={s.pillT}>МЕСТО ЗАДЕРЖАНО</Text>
        </View>

        {!!phone && (
          <Pressable onPress={call} accessibilityRole="button"
            accessibilityLabel={`Позвонить в клуб, ${prettyPhone(phone)}`}
            style={({ pressed }) => [s.phoneBtn, pressed && { opacity: 0.7 }]}>
            <Text style={s.phone}>{prettyPhone(phone)}</Text>
            {/* Телефона клуб ещё не дал — тогда это номер WhatsApp, так и подписываем */}
            <Text style={s.phoneL}>{club.phone ? 'телефон клуба' : 'номер клуба в WhatsApp'}</Text>
          </Pressable>
        )}
      </View>

      <View style={{ flex: 1 }} />

      {/* Мелким внизу: пригодится, только если что-то пойдёт не так */}
      <Text style={[s.small, { paddingBottom: insets.bottom + 20 }]}>
        Заявка № {String(p.id ?? '—')} · {rub(price)} · предоплата {club.prepayPercent} % —
        {' '}{rub(prepay)}. Остальное на месте.
      </Text>
    </View>
  );
}

const s = sheet(() => ({
  root: { flex: 1, backgroundColor: C.ink, paddingTop: 84 },
  close: { position: 'absolute', left: 10, width: HIT, height: HIT,
    alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  closeT: { color: C.text, fontFamily: DISP, fontSize: 26, lineHeight: 30 },

  done: { alignItems: 'center', paddingHorizontal: 30 },
  tick: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: C.accent,
    backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
  h: { ...TITLE.page, color: C.text, marginTop: 20, textAlign: 'center' },
  p: { fontFamily: BODY, color: C.dim, fontSize: 14.5, lineHeight: 22, textAlign: 'center',
    marginTop: 10 },
  strong: { color: C.text, fontWeight: '700' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18,
    borderWidth: 1, borderColor: C.warnBorder, backgroundColor: C.warnSoft,
    paddingVertical: 6, paddingHorizontal: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.amber },
  pillT: { ...EYEBROW, color: C.amber },

  phoneBtn: { alignItems: 'center', marginTop: 22, paddingVertical: 6, minHeight: HIT },
  phone: { color: C.text, fontFamily: DISP, fontSize: 22, letterSpacing: -0.6,
    fontVariant: ['tabular-nums'] },
  phoneL: { ...EYEBROW, color: C.dim2, marginTop: 4 },

  small: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 18, textAlign: 'center',
    paddingHorizontal: S.xl },
}));
