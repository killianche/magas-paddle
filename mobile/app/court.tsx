import { useState, useMemo } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, Image } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT } from '../src/theme';
import { courtById, slotsFor, maxRun, priceRange, priceAt, fmt, hh, CLUB } from '../src/data';
import { IMG } from '../src/images';
import { Btn } from '../src/components/ui';
import { LinearGradient } from 'expo-linear-gradient';

const NOW = 18;
const DAYS = [
  { key: 0, w: 'Сегодня', d: '2' }, { key: 1, w: 'Ср', d: '3' }, { key: 2, w: 'Чт', d: '4' },
  { key: 3, w: 'Пт', d: '5' }, { key: 4, w: 'Сб', d: '6' },
];

export default function CourtScreen() {
  const { id, hour: preset } = useLocalSearchParams<{ id: string; hour?: string }>();
  const court = courtById(String(id));
  const [day, setDay] = useState(0);
  const [start, setStart] = useState<number | null>(preset ? Number(preset) : null);
  const [hours, setHours] = useState(1);

  const slots = useMemo(() => {
    const all = slotsFor(String(id), day === 0 ? NOW : CLUB.openHour);
    // Сегодня прошедшие часы не показываем — они занимали бы половину экрана
    return day === 0 ? all.filter(x => x.hour >= NOW) : all;
  }, [id, day]);
  // Сколько часов подряд доступно от выбранного начала
  const run = start != null ? maxRun(String(id), start) : 0;

  if (!court) return null;

  const pickStart = (h: number) => {
    Haptics.selectionAsync();
    setStart(h);
    // Если выбранная ранее длительность больше не помещается — ужимаем
    const r = maxRun(String(id), h);
    setHours(prev => Math.min(prev, r) || 1);
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
      <ScrollView contentContainerStyle={{ paddingBottom: start != null ? 190 : 40 }}>

        <View style={s.hero}>
          <Image source={IMG[court.id]} style={s.heroImg} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(11,15,12,.05)', 'rgba(11,15,12,.45)', 'rgba(11,15,12,.88)']}
            locations={[0, 0.55, 1]} style={s.heroScrim} />
          <View style={s.heroIn}>
            <Text style={s.heroPrice}>
              {fmt(priceAt(court, 12))} днём · {fmt(priceAt(court, 19))} после 18:00
            </Text>
          </View>
        </View>

        <Text style={s.label}>Дата</Text>
        <View style={s.days}>
          {DAYS.map(d => (
            <Pressable key={d.key} onPress={() => { Haptics.selectionAsync(); setDay(d.key); setStart(null) }}
              style={[s.day, day === d.key && s.dayOn]}>
              <Text style={[s.dayW, day === d.key && { color: 'rgba(11,15,12,.62)' }]}>{d.w}</Text>
              <Text style={[s.dayD, day === d.key && { color: C.onLime }]}>{d.d}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={s.label}>Во сколько начать</Text>
        {slots.every(x => x.status !== 'free') && (
          <View style={s.warn}>
            <Text style={s.warnT}>
              На этот день свободного времени нет. Посмотрите следующие дни — там места есть.
            </Text>
          </View>
        )}
        <View style={s.slots}>
          {slots.map(sl => {
            const free = sl.status === 'free';
            const on = start === sl.hour;
            return (
              <Pressable key={sl.hour} disabled={!free} onPress={() => pickStart(sl.hour)}
                style={({ pressed }) => [s.slot, free ? s.slotFree : s.slotBusy, on && s.slotOn,
                  pressed && free && { transform: [{ scale: 0.95 }] }]}>
                <Text style={[s.slotT, !free && s.slotTBusy, on && { color: C.onLime }]}>{hh(sl.hour)}</Text>
                <Text style={[s.slotP, on && { color: 'rgba(11,15,12,.66)' }]}>
                  {free ? fmt(priceAt(court, sl.hour)) : 'занято'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {start != null && (
          <>
            <Text style={s.label}>На сколько часов</Text>
            <View style={s.durRow}>
              {[1, 2, 3].map(n => {
                const ok = n <= run;
                const on = hours === n;
                return (
                  <Pressable key={n} disabled={!ok} onPress={() => pickHours(n)}
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
              <View style={s.warn}>
                <Text style={s.warnT}>
                  {run === 1
                    ? `В ${hh(start + 1)} корт уже занят — от ${hh(start)} свободен только один час.`
                    : `В ${hh(start + run)} корт занят — от ${hh(start)} можно взять не больше ${run} часов подряд.`}
                </Text>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {start != null && (
        <View style={s.bar}>
          <View style={{ flex: 1 }}>
            <Text style={s.barK}>{hh(start)} – {hh(start + hours)} · {hours} {hours === 1 ? 'час' : 'часа'}</Text>
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
  hero: { height: 172, justifyContent: 'flex-end', marginBottom: 6, overflow: 'hidden' },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(11,15,12,.34)' },
  heroIn: { padding: S.xl },
  heroPrice: { color: C.text, fontSize: 13.5, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,.75)', textShadowRadius: 10 },

  label: { color: C.dim, fontSize: 13.5, fontWeight: '600',
    paddingHorizontal: S.xl, marginTop: 16, marginBottom: 9 },

  days: { flexDirection: 'row', gap: 7, paddingHorizontal: S.xl },
  day: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.md, paddingVertical: 9, alignItems: 'center', minHeight: HIT },
  dayOn: { backgroundColor: C.lime, borderColor: C.lime },
  dayW: { color: C.dim2, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.5 },
  dayD: { color: C.text, fontSize: 17, fontWeight: '700', marginTop: 1 },

  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: S.xl },
  slot: { width: '30.5%', borderWidth: 1, borderRadius: R.md, paddingVertical: 11,
    alignItems: 'center', minHeight: HIT + 8 },
  slotFree: { borderColor: C.line, backgroundColor: C.surface },
  slotBusy: { borderColor: C.lineSoft, backgroundColor: C.surface, opacity: 0.45 },
  slotOn: { backgroundColor: C.lime, borderColor: C.lime, opacity: 1 },
  slotT: { color: C.text, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  slotTBusy: { color: C.busy, textDecorationLine: 'line-through' },
  slotP: { color: C.dim2, fontSize: 10.5, marginTop: 3 },

  durRow: { flexDirection: 'row', gap: 8, paddingHorizontal: S.xl },
  dur: { flex: 1, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.md, paddingVertical: 12, alignItems: 'center', minHeight: 60 },
  durOn: { backgroundColor: C.lime, borderColor: C.lime },
  durOff: { opacity: 0.4, borderStyle: 'dashed' },
  durT: { color: C.text, fontSize: 14.5, fontWeight: '700' },
  durS: { color: C.dim2, fontSize: 11, marginTop: 3, fontVariant: ['tabular-nums'] },

  warn: { marginHorizontal: S.xl, marginTop: 12, padding: 12, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  warnT: { color: '#DFCCA8', fontSize: 12.5, lineHeight: 18 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row',
    alignItems: 'center', gap: 13, paddingHorizontal: S.xl, paddingTop: 14, paddingBottom: 34,
    backgroundColor: C.ink, borderTopWidth: 1, borderTopColor: C.lineSoft },
  barK: { color: C.dim2, fontSize: 11.5 },
  barV: { color: C.text, fontSize: 21, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
