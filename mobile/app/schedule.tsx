// Экран выбора времени: сетка «часы × площадки». Открывается с главной.
// Подписи часов стоят на границах клеток — клетка читается как промежуток
// от 18:00 до 19:00, а не как «момент 18:00».
import { useState, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S } from '../src/theme';
import {
  CLUB, COURTS, VISIBLE_COURTS, slotsFor, maxRun, priceRange,
  courtById, fmt, hh, type Court,
} from '../src/data';
import { IMG } from '../src/images';
import { IconBall, IconChevron } from '../src/components/icons';

const NOW = 18;              // ЗАГЛУШКА: «текущий час»

/** Русские окончания: 1 час, 2 часа, 5 часов. */
function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}
const DAYS = [
  { key: 0, w: 'Сегодня', d: '2' }, { key: 1, w: 'Ср', d: '3' }, { key: 2, w: 'Чт', d: '4' },
  { key: 3, w: 'Пт', d: '5' }, { key: 4, w: 'Сб', d: '6' },
];

export default function Schedule() {
  const insets = useSafeAreaInsets();
  const { day: preset } = useLocalSearchParams<{ day?: string }>();
  const [day, setDay] = useState(preset ? Number(preset) : 0);
  const [sel, setSel] = useState<{ courtId: string; hour: number } | null>(null);
  const [hours, setHours] = useState(1);

  // Сегодня прошедшие часы не показываем, для других дней — весь день
  const from = day === 0 ? NOW : CLUB.openHour;
  const rows = useMemo(() => {
    const out: number[] = [];
    for (let h = from; h < CLUB.closeHour; h++) out.push(h);
    return out;
  }, [from]);

  const gap = 3, padH = 10, timeW = 32;

  const statuses = useMemo(() => {
    const m: Record<string, Record<number, string>> = {};
    for (const c of COURTS) {
      m[c.id] = {};
      for (const s of slotsFor(c.id, from)) m[c.id][s.hour] = s.status;
    }
    return m;
  }, [from]);

  const court = sel ? courtById(sel.courtId) : null;
  const run = sel ? maxRun(sel.courtId, sel.hour) : 0;
  const total = sel && court ? priceRange(court, sel.hour, hours) : 0;
  // Сегодня важно «что свободно прямо сейчас», в другой день — сколько всего часов
  const freeNow = VISIBLE_COURTS.filter(c => statuses[c.id]?.[from] === 'free').length;
  const freeHours = VISIBLE_COURTS.reduce(
    (n, c) => n + rows.filter(h => statuses[c.id]?.[h] === 'free').length, 0);

  const tap = (c: Court, h: number) => {
    if (c.off || statuses[c.id]?.[h] !== 'free') return;
    Haptics.selectionAsync();
    setSel({ courtId: c.id, hour: h });
    setHours(prev => Math.min(prev, maxRun(c.id, h)) || 1);
  };

  const pickHours = (n: number) => {
    if (!sel || n > run) return;
    Haptics.selectionAsync();
    setHours(n);
  };

  const book = () => {
    if (!sel || !court) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/book', params: { courtId: court.id, name: court.name,
      hour: String(sel.hour), hours: String(hours), price: String(total) } });
  };

  // Клетка входит в выбранный отрезок?
  const inRange = (cId: string, h: number) =>
    !!sel && sel.courtId === cId && h >= sel.hour && h < sel.hour + hours;

  return (
    <View style={st.root}>
      <Stack.Screen options={{ title: 'Выберите время' }} />

      <Text style={st.sub}>
        {day === 0
          ? `Сегодня, 2 сентября · сейчас свободно ${freeNow} из ${VISIBLE_COURTS.length}`
          : `${DAYS[day].w}, ${DAYS[day].d} сентября · свободно ${freeHours} ${plural(freeHours, 'час', 'часа', 'часов')} за день`}
      </Text>

      <View style={st.days}>
        {DAYS.map(d => {
          const on = day === d.key;
          return (
            <Pressable key={d.key}
              onPress={() => { Haptics.selectionAsync(); setDay(d.key); setSel(null); setHours(1) }}
              style={[st.day, on && st.dayOn]}>
              <Text style={[st.dayW, on && { color: 'rgba(11,15,12,.62)' }]}>{d.w}</Text>
              <Text style={[st.dayD, on && { color: C.onLime }]}>{d.d}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: padH }}>
        <View style={[st.headRow, { gap }]}>
          <View style={{ width: timeW }} />
          {COURTS.map(c => (
            <View key={c.id} style={st.headCell}>
              {c.football
                ? <IconBall size={15} color={c.off ? C.busy : C.dim} />
                : <Text style={[st.headT, c.off && { color: C.busy }]}>
                    К{c.name.replace(/\D/g, '')}
                  </Text>}
            </View>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: padH, paddingTop: 7, paddingBottom: 10 }}
        showsVerticalScrollIndicator={false}>
        {rows.map(h => (
          <View key={h} style={[st.row, { gap }]}>
            <Text style={[st.time, { width: timeW }]}>{hh(h)}</Text>
            {COURTS.map(c => {
              const stt = statuses[c.id]?.[h];
              const free = !c.off && stt === 'free';
              const on = inRange(c.id, h);
              const start = !!sel && sel.courtId === c.id && sel.hour === h;
              return (
                <Pressable key={c.id} disabled={!free} onPress={() => tap(c, h)}
                  accessibilityRole="button"
                  accessibilityLabel={c.off ? `${c.name}, закрыт`
                    : on ? `${c.name}, ${hh(h)}, выбрано`
                    : free ? `${c.name}, ${hh(h)}, свободно` : `${c.name}, ${hh(h)}, занято`}
                  accessibilityState={{ selected: on, disabled: !free }}
                  style={({ pressed }) => [st.cell,
                    c.off ? st.cellOff : free ? st.cellFree : st.cellBusy,
                    on && st.cellOn,
                    pressed && free && !on && { backgroundColor: C.surface3 }]}>
                  {c.off ? null
                    : on ? (start ? <View style={st.dotOn} /> : <View style={st.barOn} />)
                    : free ? <View style={st.dotFree} />
                    : <View style={st.dashBusy} />}
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* закрывающая отметка: последняя клетка заканчивается здесь */}
        <View style={[st.row, { gap, marginBottom: 0 }]}>
          <Text style={[st.time, st.timeLast, { width: timeW }]}>{hh(CLUB.closeHour)}</Text>
        </View>

        <View style={st.legend}>
          <Leg label="свободно" free />
          <Leg label="занято" />
          <Leg label="закрыт" dashed />
        </View>
        <Text style={st.note}>Корт 6 закрыт до 5 сентября — ремонт покрытия</Text>
      </ScrollView>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {sel && court ? (
          <>
            <Pressable
              onPress={() => router.push({ pathname: '/court',
                params: { id: court.id, hour: String(sel.hour) } })}
              style={({ pressed }) => [st.pick, pressed && { opacity: 0.7 }]}>
              <Image source={IMG[court.id]} style={st.pickPh} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={st.pickN}>{court.name}</Text>
                <Text style={st.pickS}>
                  {hh(sel.hour)} – {hh(sel.hour + hours)} · {fmt(total)}
                </Text>
              </View>
              <IconChevron size={15} color={C.dim2} />
            </Pressable>

            <View style={st.durRow}>
              {[1, 2, 3].map(n => {
                const ok = n <= run;
                const on = hours === n;
                return (
                  <Pressable key={n} disabled={!ok} onPress={() => pickHours(n)}
                    accessibilityState={{ selected: on, disabled: !ok }}
                    style={[st.dur, on && st.durOn, !ok && st.durOff]}>
                    <Text style={[st.durT, on && { color: C.onLime }, !ok && { color: C.busy }]}>
                      {n} {n === 1 ? 'час' : 'часа'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {run < 3 && (
              <Text style={st.warn}>
                {run === 1
                  ? `В ${hh(sel.hour + 1)} площадка занята — свободен только один час.`
                  : `В ${hh(sel.hour + run)} площадка занята — подряд можно взять ${run} часа.`}
              </Text>
            )}

            <Pressable onPress={book} accessibilityRole="button"
              style={({ pressed }) => [st.cta, pressed && { opacity: 0.9 }]}>
              <Text style={st.ctaT}>Записаться · {fmt(total)}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={st.empty}>Нажмите свободное время на нужной площадке</Text>
            <View style={[st.cta, st.ctaOff]}>
              <Text style={[st.ctaT, { color: C.dim2 }]}>Записаться</Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function Leg({ label, free, dashed }: { label: string; free?: boolean; dashed?: boolean }) {
  return (
    <View style={st.leg}>
      <View style={[st.legBox,
        free && { backgroundColor: 'rgba(198,240,51,.09)', borderColor: 'rgba(198,240,51,.46)' },
        dashed && { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: C.line }]} />
      <Text style={st.legT}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },

  sub: { color: C.dim2, fontSize: 12.5, paddingHorizontal: S.xl, paddingTop: 2 },
  days: { flexDirection: 'row', gap: 7, paddingHorizontal: S.xl, marginTop: 12, marginBottom: 16 },
  day: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.md, paddingVertical: 8, alignItems: 'center', minHeight: 46 },
  dayOn: { backgroundColor: C.lime, borderColor: C.lime },
  dayW: { color: C.dim2, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  dayD: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 1 },

  headRow: { flexDirection: 'row', paddingBottom: 10 },
  headCell: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headT: { color: C.dim, fontSize: 11, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  // Подпись стоит у верхнего края клетки: слот идёт от этой отметки до следующей
  time: { color: C.dim2, fontSize: 10.5, fontVariant: ['tabular-nums'], marginTop: -5 },
  timeLast: { marginTop: -3 },
  cell: { flex: 1, height: 46, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'transparent' },
  cellFree: { backgroundColor: 'rgba(198,240,51,.09)', borderColor: 'rgba(198,240,51,.46)' },
  cellBusy: { backgroundColor: C.surface, opacity: 0.55 },
  cellOff: { backgroundColor: 'transparent', borderStyle: 'dashed', borderColor: C.line },
  cellOn: { backgroundColor: C.lime, borderColor: C.lime, opacity: 1 },
  dotFree: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.lime },
  dotOn: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.onLime },
  barOn: { width: 12, height: 2.5, borderRadius: 2, backgroundColor: 'rgba(11,15,12,.5)' },
  dashBusy: { width: 10, height: 2, borderRadius: 1, backgroundColor: C.busy },

  legend: { flexDirection: 'row', gap: 16, paddingTop: 14, paddingHorizontal: 6 },
  leg: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legBox: { width: 14, height: 14, borderRadius: 5, borderWidth: 1,
    borderColor: C.line, backgroundColor: C.surface },
  legT: { color: C.dim2, fontSize: 11.5 },
  note: { color: C.dim2, fontSize: 11.5, marginTop: 10, paddingHorizontal: 6 },

  bottom: { paddingHorizontal: S.xl, paddingTop: 12, backgroundColor: C.ink2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  empty: { color: C.dim2, fontSize: 13.5, textAlign: 'center', marginBottom: 12, marginTop: 2 },

  pick: { flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 11 },
  pickPh: { width: 38, height: 38, borderRadius: 12 },
  pickN: { color: C.text, fontSize: 15, fontWeight: '700' },
  pickS: { color: C.dim2, fontSize: 12.5, marginTop: 1, fontVariant: ['tabular-nums'] },

  durRow: { flexDirection: 'row', gap: 7, marginBottom: 11 },
  dur: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.md, paddingVertical: 10, alignItems: 'center', minHeight: 42 },
  durOn: { backgroundColor: C.lime, borderColor: C.lime },
  durOff: { opacity: 0.4, borderStyle: 'dashed' },
  durT: { color: C.text, fontSize: 13.5, fontWeight: '700' },

  warn: { color: C.amber, fontSize: 11.5, lineHeight: 16, marginBottom: 10, marginTop: -3 },

  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 16, alignItems: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  ctaT: { color: C.onLime, fontSize: 16.5, fontWeight: '700', letterSpacing: -0.2 },
});
