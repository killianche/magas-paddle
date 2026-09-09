// Заявка отправлена. Экран должен успокоить: что записано, когда и что дальше.
import { Text, View, StyleSheet, Pressable, Linking, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY } from '../src/theme';
import { rub } from '../src/api';
import { IconCheck } from '../src/components/icons';
import { ScreenSkeleton, NotFound } from '../src/components/state';
import { useHydrated } from '../src/hydrated';
import { hh, longDate, plural } from '../src/dates';

import { CLUB, whatsappUrl } from '../src/club';


/** Сколько осталось до конца удержания, словами. */
function leftText(iso: string): string | null {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (min <= 0) return null;
  if (min < 60) return `${min} ${plural(min, 'минута', 'минуты', 'минут')}`;
  const h = Math.floor(min / 60);
  return `${h} ${plural(h, 'час', 'часа', 'часов')} ${min % 60} мин`;
}

export default function Sent() {
  const p = useLocalSearchParams<{ id: string; name: string; date: string; hour: string;
    hours: string; price: string; holdUntil?: string }>();
  const hydrated = useHydrated();
  const hour = Number(p.hour ?? 0), hours = Number(p.hours ?? 1);

  if (!hydrated) return <ScreenSkeleton />;
  if (!p.name || !p.hour) return (
    <NotFound title="Заявки здесь нет"
      note="Похоже, вы открыли ссылку напрямую. Отправленные заявки лежат в «Моих записях»." />
  );

  const open = async (url: string, fallback: string) => {
    try {
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      throw new Error();
    } catch {
      Platform.OS === 'web' ? alert(fallback) : Alert.alert('Не получилось', fallback);
    }
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />

      <View style={s.done}>
        <View style={s.tick}><IconCheck size={34} color={C.lime} active /></View>
        <Text style={s.h}>Заявка отправлена</Text>
        <Text style={s.p}>
          <Text style={{ color: C.text, fontWeight: '700' }}>{String(p.name)}</Text>
          {'\n'}{longDate(String(p.date))}
          {'\n'}<Text style={{ color: C.text, fontWeight: '700' }}>{hh(hour)} – {hh(hour + hours)}</Text>
          {' '}· {hours} {plural(hours, 'час', 'часа', 'часов')}
        </Text>
        <View style={s.pill}>
          <View style={s.dot} />
          <Text style={s.pillT}>МЕСТО ЗАДЕРЖАНО</Text>
        </View>
      </View>

      <View style={s.card}>
        <View style={s.row}>
          <Text style={s.rowK}>Номер записи</Text>
          <Text style={s.rowV}>№ {String(p.id ?? '—')}</Text>
        </View>
        <View style={[s.row, s.rowLast]}>
          <Text style={s.rowK}>Стоимость</Text>
          <Text style={[s.rowV, { fontFamily: BODY, color: C.lime, fontSize: 20 }]}>{rub(Number(p.price ?? 0))}</Text>
        </View>
      </View>

      {/* Место держится ограниченное время: оплата идёт через менеджера,
          и человек должен понимать, что тянуть нельзя. */}
      <View style={s.hold}>
        <Text style={s.holdT}>
          {!!p.holdUntil && leftText(String(p.holdUntil))
            ? `Держим корт за вами ${leftText(String(p.holdUntil))}`
            : 'Корт задержан за вами'}
        </Text>
        <Text style={s.holdS}>
          Свяжитесь с менеджером и внесите предоплату — половину стоимости.
          После неё бронь становится подтверждённой. Без предоплаты время
          вернётся в расписание.
        </Text>
      </View>

      <View style={{ flex: 1 }} />

      <View style={s.bottom}>
        <Text style={s.step}>Шаг 2 · Договориться о предоплате</Text>

        {/* ЗАГЛУШКИ: номеров клуб ещё не дал (вопрос Q46). Выдумывать нельзя —
            человек позвонит незнакомому, — поэтому кнопки честно неактивны. */}
        <Pressable disabled={!whatsappUrl()}
          onPress={() => open(whatsappUrl()!, 'Напишите менеджеру в WhatsApp вручную.')}
          accessibilityRole="button"
          accessibilityLabel="Написать менеджеру в WhatsApp"
          style={({ pressed }) => [s.wa, !whatsappUrl() && s.waOff, pressed && { opacity: 0.9 }]}>
          <Text style={[s.waT, !whatsappUrl() && { color: C.dim }]}>
            {whatsappUrl() ? 'Написать в WhatsApp' : 'WhatsApp: номер скоро появится'}
          </Text>
        </Pressable>

        <Pressable disabled={!CLUB.phone}
          onPress={() => CLUB.phone && open(`tel:${CLUB.phone.replace(/[^\d+]/g, '')}`,
            `Телефон клуба: ${CLUB.phone}`)}
          accessibilityRole="button"
          accessibilityLabel={CLUB.phone ? 'Позвонить менеджеру' : 'Телефон клуба ещё не известен'}
          style={({ pressed }) => [s.ghost, pressed && { opacity: 0.8 }]}>
          <Text style={[s.ghostT, !CLUB.phone && { color: C.dim }]}>
            {CLUB.phone ? 'Позвонить менеджеру' : 'Телефон: номер скоро появится'}
          </Text>
        </Pressable>

        <Pressable onPress={() => router.replace('/bookings')}
          accessibilityRole="button"
          style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}>
          <Text style={s.linkT}>Открыть мои записи</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hold: { marginHorizontal: S.xl, marginTop: 14, padding: 15, borderRadius: R.lg,
    borderWidth: 1, borderColor: 'rgba(240,169,59,.38)', backgroundColor: 'rgba(240,169,59,.08)' },
  holdT: { color: '#F0A93B', fontFamily: DISP, fontSize: 15, letterSpacing: -0.4 },
  holdS: { fontFamily: BODY, color: '#DFCCA8', fontSize: 13, lineHeight: 19, marginTop: 6 },
  waOff: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  step: { ...EYEBROW, color: C.dim2, marginBottom: 10, textAlign: 'center' },
  root: { flex: 1, backgroundColor: C.ink, paddingTop: 74 },
  done: { alignItems: 'center', paddingHorizontal: 30 },
  tick: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: C.lime,
    backgroundColor: 'rgba(198,240,51,.08)', alignItems: 'center', justifyContent: 'center' },
  h: { ...TITLE.page, color: C.text, marginTop: 20, textAlign: 'center' },
  p: { fontFamily: BODY, color: C.dim, fontSize: 14.5, lineHeight: 22, textAlign: 'center', marginTop: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18,
    borderWidth: 1, borderColor: 'rgba(240,169,59,.4)', backgroundColor: 'rgba(240,169,59,.1)',
    borderRadius: 0, paddingVertical: 6, paddingHorizontal: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.amber },
  pillT: { ...EYEBROW, color: C.amber },

  card: { marginTop: 26, marginHorizontal: S.xl, borderRadius: R.xl, borderWidth: 1,
    borderColor: C.line, backgroundColor: C.surface, paddingHorizontal: 15 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  rowLast: { borderBottomWidth: 0 },
  rowK: { fontFamily: BODY, color: C.dim2, fontSize: 14 },
  rowV: { color: C.text, fontFamily: DISP_MED, fontSize: 15, letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] },

  bottom: { paddingHorizontal: S.xl, paddingBottom: 34, gap: 10 },
  wa: { backgroundColor: '#25D366', borderRadius: R.lg, paddingVertical: 16,
    alignItems: 'center', minHeight: HIT },
  waT: { color: '#04240F', fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  ghost: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.lg,
    paddingVertical: 15, alignItems: 'center', minHeight: HIT },
  ghostT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },
  link: { paddingVertical: 12, alignItems: 'center', minHeight: HIT, justifyContent: 'center' },
  linkT: { fontFamily: BODY, color: C.dim, fontSize: 14.5, fontWeight: '600' },
});
