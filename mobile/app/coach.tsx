// Тренер: о нём, цена, запись на индивидуальную тренировку.
//
// День → длительность → время. Время показываем только то, где тренер
// работает и свободен и есть свободный падел-корт — корт клуб подберёт сам.
// Заявка ждёт подтверждения, как бронь корта.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { C, R, S, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, getToken, ApiError, type ApiSlot } from '../src/api';
import { useApi } from '../src/useApi';
import { useProfile } from '../src/profile';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { DateStrip, Durations, Step } from '../src/components/booking';
import { hh, today, plural } from '../src/dates';
import { CoachFace, coachPriceText, ClassRow } from '../src/components/coach';

export default function Coach() {
  useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, signedIn } = useProfile();
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState(1);
  const [pick, setPick] = useState<ApiSlot | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const q = useApi(async () => {
    const [coaches, classes] = await Promise.all([api.coaches(), api.tournaments(profile?.phone, 'class')]);
    const c = coaches.find(x => String(x.id) === String(id)) ?? null;
    return { c, classes: classes.filter(t => t.coach?.id === c?.id && new Date(t.startsAt).getTime() > Date.now()) };
  }, [id]);
  const slots = useApi(() => api.coachSlots(Number(id), date, hours), [id, date, hours]);
  useFocusEffect(useCallback(() => { slots.refresh() }, [id, date, hours]));

  const screen = <Stack.Screen options={{ title: 'Тренер' }} />;
  if (q.loading) return (<>{screen}<Loading /></>);
  if (q.error) return (<>{screen}<Failed message={q.error} onRetry={q.reload} /></>);
  const c = q.data?.c;
  if (!c) return (<>{screen}<NotFound title="Тренер не найден" note="Все тренеры — в разделе «Тренировки»." /></>);

  const list = slots.data?.slots ?? [];
  const submit = async () => {
    if (!pick || busy) return;
    if (!signedIn || !getToken()) {
      router.push({ pathname: '/account', params: { next: `/coach?id=${c.id}` } }); return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true); setProblem(null);
    try {
      const r = await api.bookCoach(c.id, { date, hour: pick.hour, hours });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/sent', params: { kind: 'lesson', id: String(r.id),
        name: `Тренировка · ${c.name}, ${r.courtName}`, date, hour: String(pick.hour), hours: String(hours), price: String(r.price) } });
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Не получилось отправить заявку. Проверьте интернет.');
      setPick(null); slots.refresh();
    } finally { setBusy(false) }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {screen}
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={s.head}>
          <CoachFace c={c} size={84} />
          <Text style={s.name}>{c.name}</Text>
          <Text style={s.price}>{coachPriceText(c)}</Text>
          {!!c.bio && <Text style={s.bio}>{c.bio}</Text>}
        </View>

        <Step n={1} title="День" />
        <DateStrip date={date} onPick={d => { setDate(d); setPick(null) }} />
        <Step n={2} title="Сколько длится" />
        <View style={{ paddingHorizontal: S.xl }}>
          <Durations max={2} hours={hours} onPick={n => { setHours(n); setPick(null) }} />
        </View>
        <Step n={3} title="Время" />
        <View style={s.slots}>
          {slots.loading ? <ActivityIndicator color={C.dim} style={{ margin: 20 }} />
            : list.length ? list.map(x => {
              const on = pick?.hour === x.hour;
              return (
                <Pressable key={x.hour} onPress={() => { Haptics.selectionAsync(); setPick(x) }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={({ pressed }) => [s.slot, on && s.slotOn, pressed && !on && { opacity: 0.8 }]}>
                  <Text style={[s.slotT, on && { color: C.onLime }]}>{hh(x.hour)}</Text>
                </Pressable>
              );
            }) : <Text style={s.none}>В этот день у тренера нет свободного времени — выберите другой день.</Text>}
        </View>

        {(q.data?.classes ?? []).length > 0 && <Text style={s.sec}>Групповые тренировки</Text>}
        {(q.data?.classes ?? []).map(t => <ClassRow key={t.id} t={t} />)}
      </ScrollView>

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
        {!!problem && <Text style={s.problem}>{problem}</Text>}
        {pick && <Text style={s.sum}>{hh(pick.hour)}–{hh(pick.hour + hours)} · {hours} {plural(hours, 'час', 'часа', 'часов')} ·
          {' '}тренер {rub(pick.coachPrice)}{pick.courtPrice ? ` + корт ${rub(pick.courtPrice)}` : ''}</Text>}
        <Pressable onPress={submit} disabled={!pick || busy} accessibilityRole="button"
          style={({ pressed }) => [s.cta, (!pick || busy) && s.ctaOff, pressed && !!pick && { opacity: 0.9 }]}>
          {busy ? <ActivityIndicator color={C.onLime} />
            : <Text style={[s.ctaT, !pick && { color: C.dim2 }]}>{pick ? `Записаться · ${rub(pick.price)}` : 'Выберите время'}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const s = sheet(() => ({
  head: { alignItems: 'center', paddingHorizontal: S.xl, paddingTop: 18, paddingBottom: 6 },
  name: { ...TITLE.section, color: C.text, marginTop: 12, textAlign: 'center' },
  price: { fontFamily: DISP_MED, color: C.accent, fontSize: 14, marginTop: 6 },
  bio: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 10, textAlign: 'center' },
  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: S.xl, marginTop: 4 },
  slot: { minWidth: 72, paddingVertical: 11, alignItems: 'center', borderRadius: R.md, borderWidth: 1,
    borderColor: C.lineStrong, backgroundColor: C.surface },
  slotOn: { backgroundColor: C.lime, borderColor: C.lime },
  slotT: { fontFamily: DISP_MED, color: C.text, fontSize: 15 },
  none: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 19, paddingVertical: 8 },
  sec: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 26, marginBottom: 8 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl, paddingTop: 12,
    backgroundColor: C.ink2, borderTopWidth: 1, borderTopColor: C.lineSoft },
  sum: { fontFamily: BODY, color: C.dim, fontSize: 12.5, textAlign: 'center', marginBottom: 8 },
  problem: { fontFamily: BODY, color: C.dangerText, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
}));
