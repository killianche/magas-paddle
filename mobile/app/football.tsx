// Запись на мини-футбольное поле.
//
// Отдельный экран, а не колонка в общей сетке. Сетка «часы × площадки» нужна,
// когда площадок шесть и надо сравнить их между собой. Поле одно — сравнивать
// не с чем, и та же сетка превращалась в узкий столбик на пустом экране.
// Здесь вместо неё список свободного времени крупными строками.
import { useMemo, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Image, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, BODY } from '../src/theme';
import { api, rub, type ApiHour } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { IMG } from '../src/images';
import { IconChevron } from '../src/components/icons';
import { today, addDays, weekdayShort, dayNumber, hh, plural } from '../src/dates';

const DAYS_AHEAD = 14;

export default function Football() {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(today());
  const [from, setFrom] = useState<number | null>(null);
  const [hours, setHours] = useState(1);

  const q = useApi(() => api.grid(date), [date], `grid.${date}`);
  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today(), i)), []);

  const grid = q.data;
  const pitch = grid?.courts.find(c => c.isFootball) ?? null;

  const total = useMemo(() => {
    if (!pitch || from == null) return 0;
    let sum = 0;
    for (let h = from; h < from + hours; h++) {
      sum += pitch.hours.find(x => x.hour === h)?.price ?? 0;
    }
    return sum;
  }, [pitch, from, hours]);

  if (q.loading) return (<><Stack.Screen options={{ title: 'Мини-футбол' }} /><Loading note="Смотрю, что свободно" /></>);
  if (q.error || !grid) return (<><Stack.Screen options={{ title: 'Мини-футбол' }} />
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);
  if (!pitch) return (
    <NotFound title="Поля нет в расписании"
      note="Возможно, клуб убрал его. Падел-корты — на главной." />
  );

  // Показываем только то, что ещё можно занять: прошедшие часы человеку не нужны
  const slots = pitch.hours.filter(h => h.status !== 'past');
  const free = slots.filter(h => h.status === 'free');
  const run = from == null ? 0 : pitch.hours.find(h => h.hour === from)?.maxRun ?? 0;
  const closed = pitch.closed;

  const pick = (h: ApiHour) => {
    if (h.status !== 'free') return;
    Haptics.selectionAsync();
    if (from === h.hour) { setFrom(null); setHours(1); return }
    setFrom(h.hour);
    setHours(prev => Math.min(prev, h.maxRun) || 1);
  };

  const book = () => {
    if (from == null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/book', params: {
      courtId: pitch.courtId, name: pitch.name, date,
      hour: String(from), hours: String(hours), price: String(total) } });
  };

  const inPick = (h: number) => from != null && h >= from && h < from + hours;

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: 'Мини-футбол' }} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={C.dim} />}>

        {/* Поле одно — можно показать его крупно, а не миниатюрой в шапке */}
        <View style={s.hero}>
          <Image source={IMG[pitch.courtId] ?? IMG.f1} style={s.heroImg} resizeMode="cover" />
          <LinearGradient colors={['rgba(9,13,10,.25)', 'rgba(9,13,10,.55)', 'rgba(9,13,10,.96)']}
            locations={[0, 0.5, 1]} style={s.fill} />
          <View style={s.heroIn}>
            <Text style={s.eyebrow}>ПОЛЕ ЦЕЛИКОМ</Text>
            <Text style={s.name} allowFontScaling={false}>МИНИ-ФУТБОЛ</Text>
            <Text style={s.sub}>
              {closed ? 'Закрыто на ремонт'
                : free.length > 0
                  ? `${free.length} ${plural(free.length, 'свободный час', 'свободных часа', 'свободных часов')} — берите целиком`
                  : 'На этот день всё занято'}
            </Text>
          </View>
        </View>

        <View style={s.days}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: S.xl }}>
            {days.map(d => {
              const on = date === d;
              return (
                <Pressable key={d}
                  onPress={() => { Haptics.selectionAsync(); setDate(d); setFrom(null); setHours(1) }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[s.day, on && s.dayOn]}>
                  <Text style={[s.dayW, on && { color: '#647068' }]}>{weekdayShort(d)}</Text>
                  <Text style={[s.dayD, on && { color: C.ink }]}>{dayNumber(d)}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        <Text style={s.section}>Свободное время</Text>

        {slots.length === 0 ? (
          <Text style={s.empty}>Сегодня поле уже закрывается. Выберите другой день.</Text>
        ) : (
          <View style={s.list}>
            {slots.map(h => {
              const on = inPick(h.hour);
              const start = from === h.hour;
              const busy = h.status !== 'free';
              return (
                <Pressable key={h.hour} disabled={busy} onPress={() => pick(h)}
                  accessibilityRole="button"
                  accessibilityLabel={busy
                    ? `${hh(h.hour)} занято`
                    : `${hh(h.hour)} – ${hh(h.hour + 1)}, ${rub(h.price)}, свободно`}
                  accessibilityState={{ selected: on, disabled: busy }}
                  style={({ pressed }) => [s.slot,
                    busy && s.slotBusy, on && s.slotOn,
                    pressed && !busy && !on && { backgroundColor: C.surface2 }]}>
                  <Text style={[s.time, on && { color: C.onLime }, busy && { color: C.busy }]}>
                    {hh(h.hour)} – {hh(h.hour + 1)}
                  </Text>
                  <Text style={[s.slotState, on && { color: 'rgba(11,15,12,.7)' }]}>
                    {busy ? (h.status === 'closed' ? 'закрыто' : 'занято')
                      : start ? 'начало' : on ? 'входит в бронь' : 'свободно'}
                  </Text>
                  <Text style={[s.slotPrice, on && { color: C.onLime }, busy && { color: C.busy }]}>
                    {rub(h.price)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[s.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {from != null ? (
          <>
            <View style={s.picked}>
              <View style={{ flex: 1 }}>
                <Text style={s.pickedT}>{hh(from)} – {hh(from + hours)}</Text>
                <Text style={s.pickedS}>
                  {hours} {plural(hours, 'час', 'часа', 'часов')} · поле целиком
                </Text>
              </View>
              <Pressable onPress={() => { Haptics.selectionAsync(); setFrom(null); setHours(1) }}
                accessibilityRole="button" accessibilityLabel="Снять выбор времени"
                hitSlop={10} style={({ pressed }) => [s.clear, pressed && { opacity: 0.6 }]}>
                <Text style={s.clearT}>Сбросить</Text>
              </Pressable>
            </View>

            <View style={s.durRow}>
              {Array.from({ length: grid.maxHours }, (_, i) => i + 1).map(n => {
                const ok = n <= run;
                const on = hours === n;
                return (
                  <Pressable key={n} disabled={!ok}
                    onPress={() => { Haptics.selectionAsync(); setHours(n) }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !ok }}
                    style={[s.dur, on && s.durOn, !ok && s.durOff]}>
                    <Text style={[s.durT, on && { color: C.onLime }, !ok && { color: C.busy }]}>
                      {n} {plural(n, 'час', 'часа', 'часов')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable onPress={book} accessibilityRole="button"
              style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}>
              <Text style={s.ctaT}>Забронировать · {rub(total)}</Text>
              <IconChevron size={17} color={C.onLime} />
            </Pressable>
          </>
        ) : (
          <>
            <Text style={s.hint}>
              {closed ? 'Поле закрыто на ремонт'
                : free.length > 0 ? 'Выберите час — дальше можно добавить ещё'
                : 'Свободного времени нет, посмотрите другой день'}
            </Text>
            <View style={[s.cta, s.ctaOff]}>
              <Text style={[s.ctaT, { color: C.dim2 }]}>Забронировать</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  hero: { height: 210, overflow: 'hidden', justifyContent: 'flex-end' },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%' },
  heroIn: { padding: S.xl },
  eyebrow: { fontFamily: BODY, color: C.limeDim, fontSize: 11, letterSpacing: 3, fontWeight: '700' },
  name: { ...TITLE.page, color: C.text, marginTop: 8 },
  sub: { fontFamily: BODY, color: '#D6DECF', fontSize: 13, marginTop: 6 },

  days: { marginTop: 18 },
  day: { width: 54, paddingVertical: 9, borderRadius: R.md, alignItems: 'center',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  dayOn: { backgroundColor: C.text, borderColor: C.text },
  dayW: { fontFamily: BODY, color: C.dim2, fontSize: 11, letterSpacing: 0.6 },
  dayD: { color: C.text, fontFamily: DISP, fontSize: 16, letterSpacing: -0.6, marginTop: 2,
    fontVariant: ['tabular-nums'] },

  section: { fontFamily: BODY, color: C.dim2, fontSize: 11, letterSpacing: 2.6, textTransform: 'uppercase',
    marginTop: 26, marginBottom: 12, paddingHorizontal: S.xl },

  // Крупные строки вместо клеток: поле одно, места на экране много
  list: { paddingHorizontal: S.xl, gap: 8 },
  slot: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62,
    paddingHorizontal: 16, borderRadius: R.lg, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.line },
  slotBusy: { backgroundColor: 'transparent', borderStyle: 'dashed' },
  slotOn: { backgroundColor: C.lime, borderColor: C.lime },
  time: { color: C.text, fontFamily: DISP, fontSize: 17, letterSpacing: -0.5,
    fontVariant: ['tabular-nums'], width: 122 },
  slotState: { fontFamily: BODY, color: C.dim2, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase',
    flex: 1 },
  slotPrice: { fontFamily: BODY, color: C.dim, fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  empty: { fontFamily: BODY, color: C.dim, fontSize: 13, lineHeight: 20, textAlign: 'center',
    paddingHorizontal: 40, paddingVertical: 40 },

  bottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong,
    backgroundColor: C.ink2, paddingHorizontal: S.xl, paddingTop: 12 },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  pickedT: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.4,
    fontVariant: ['tabular-nums'] },
  pickedS: { fontFamily: BODY, color: C.dim2, fontSize: 13, marginTop: 2 },
  clear: { paddingVertical: 7, paddingHorizontal: 12 },
  clearT: { fontFamily: BODY, color: C.dim, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },

  durRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  dur: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 42,
    borderRadius: R.md, backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  durOn: { backgroundColor: C.lime, borderColor: C.lime },
  durOff: { opacity: 0.4 },
  durT: { fontFamily: BODY, color: C.text, fontSize: 13, fontWeight: '700' },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.lime, borderRadius: R.pill, minHeight: HIT + 6 },
  ctaOff: { backgroundColor: C.surface2 },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  hint: { fontFamily: BODY, color: C.dim2, fontSize: 13, textAlign: 'center', marginBottom: 10 },
});
