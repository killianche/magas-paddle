// Экран выбора времени: сетка «часы × площадки», данные с сервера.
// Подписи часов стоят на границах клеток — клетка читается как промежуток
// от 18:00 до 19:00, а не как «момент 18:00».
import { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Image, Modal, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S } from '../src/theme';
import { api, rub, type ApiGrid, type ApiHour } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { IMG } from '../src/images';
import { IconBall, IconChevron } from '../src/components/icons';
import { today, addDays, weekdayShort, dayNumber, hh, plural } from '../src/dates';

const DAYS_AHEAD = 5;
const MAX_HOURS = 3;

export default function Schedule() {
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(today());
  const [sel, setSel] = useState<{ courtId: string; hour: number } | null>(null);
  const [hours, setHours] = useState(1);
  // Какую площадку показываем крупно. Заказчик просил: у кортов разный цвет пола,
  // и перед записью человек должен увидеть, куда именно он идёт.
  const [peek, setPeek] = useState<string | null>(null);

  const q = useApi(() => api.grid(date), [date]);
  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today(), i)), []);

  const gap = 3, padH = 10, timeW = 32;

  const grid = q.data;
  const court = grid?.courts.find(c => c.courtId === sel?.courtId) ?? null;
  const cell = court?.hours.find(h => h.hour === sel?.hour) ?? null;
  const run = cell?.maxRun ?? 0;

  // Цена складывается по часам: день и вечер стоят по-разному
  const total = useMemo(() => {
    if (!court || !sel) return 0;
    let sum = 0;
    for (let h = sel.hour; h < sel.hour + hours; h++) {
      sum += court.hours.find(x => x.hour === h)?.price ?? 0;
    }
    return sum;
  }, [court, sel, hours]);

  const freeNow = grid?.courts.filter(c => {
    const h = c.hours.find(x => x.status === 'free');
    return h != null;
  }).length ?? 0;
  const freeHours = grid?.courts.reduce(
    (n, c) => n + c.hours.filter(h => h.status === 'free').length, 0) ?? 0;

  const pickCell = (courtId: string, h: ApiHour) => {
    if (h.status !== 'free') return;
    Haptics.selectionAsync();
    setSel({ courtId, hour: h.hour });
    setHours(prev => Math.min(prev, h.maxRun) || 1);
  };

  const pickHours = (n: number) => {
    if (!sel || n > run) return;
    Haptics.selectionAsync();
    setHours(n);
  };

  const book = () => {
    if (!sel || !court) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/book', params: {
      courtId: sel.courtId, name: court.name, date,
      hour: String(sel.hour), hours: String(hours), price: String(total) } });
  };

  const inRange = (cId: string, h: number) =>
    !!sel && sel.courtId === cId && h >= sel.hour && h < sel.hour + hours;

  if (q.loading) return (<><Stack.Screen options={{ title: 'Выберите время' }} /><Loading note="Смотрю, что свободно" /></>);
  if (q.error || !grid) return (<><Stack.Screen options={{ title: 'Выберите время' }} />
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);

  const closedNote = grid.courts.find(c => c.closed);

  // Тарифы для подписи над сеткой: берём у обычного корта, не у футбольного поля
  const priced = grid.courts.find(c => !c.isFootball) ?? grid.courts[0];
  const morningPrice = priced?.hours.find(h => h.hour < grid.morningUntil)?.price ?? 0;
  const standardPrice = priced?.hours.find(h => h.hour >= grid.morningUntil)?.price ?? 0;

  const showCourt = (courtId: string) => { Haptics.selectionAsync(); setPeek(courtId) };
  const peeked = grid.courts.find(c => c.courtId === peek) ?? null;

  return (
    <View style={st.root}>
      <Stack.Screen options={{ title: 'Выберите время' }} />

      <Text style={st.sub}>
        {date === today()
          ? `Сегодня · свободно ${freeNow} из ${grid.courts.length} площадок`
          : `Свободно ${freeHours} ${plural(freeHours, 'час', 'часа', 'часов')} за день`}
      </Text>

      <Pressable onPress={() => { Haptics.selectionAsync(); router.push('/prices') }}
        accessibilityRole="button" accessibilityLabel="Открыть прайс-лист"
        style={({ pressed }) => [st.tariff, pressed && { opacity: 0.75 }]}>
        <Text style={st.tariffT}>
          <Text style={{ color: C.lime, fontWeight: '700' }}>{rub(morningPrice)}</Text>
          {' '}до {hh(grid.morningUntil)}, дальше {rub(standardPrice)}
        </Text>
        <IconChevron size={14} color={C.dim2} />
      </Pressable>

      <View style={st.days}>
        {days.map(d => {
          const on = date === d;
          return (
            <Pressable key={d}
              onPress={() => { Haptics.selectionAsync(); setDate(d); setSel(null); setHours(1) }}
              accessibilityRole="button" accessibilityState={{ selected: on }}
              style={[st.day, on && st.dayOn]}>
              <Text style={[st.dayW, on && { color: 'rgba(11,15,12,.62)' }]}>{weekdayShort(d)}</Text>
              <Text style={[st.dayD, on && { color: C.onLime }]}>{dayNumber(d)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ paddingHorizontal: padH }}>
        <View style={[st.headRow, { gap }]}>
          <View style={{ width: timeW }} />
          {grid.courts.map(c => (
            <Pressable key={c.courtId} onPress={() => showCourt(c.courtId)}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}: посмотреть фотографию площадки`}
              style={({ pressed }) => [st.headCell, pressed && { opacity: 0.6 }]}>
              {/* Миниатюра площадки прямо в шапке: у кортов разное покрытие,
                  и цвет пола должен быть виден до того, как человек выберет час. */}
              <Image source={IMG[c.courtId] ?? IMG.c1}
                style={[st.headPh, c.closed && { opacity: 0.4 }]} resizeMode="cover" />
              {c.isFootball
                ? <IconBall size={13} color={c.closed ? C.busy : C.dim} />
                : <Text style={[st.headT, c.closed && { color: C.busy }]}>
                    К{c.name.replace(/\D/g, '') || '?'}
                  </Text>}
            </Pressable>
          ))}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: padH, paddingTop: 7, paddingBottom: 10 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={C.dim} />}>

        {grid.courts[0]?.hours.map(({ hour }) => (
          <View key={hour} style={[st.row, { gap }]}>
            <Text style={[st.time, { width: timeW }]}>{hh(hour)}</Text>
            {grid.courts.map(c => {
              const h = c.hours.find(x => x.hour === hour)!;
              const free = h.status === 'free';
              const on = inRange(c.courtId, hour);
              const start = !!sel && sel.courtId === c.courtId && sel.hour === hour;
              return (
                <Pressable key={c.courtId} disabled={!free} onPress={() => pickCell(c.courtId, h)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    h.status === 'closed' ? `${c.name}, закрыт`
                    : on ? `${c.name}, ${hh(hour)}, выбрано`
                    : free ? `${c.name}, ${hh(hour)}, свободно`
                    : `${c.name}, ${hh(hour)}, занято`}
                  accessibilityState={{ selected: on, disabled: !free }}
                  style={({ pressed }) => [st.cell,
                    h.status === 'closed' ? st.cellOff : free ? st.cellFree : st.cellBusy,
                    on && st.cellOn,
                    pressed && free && !on && { backgroundColor: C.surface3 }]}>
                  {h.status === 'closed' ? null
                    : on ? (start ? <View style={st.dotOn} /> : <View style={st.barOn} />)
                    : free ? <View style={st.dotFree} />
                    : <View style={st.dashBusy} />}
                </Pressable>
              );
            })}
          </View>
        ))}

        <View style={[st.row, { gap, marginBottom: 0 }]}>
          <Text style={[st.time, st.timeLast, { width: timeW }]}>{hh(grid.closeHour)}</Text>
        </View>

        <View style={st.legend}>
          <Leg label="свободно" free />
          <Leg label="занято" />
          <Leg label="закрыт" dashed />
        </View>
        {closedNote && (
          <Text style={st.note}>
            {closedNote.name} закрыт{closedNote.isFootball ? 'о' : ''} — ремонт покрытия
          </Text>
        )}
      </ScrollView>

      <View style={[st.bottom, { paddingBottom: insets.bottom + 12 }]}>
        {sel && court ? (
          <>
            <Pressable
              onPress={() => router.push({ pathname: '/court',
                params: { id: sel.courtId, date, hour: String(sel.hour) } })}
              style={({ pressed }) => [st.pick, pressed && { opacity: 0.7 }]}>
              <Image source={IMG[sel.courtId] ?? IMG.c1} style={st.pickPh} resizeMode="cover" />
              <View style={{ flex: 1 }}>
                <Text style={st.pickN}>{court.name}</Text>
                <Text style={st.pickS}>{hh(sel.hour)} – {hh(sel.hour + hours)} · {rub(total)}</Text>
              </View>
              <IconChevron size={15} color={C.dim2} />
            </Pressable>

            <View style={st.durRow}>
              {[1, 2, 3].map(n => {
                const ok = n <= run;
                const on = hours === n;
                return (
                  <Pressable key={n} disabled={!ok} onPress={() => pickHours(n)}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} ${n === 1 ? 'час' : 'часа'}, ${ok ? (on ? 'выбрано' : 'доступно') : 'занято'}`}
                    accessibilityState={{ selected: on, disabled: !ok }}
                    style={[st.dur, on && st.durOn, !ok && st.durOff]}>
                    <Text style={[st.durT, on && { color: C.onLime }, !ok && { color: C.busy }]}>
                      {n} {n === 1 ? 'час' : 'часа'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {run < MAX_HOURS && (
              <Text style={st.warn}>
                {run === 1
                  ? `В ${hh(sel.hour + 1)} площадка занята — свободен только один час.`
                  : `В ${hh(sel.hour + run)} площадка занята — подряд можно взять ${run} часа.`}
              </Text>
            )}

            <Pressable onPress={book} accessibilityRole="button"
              style={({ pressed }) => [st.cta, pressed && { opacity: 0.9 }]}>
              <Text style={st.ctaT}>Записаться · {rub(total)}</Text>
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

      <CourtPeek court={peeked} onClose={() => setPeek(null)}
        onPick={() => { const id = peeked!.courtId; setPeek(null);
          router.push({ pathname: '/court', params: { id, date, hour: String(grid.openHour) } }) }} />
    </View>
  );
}

/** Фотография площадки поверх сетки. Нужна, потому что корты отличаются
    покрытием и цветом пола, а по букве «К3» этого не видно. */
function CourtPeek({ court, onClose, onPick }: {
  court: ApiGrid['courts'][number] | null; onClose: () => void; onPick: () => void;
}) {
  return (
    <Modal visible={!!court} transparent animationType="fade" onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={st.peekBack} onPress={onClose} accessibilityLabel="Закрыть фотографию">
        {court && (
          <Pressable style={st.peek} onPress={() => {}}>
            <Image source={IMG[court.courtId] ?? IMG.c1} style={st.peekImg} resizeMode="cover" />
            <View style={st.peekIn}>
              <Text style={st.peekN}>{court.name}</Text>
              <Text style={st.peekS}>
                {court.closed ? 'Закрыта' :
                  `${court.hours.filter(h => h.status === 'free').length} свободных часов сегодня`}
              </Text>
              {/* ЗАГЛУШКА: пока это не снимки клуба — см. docs/PHOTO-CREDITS.md */}
              <Text style={st.peekNote}>
                Фотография временная. Настоящие снимки площадок клуб пришлёт позже.
              </Text>
              <View style={st.peekRow}>
                <Pressable onPress={onClose} accessibilityRole="button"
                  style={({ pressed }) => [st.peekBtn, pressed && { opacity: 0.8 }]}>
                  <Text style={st.peekBtnT}>Закрыть</Text>
                </Pressable>
                <Pressable onPress={onPick} accessibilityRole="button"
                  style={({ pressed }) => [st.peekBtn, st.peekBtnAcc, pressed && { opacity: 0.85 }]}>
                  <Text style={[st.peekBtnT, { color: C.onLime }]}>Подробнее</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
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
  headCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 3 },
  headT: { color: C.dim, fontSize: 11, fontWeight: '700' },
  headPh: { width: 26, height: 26, borderRadius: 8, marginBottom: 3,
    borderWidth: 1, borderColor: C.line },

  tariff: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginHorizontal: 20, marginTop: 8, paddingVertical: 6, paddingHorizontal: 11,
    borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  tariffT: { color: C.dim, fontSize: 12.5 },

  peekBack: { flex: 1, backgroundColor: 'rgba(6,9,7,.88)',
    alignItems: 'center', justifyContent: 'center', padding: 22 },
  peek: { width: '100%', maxWidth: 420, borderRadius: 22, overflow: 'hidden',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  peekImg: { width: '100%', height: 230 },
  peekIn: { padding: 16 },
  peekN: { color: C.text, fontSize: 19, fontWeight: '700' },
  peekS: { color: C.lime, fontSize: 13, marginTop: 3, fontWeight: '600' },
  peekNote: { color: C.dim2, fontSize: 12, lineHeight: 17, marginTop: 9 },
  peekRow: { flexDirection: 'row', gap: 9, marginTop: 14 },
  peekBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46,
    borderRadius: 13, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 },
  peekBtnAcc: { backgroundColor: C.lime, borderColor: C.lime },
  peekBtnT: { color: C.text, fontSize: 14.5, fontWeight: '700' },

  row: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
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
