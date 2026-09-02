// Экран площадки. Разбит на секции, как карточка объекта в Airbnb:
// крупное фото, заголовок с ценой, дальше блоки, которые раскрываются нажатием,
// и липкая нижняя панель с итогом. Выбор времени открыт сразу — за ним и приходят.
import { useState, useMemo } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, Image } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT } from '../src/theme';
import { courtById, slotsFor, maxRun, priceRange, priceAt, fmt, hh, CLUB } from '../src/data';
import { IMG } from '../src/images';
import { Btn } from '../src/components/ui';
import { Section, Line } from '../src/components/section';
import { ScreenSkeleton, NotFound } from '../src/components/state';
import { useHydrated } from '../src/hydrated';

const NOW = 18;
const DAYS = [
  { key: 0, w: 'Сегодня', d: '2' }, { key: 1, w: 'Ср', d: '3' }, { key: 2, w: 'Чт', d: '4' },
  { key: 3, w: 'Пт', d: '5' }, { key: 4, w: 'Сб', d: '6' },
];

export default function CourtScreen() {
  const { id, hour: preset } = useLocalSearchParams<{ id: string; hour?: string }>();
  const hydrated = useHydrated();
  const court = courtById(String(id));
  const [day, setDay] = useState(0);
  const [start, setStart] = useState<number | null>(preset ? Number(preset) : null);
  const [hours, setHours] = useState(1);

  const slots = useMemo(() => {
    const all = slotsFor(String(id), day === 0 ? NOW : CLUB.openHour);
    return day === 0 ? all.filter(x => x.hour >= NOW) : all;
  }, [id, day]);

  const run = start != null ? maxRun(String(id), start) : 0;
  const freeCount = slots.filter(x => x.status === 'free').length;

  if (!hydrated) return <ScreenSkeleton />;
  if (!court) return (
    <NotFound title="Площадка не найдена"
      note="Возможно, её убрали из расписания. Свободное время всех площадок — на главной." />
  );

  const pickStart = (h: number) => {
    Haptics.selectionAsync();
    setStart(h);
    setHours(prev => Math.min(prev, maxRun(String(id), h)) || 1);
  };

  const pickHours = (n: number) => {
    if (n > run) return;
    Haptics.selectionAsync();
    setHours(n);
  };

  const total = start != null ? priceRange(court, start, hours) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Stack.Screen options={{ title: court.name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: start != null ? 180 : 40 }}
        showsVerticalScrollIndicator={false}>

        <View style={s.hero}>
          <Image source={IMG[court.id]} style={s.heroImg} resizeMode="cover" />
          <LinearGradient colors={['rgba(11,15,12,.05)', 'rgba(11,15,12,.5)', 'rgba(11,15,12,.95)']}
            locations={[0, 0.55, 1]} style={s.heroScrim} />
        </View>

        <View style={s.head}>
          <Text style={s.name}>{court.name}</Text>
          <Text style={s.sub}>{CLUB.name}, {CLUB.city}</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{fmt(priceAt(court, NOW))}</Text>
            <Text style={s.priceU}>за час вечером</Text>
            <View style={s.freeTag}>
              <Text style={s.freeTagT}>
                {freeCount > 0 ? `${freeCount} свободных часов` : 'на сегодня занят'}
              </Text>
            </View>
          </View>
        </View>

        {/* Главная секция — свернуть нельзя, за ней и пришли */}
        <Section title="Когда играть" locked>
          <Text style={s.lbl}>Дата</Text>
          <View style={s.days}>
            {DAYS.map(d => {
              const on = day === d.key;
              return (
                <Pressable key={d.key}
                  onPress={() => { Haptics.selectionAsync(); setDay(d.key); setStart(null); setHours(1) }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={[s.day, on && s.dayOn]}>
                  <Text style={[s.dayW, on && { color: 'rgba(11,15,12,.62)' }]}>{d.w}</Text>
                  <Text style={[s.dayD, on && { color: C.onLime }]}>{d.d}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={s.lbl}>Начало</Text>
          {freeCount === 0 ? (
            <View style={s.warn}>
              <Text style={s.warnT}>
                На этот день свободного времени нет. Посмотрите следующие дни — там места есть.
              </Text>
            </View>
          ) : (
            <View style={s.slots}>
              {slots.map(sl => {
                const free = sl.status === 'free';
                const on = start === sl.hour;
                return (
                  <Pressable key={sl.hour} disabled={!free} onPress={() => pickStart(sl.hour)}
                    accessibilityRole="button"
                    accessibilityLabel={`${hh(sl.hour)}, ${on ? 'выбрано' : free ? 'свободно' : 'занято'}`}
                    accessibilityState={{ selected: on, disabled: !free }}
                    style={({ pressed }) => [s.slot, free ? s.slotFree : s.slotBusy, on && s.slotOn,
                      pressed && free && !on && { backgroundColor: C.surface3 }]}>
                    <Text style={[s.slotT, !free && s.slotTBusy, on && { color: C.onLime }]}>
                      {hh(sl.hour)}
                    </Text>
                    <Text style={[s.slotP, on && { color: 'rgba(11,15,12,.66)' }, !free && { color: C.busy }]}>
                      {free ? fmt(priceAt(court, sl.hour)) : 'занято'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {start != null && (
            <>
              <Text style={s.lbl}>Сколько часов</Text>
              <View style={s.durRow}>
                {[1, 2, 3].map(n => {
                  const ok = n <= run;
                  const on = hours === n;
                  return (
                    <Pressable key={n} disabled={!ok} onPress={() => pickHours(n)}
                      accessibilityRole="button"
                      accessibilityLabel={`${n} ${n === 1 ? 'час' : 'часа'}, ${ok ? (on ? 'выбрано' : 'доступно') : 'занято'}`}
                      accessibilityState={{ selected: on, disabled: !ok }}
                      style={[s.dur, on && s.durOn, !ok && s.durOff]}>
                      <Text style={[s.durT, on && { color: C.onLime }, !ok && { color: C.busy }]}>
                        {n} {n === 1 ? 'час' : 'часа'}
                      </Text>
                      <Text style={[s.durS, on && { color: 'rgba(11,15,12,.66)' }, !ok && { color: C.busy }]}>
                        {ok ? `${hh(start)} – ${hh(start + n)}` : 'занято'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {run < 3 && (
                <Text style={s.limit}>
                  {run === 1
                    ? `В ${hh(start + 1)} корт уже занят — от ${hh(start)} свободен только один час.`
                    : `В ${hh(start + run)} корт занят — от ${hh(start)} можно взять не больше ${run} часов подряд.`}
                </Text>
              )}
            </>
          )}
        </Section>

        <Section title="Цены"
          summary={`${fmt(priceAt(court, 12))} днём · ${fmt(priceAt(court, 19))} вечером`}>
          <Line k={`Днём, с ${hh(CLUB.openHour)} до 18:00`} v={`${fmt(priceAt(court, 12))} за час`} />
          <Line k="Вечером, с 18:00 до полуночи" v={`${fmt(priceAt(court, 19))} за час`} accent />
          <Line k="Два часа подряд вечером" v={fmt(priceRange(court, 19, 2))} />
          <Text style={s.small}>
            Цена считается по часам: если игра начинается днём и заходит на вечер,
            часы складываются по своим тарифам. Оплата на месте, в клубе.
          </Text>
        </Section>

        <Section title="Правила" summary={`Отмена за ${CLUB.cancelHours} часа · опоздание ${CLUB.lateMinutes} минут`}>
          <Line k="Отмена" v={`бесплатно за ${CLUB.cancelHours} часа`} />
          <Line k="Опоздание" v={`корт держим ${CLUB.lateMinutes} минут`} />
          <Line k="Минимальная аренда" v="один час" />
          <Line k="Оплата" v="на месте, в клубе" />
          <Text style={s.small}>
            Если планы изменились — отмените запись в приложении. Время сразу освободится
            для других игроков, и это ничего не стоит.
          </Text>
        </Section>

        <Section title="Что нужно знать" summary="Ракетки, мячи, раздевалка">
          <View style={s.q}>
            <Text style={s.qT}>Эти сведения ещё не получены от клуба</Text>
            <Text style={s.qS}>
              Есть ли прокат ракеток, входят ли мячи в стоимость, что с раздевалкой и душем —
              вопрос к владельцу. Придумывать ответы мы не стали.
            </Text>
          </View>
        </Section>
      </ScrollView>

      {start != null && (
        <View style={s.bar}>
          <View style={{ flex: 1 }}>
            <Text style={s.barK}>
              {DAYS[day].w}, {hh(start)} – {hh(start + hours)} · {hours} {hours === 1 ? 'час' : 'часа'}
            </Text>
            <Text style={s.barV}>{fmt(total)}</Text>
          </View>
          <Btn title="Далее" onPress={() => router.push({
            pathname: '/book',
            params: { courtId: court.id, name: court.name, hour: String(start),
                      hours: String(hours), price: String(total) },
          })} />
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  hero: { height: 230, overflow: 'hidden' },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  head: { paddingHorizontal: S.xl, paddingTop: 4, paddingBottom: 20 },
  name: { color: C.text, fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  sub: { color: C.dim2, fontSize: 13.5, marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  price: { color: C.text, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  priceU: { color: C.dim, fontSize: 13 },
  freeTag: { marginLeft: 'auto', borderWidth: 1, borderColor: 'rgba(198,240,51,.35)',
    backgroundColor: 'rgba(198,240,51,.08)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9 },
  freeTagT: { color: C.limeDim, fontSize: 11, fontWeight: '700' },

  lbl: { color: C.dim, fontSize: 13, fontWeight: '600', marginBottom: 9, marginTop: 4 },

  days: { flexDirection: 'row', gap: 7, marginBottom: 18 },
  day: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.md, paddingVertical: 9, alignItems: 'center', minHeight: HIT },
  dayOn: { backgroundColor: C.lime, borderColor: C.lime },
  dayW: { color: C.dim2, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  dayD: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 1 },

  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slot: { width: '31.4%', borderWidth: 1, borderRadius: R.md, paddingVertical: 11,
    alignItems: 'center', minHeight: HIT + 8 },
  slotFree: { borderColor: C.line, backgroundColor: C.surface },
  slotBusy: { borderColor: C.lineSoft, backgroundColor: 'transparent', opacity: 0.5 },
  slotOn: { backgroundColor: C.lime, borderColor: C.lime, opacity: 1 },
  slotT: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  slotTBusy: { color: C.busy },
  slotP: { color: C.dim2, fontSize: 10.5, marginTop: 3 },

  durRow: { flexDirection: 'row', gap: 8 },
  dur: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.md, paddingVertical: 12, alignItems: 'center', minHeight: 60 },
  durOn: { backgroundColor: C.lime, borderColor: C.lime },
  durOff: { opacity: 0.4, borderStyle: 'dashed' },
  durT: { color: C.text, fontSize: 14.5, fontWeight: '700' },
  durS: { color: C.dim2, fontSize: 11, marginTop: 3, fontVariant: ['tabular-nums'] },
  limit: { color: C.amber, fontSize: 12.5, lineHeight: 18, marginTop: 12 },

  warn: { padding: 13, borderRadius: R.md, backgroundColor: 'rgba(240,169,59,.08)',
    borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  warnT: { color: '#DFCCA8', fontSize: 13, lineHeight: 19 },

  small: { color: C.dim2, fontSize: 12.5, lineHeight: 18, marginTop: 12 },

  q: { padding: 13, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface },
  qT: { color: C.text, fontSize: 13.5, fontWeight: '700' },
  qS: { color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 5 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row',
    alignItems: 'center', gap: 13, paddingHorizontal: S.xl, paddingTop: 14, paddingBottom: 34,
    backgroundColor: C.ink2, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  barK: { color: C.dim2, fontSize: 11.5 },
  barV: { color: C.text, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
