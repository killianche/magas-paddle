// Карточка тренера: кто он, сколько стоит занятие и когда свободен.
// Человек выбирает день и час — клуб сам подбирает свободный корт,
// поэтому выбирать площадку отдельно не нужно.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView, Text, View, Pressable, Image, ActivityIndicator, RefreshControl, Platform, Alert,
} from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, mediaUrl, getToken, ApiError, type ApiCoach, type ApiSlot } from '../src/api';
import { useApi, useRefocus } from '../src/useApi';
import { useClub } from '../src/club';
import { loadProfile } from '../src/profile';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { CoachFace, weekText, ClassRow } from '../src/components/coach';
import { today, addDays, weekdayShort, weekday, dayNumber, dayMonth, hh, plural } from '../src/dates';

const DAYS_AHEAD = 14;

export default function Coach() {
  useTheme();
  const club = useClub();
  // d, hrs, h — выбор до ухода на вход: возвращаем его, как на экране корта.
  // Раньше после входа человек приходил к пустому выбору (аудит 15.10.2026)
  const { id, d, hrs, h } = useLocalSearchParams<{ id: string; d?: string; hrs?: string; h?: string }>();
  const [date, setDate] = useState(() => d && /^\d{4}-\d{2}-\d{2}$/.test(String(d)) && String(d) >= today()
    ? String(d) : today());
  const [hours, setHours] = useState(() => {
    const n = Number(hrs);
    return Number.isFinite(n) && n >= 1 && n <= 3 ? n : 1;
  });
  const [pick, setPick] = useState<ApiSlot | null>(null);
  // Час восстанавливаем, когда приехали свободные слоты: цена берётся из них
  const [wantHour, setWantHour] = useState<number | null>(() =>
    h != null && Number.isFinite(Number(h)) ? Number(h) : null);
  const [sending, setSending] = useState(false);
  // Замок от двойного нажатия: до setSending идёт ожидание loadProfile,
  // и второе нажатие успевало пройти проверку и отправить вторую заявку
  const sendingNow = useRef(false);
  const [problem, setProblem] = useState<string | null>(null);

  const who = useApi(async () => {
    const list = await api.coaches();
    return list.find(x => String(x.id) === String(id)) ?? null;
  }, [id], `coach.${id}`);

  const slots = useApi(() => api.coachSlots(Number(id), date, hours),
    [id, date, hours], `slots.${id}.${date}.${hours}`);

  useRefocus(() => { who.refresh(); slots.refresh() });
  useEffect(() => {
    if (wantHour == null || slots.loading || !slots.data) return;
    const sl = slots.data.slots.find(x => x.hour === wantHour);
    setWantHour(null);
    if (sl) setPick(sl);
  }, [slots.data, slots.loading]);

  const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today(), i)), []);
  const screen = <Stack.Screen options={{ title: 'Тренер' }} />;

  if (who.loading) return <>{screen}<Loading note="Открываю тренера" /></>;
  if (who.error) return <>{screen}<Failed message={who.error} onRetry={who.reload} /></>;
  const c = who.data;
  if (!c) return (<>{screen}
    <NotFound title="Тренер не найден" note="Возможно, он больше не тренирует. Все тренеры — в разделе «Тренеры»." />
  </>);

  const free = slots.data?.slots ?? [];
  const total = pick ? pick.price : 0;

  const book = async () => {
    if (!pick || sending || sendingNow.current) return;
    sendingNow.current = true;
    // Сохранённый вход грузит главная. Открыли тренера напрямую (ссылка,
    // перезагрузка веб-версии) — его ещё нет, и вошедшего отправляло на вход
    await loadProfile();
    if (!getToken()) {
      sendingNow.current = false;
      router.push({ pathname: '/account', params: {
        next: `/coach?id=${c.id}&d=${date}&hrs=${hours}&h=${pick.hour}` } });
      return;
    }
    setSending(true); setProblem(null);
    try {
      const r = await api.bookCoach(c.id, { date, hour: pick.hour, hours });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/sent', params: {
        id: String(r.id), name: `Тренировка · ${r.coachName}`, date,
        hour: String(pick.hour), hours: String(hours), price: String(r.price),
        // Экран «отправлено» для тренировки: «ждёт подтверждения» и
        // «оплачивается в клубе», а не тексты брони корта с предоплатой
        kind: 'lesson' } });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const msg = e instanceof ApiError ? e.message : 'Не получилось записаться.';
      setProblem(msg);
      setPick(null);
      slots.reload();
    } finally { sendingNow.current = false; setSending(false) }
  };

  return (
    <>
      {screen}
      <ScrollView style={{ flex: 1, backgroundColor: C.ink }}
        contentContainerStyle={{ paddingBottom: pick ? 150 : 40, paddingTop: 10 }}
        refreshControl={<RefreshControl refreshing={slots.pulling} onRefresh={slots.pull} tintColor={C.dim} />}>

        {/* Снимок во всю ширину с затемнением снизу: имя и опыт читаются
            поверх фото, как на обложке турнира */}
        <View style={s.cover}>
          {c.photoUrl
            ? <Image source={{ uri: mediaUrl(c.photoUrl) }} style={s.coverImg} resizeMode="cover" />
            : <View style={[s.coverImg, s.coverNo]}><CoachFace c={c} size={120} /></View>}
          <LinearGradient colors={['rgba(9,13,10,0)', 'rgba(9,13,10,.55)', 'rgba(9,13,10,.94)']}
            locations={[0, 0.55, 1]} style={s.coverFade} />
          <View style={s.coverText}>
            <Text style={s.name}>{[c.name, c.surname].filter(Boolean).join(' ')}</Text>
            {!!c.experience && <Text style={s.exp} numberOfLines={2}>{c.experience}</Text>}
          </View>
        </View>

        <View style={s.facts}>
          <View style={s.fact}>
            <Text style={s.factK}>Тренировка</Text>
            <Text style={s.factV}>{rub(c.price)}</Text>
            <Text style={s.factS}>за час</Text>
          </View>
          <View style={s.factLine} />
          <View style={s.fact}>
            <Text style={s.factK}>Корт</Text>
            <Text style={s.factV}>{c.courtExtra ? 'отдельно' : 'включён'}</Text>
            <Text style={s.factS}>{c.courtExtra ? 'по тарифу клуба' : 'в цене тренировки'}</Text>
          </View>
        </View>

        {!!c.bio && <Text style={s.bio}>{c.bio}</Text>}

        <View style={s.weekBox}>
          <Text style={s.weekK}>Когда тренирует</Text>
          <Text style={s.weekV}>{weekText(c.week)}</Text>
        </View>

        <Text style={s.sec}>Выберите день</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: S.xl, gap: 8 }}>
          {days.map(d => {
            const on = d === date;
            return (
              <Pressable key={d} onPress={() => { Haptics.selectionAsync(); setDate(d); setPick(null) }}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={d === today() ? `Сегодня, ${dayMonth(d)}` : `${weekday(d)}, ${dayMonth(d)}`}
                style={({ pressed }) => [s.day, on && s.dayOn, pressed && { opacity: 0.85 }]}>
                <Text style={[s.dayW, on && s.dayOnT]}>{weekdayShort(d)}</Text>
                <Text style={[s.dayN, on && s.dayOnT]}>{dayNumber(d)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={s.sec}>Сколько длится</Text>
        <View style={s.rowWrap}>
          {[1, 2, 3].map(n => {
            const on = n === hours;
            return (
              <Pressable key={n} onPress={() => { Haptics.selectionAsync(); setHours(n); setPick(null) }}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                style={({ pressed }) => [s.chip, on && s.chipOn, pressed && { opacity: 0.85 }]}>
                <Text style={[s.chipT, on && s.chipOnT]}>{n} {plural(n, 'час', 'часа', 'часов')}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={s.sec}>Свободное время · {dayMonth(date)}</Text>
        {slots.loading && <ActivityIndicator color={C.dim} style={{ marginTop: 14 }} />}
        {/* Сбой — это не «свободных часов нет»: иначе человек уходил,
            хотя время было (аудит 15.10.2026) */}
        {!slots.loading && !!slots.error && (
          <Failed message={slots.error} onRetry={slots.reload} />
        )}
        {!slots.loading && !slots.error && !free.length && (
          <Text style={s.none}>
            В этот день у тренера свободных часов нет. Посмотрите другой день — или выберите другого тренера.
          </Text>
        )}
        <View style={s.rowWrap}>
          {free.map(sl => {
            const on = pick?.hour === sl.hour;
            return (
              <Pressable key={sl.hour} onPress={() => { Haptics.selectionAsync(); setPick(on ? null : sl) }}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={`${hh(sl.hour)}, ${rub(sl.price)}`}
                style={({ pressed }) => [s.slot, on && s.slotOn, pressed && { opacity: 0.85 }]}>
                <Text style={[s.slotT, on && s.slotOnT]}>{hh(sl.hour)}</Text>
                <Text style={[s.slotP, on && s.slotOnT]}>{rub(sl.price)}</Text>
              </Pressable>
            );
          })}
        </View>

        {!!problem && <Text style={s.problem}>{problem}</Text>}
      </ScrollView>

      {!!pick && (
        <View style={s.bar}>
          <View style={s.barTop}>
            <Text style={s.barK}>
              {hh(pick.hour)} – {hh(pick.hour + hours)} · {dayMonth(date)}
            </Text>
            <Text style={s.barV}>{rub(total)}</Text>
          </View>
          <Text style={s.barSub}>
            {pick.courtPrice ? `Тренер ${rub(pick.coachPrice)} + корт ${rub(pick.courtPrice)}` : 'Корт входит в стоимость тренировки'}
          </Text>
          <Pressable onPress={book} disabled={sending} accessibilityRole="button"
            accessibilityLabel="Записаться на тренировку" accessibilityState={{ busy: sending }}
            style={({ pressed }) => [s.cta, (pressed || sending) && { opacity: 0.9 }]}>
            {sending ? <ActivityIndicator color={C.onLime} />
              : <Text style={s.ctaT}>Записаться на тренировку</Text>}
          </Pressable>
        </View>
      )}
    </>
  );
}

const s = sheet(() => ({
  cover: { marginHorizontal: S.xl, height: 300, borderRadius: R.xl, overflow: 'hidden',
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, justifyContent: 'flex-end' },
  coverImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  coverNo: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface2 },
  coverFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  coverText: { padding: 16, gap: 4 },
  name: { fontFamily: DISP, color: '#FFFFFF', fontSize: 26, letterSpacing: -0.8 },
  exp: { fontFamily: BODY, color: 'rgba(255,255,255,.82)', fontSize: 13.5, lineHeight: 19 },

  facts: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: S.xl, marginTop: 12,
    borderRadius: R.xl, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  fact: { flex: 1, padding: 14, gap: 2 },
  factLine: { width: 1, backgroundColor: C.line },
  factK: { ...EYEBROW, color: C.dim2 },
  factV: { fontFamily: DISP, color: C.accent, fontSize: 20, letterSpacing: -0.5 },
  factS: { fontFamily: BODY, color: C.dim2, fontSize: 11.5 },

  bio: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 20,
    marginHorizontal: S.xl, marginTop: 14 },

  weekBox: { marginHorizontal: S.xl, marginTop: 16, padding: 14, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  weekK: { ...EYEBROW, color: C.dim2, marginBottom: 5 },
  weekV: { fontFamily: BODY, color: C.text, fontSize: 14, lineHeight: 20 },

  sec: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 22, marginBottom: 10 },

  day: { width: 54, paddingVertical: 10, borderRadius: R.lg, alignItems: 'center',
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  dayOn: { backgroundColor: C.lime, borderColor: C.lime },
  dayW: { fontFamily: BODY, color: C.dim2, fontSize: 11, textTransform: 'uppercase' },
  dayN: { fontFamily: DISP, color: C.text, fontSize: 20, lineHeight: 24 },
  dayOnT: { color: C.onLime },

  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: S.xl },
  chip: { paddingHorizontal: 16, paddingVertical: 11, borderRadius: R.lg, minHeight: HIT - 4,
    justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.lime, borderColor: C.lime },
  chipT: { fontFamily: DISP_MED, color: C.text, fontSize: 13.5 },
  chipOnT: { color: C.onLime },

  slot: { minWidth: 86, paddingHorizontal: 12, paddingVertical: 10, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, alignItems: 'center' },
  slotOn: { backgroundColor: C.lime, borderColor: C.lime },
  slotT: { fontFamily: DISP, color: C.text, fontSize: 16, fontVariant: ['tabular-nums'] },
  slotP: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, marginTop: 2 },
  slotOnT: { color: C.onLime },

  none: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 20,
    marginHorizontal: S.xl },
  problem: { fontFamily: BODY, color: C.dangerText, fontSize: 13, lineHeight: 19,
    marginHorizontal: S.xl, marginTop: 16 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 30, backgroundColor: C.ink2,
    borderTopWidth: 1, borderTopColor: C.lineStrong },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  barK: { fontFamily: BODY, color: C.text, fontSize: 14, fontVariant: ['tabular-nums'] },
  barV: { fontFamily: DISP, color: C.accent, fontSize: 22, letterSpacing: -1 },
  barSub: { fontFamily: BODY, color: C.dim2, fontSize: 12, marginTop: 3 },
  cta: { marginTop: 12, backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 16,
    alignItems: 'center', minHeight: HIT + 6, justifyContent: 'center' },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
}));
