// Главный экран. Ось интерфейса — время, а не площадка.
// Композиция по вертикали: верх информация, низ управление — туда достаёт палец.
// Все блоки с фиксированной высотой, тянется только фотография.
import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, Pressable, ScrollView, StyleSheet, Image,
  Modal, Platform, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT } from '../../src/theme';
import {
  CLUB, VISIBLE_COURTS, dayHours, freeCourtsAt, firstFreeHour,
  priceAt, fmt, hh, type Court,
} from '../../src/data';
import { IMG, HERO } from '../../src/images';
import { IconCalendar, IconChevron, IconCheck } from '../../src/components/icons';

const NOW = 18;          // ЗАГЛУШКА: «текущий час»
const OFFLINE = false;
const STRIP_H = 78;      // высота ленты часов — фиксированная, иначе растягивается

export default function Home() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const [hour, setHour] = useState<number | null>(null);
  const [court, setCourt] = useState<Court | null>(null);
  const [picker, setPicker] = useState(false);

  const hours = useMemo(() => dayHours(NOW), []);
  const open = hours.filter(h => !h.past);
  const anyFree = open.some(h => h.free > 0);

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(false);
      const f = firstFreeHour(NOW);
      if (f != null) setHour(f);
    }, 520);
    return () => clearTimeout(t);
  }, []);

  const free = hour != null ? freeCourtsAt(hour, NOW) : [];
  const assigned = court && free.some(c => c.id === court.id) ? court : free[0] ?? null;
  const price = hour != null && assigned ? priceAt(assigned, hour) : 0;

  // На коротких экранах жертвуем воздухом вокруг заголовка, фото тянется само
  const tight = height < 760;

  const pick = (h: number, ok: boolean) => {
    if (!ok) return;
    Haptics.selectionAsync();
    setHour(h);
    setCourt(null);
  };

  const book = () => {
    if (hour == null || !assigned) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/court', params: { id: assigned.id, hour: String(hour) } });
  };

  if (loading) return <Skeleton top={insets.top} tight={tight} />;

  return (
    <View style={[st.root, { paddingTop: insets.top + 4 }]}>

      {/* дата */}
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <Text style={st.hDate}>Сегодня, 2 сентября</Text>
          <Text style={st.hSub}>вторник · {CLUB.name}</Text>
        </View>
        <Pressable hitSlop={6} onPress={() => Haptics.selectionAsync()}
          style={({ pressed }) => [st.calBtn, pressed && { opacity: 0.7 }]}>
          <IconCalendar />
        </Pressable>
      </View>

      {OFFLINE && (
        <View style={st.offline}>
          <Text style={st.offlineT}>
            Нет связи. Расписание на <Text style={{ fontWeight: '700' }}>18:12</Text>.
          </Text>
        </View>
      )}

      {!anyFree ? <AllBusy /> : (
        <>
          {/* главная цифра */}
          <View style={[st.headline, tight && { paddingTop: 12, paddingBottom: 10 }]}>
            <Text style={st.time} allowFontScaling maxFontSizeMultiplier={1.3}>
              <Text style={{ color: C.lime }}>{hour != null ? hh(hour) : '—'}</Text>
              <Text style={{ color: C.dim }}>{hour != null ? ` – ${hh(hour + 1)}` : ''}</Text>
            </Text>
            <View style={st.meta}>
              <View style={st.dot} />
              <Text style={st.metaT}>
                <Text style={{ color: C.text, fontWeight: '700' }}>{free.length}</Text>
                <Text> из {VISIBLE_COURTS.length} свободно</Text>
              </Text>
              <Text style={st.metaSep}>·</Text>
              <Text style={st.metaT}>{fmt(price)} за час</Text>
            </View>
          </View>

          {/* фотография — фиксированный кадр 4:3, вокруг гибкий воздух */}
          <View style={st.air} />
          <View style={st.photoBox}>
            <Image source={assigned ? IMG[assigned.id] : HERO}
              style={st.photo} resizeMode="cover" />
            <View style={st.photoScrim} />
          </View>
          <View style={st.air} />

          {/* лента часов — фиксированная высота */}
          <Text style={[st.label, tight && { marginBottom: 8 }]}>Во сколько играть</Text>
          <View style={{ height: STRIP_H }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={st.strip}>
              {open.map(h => {
                const on = hour === h.hour;
                const ok = h.free > 0;
                return (
                  <Pressable key={h.hour} disabled={!ok} onPress={() => pick(h.hour, ok)}
                    accessibilityRole="button"
                    accessibilityLabel={ok
                      ? `${hh(h.hour)}, свободно ${h.free}`
                      : `${hh(h.hour)}, занято`}
                    accessibilityState={{ selected: on, disabled: !ok }}
                    style={({ pressed }) => [st.chip, on && st.chipOn, !ok && st.chipOff,
                      pressed && ok && !on && { backgroundColor: C.surface2 }]}>
                    <Text style={[st.chipH, on && { color: C.onLime }, !ok && { color: C.busy }]}>
                      {String(h.hour).padStart(2, '0')}
                    </Text>
                    <Text style={[st.chipN, on && { color: 'rgba(11,15,12,.7)' }, !ok && { color: C.busy }]}>
                      {ok ? `${h.free} своб.` : 'занято'}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* нижняя панель: стекло там, где под ней проезжает лента */}
          <BlurView intensity={Platform.OS === 'ios' ? 34 : 0} tint="dark"
            style={[st.bottom, { paddingBottom: insets.bottom + 14 }]}>
            {assigned && (
              <Pressable onPress={() => { if (free.length > 1) { Haptics.selectionAsync(); setPicker(true) } }}
                disabled={free.length < 2}
                style={({ pressed }) => [st.courtRow, pressed && { opacity: 0.65 }]}>
                <View style={st.courtDot} />
                <Text style={st.courtT}>{assigned.name}</Text>
                {free.length > 1 && (
                  <>
                    <Text style={st.courtHint}>заменить</Text>
                    <IconChevron size={15} color={C.dim2} />
                  </>
                )}
              </Pressable>
            )}
            <Pressable onPress={book} disabled={!assigned} accessibilityRole="button"
              style={({ pressed }) => [st.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }]}>
              <Text style={st.ctaT}>
                {hour != null ? `Записаться на ${hh(hour)}` : 'Выберите время'}
              </Text>
            </Pressable>
          </BlurView>
        </>
      )}

      {/* выбор площадки */}
      <Modal visible={picker} transparent animationType="slide"
        onRequestClose={() => setPicker(false)}>
        <Pressable style={st.scrim} onPress={() => setPicker(false)} />
        <View style={[st.sheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={st.grab} />
          <Text style={st.sheetT}>Свободно в {hour != null ? hh(hour) : ''}</Text>
          <Text style={st.sheetS}>Площадки одинаковые — можно любую</Text>
          {free.map(c => {
            const on = assigned?.id === c.id;
            return (
              <Pressable key={c.id}
                onPress={() => { Haptics.selectionAsync(); setCourt(c); setPicker(false) }}
                style={({ pressed }) => [st.row, on && st.rowOn, pressed && { opacity: 0.8 }]}>
                <Image source={IMG[c.id]} style={st.rowPh} resizeMode="cover" />
                <Text style={st.rowN}>{c.name}</Text>
                {on && <View style={st.check}><IconCheck size={13} /></View>}
                <Text style={st.rowP}>{fmt(priceAt(c, hour ?? 19))}</Text>
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

/* загрузка — скелет, а не крутилка */
function Skeleton({ top, tight }: { top: number; tight: boolean }) {
  return (
    <View style={[st.root, { paddingTop: top + 4 }]}>
      <View style={st.header}>
        <View style={{ flex: 1 }}>
          <View style={[st.sk, { width: 168, height: 15 }]} />
          <View style={[st.sk, { width: 118, height: 11, marginTop: 7 }]} />
        </View>
        <View style={[st.sk, { width: HIT, height: HIT, borderRadius: R.md }]} />
      </View>
      <View style={[st.headline, tight && { paddingTop: 12, paddingBottom: 10 }]}>
        <View style={[st.sk, { width: 226, height: 42 }]} />
        <View style={[st.sk, { width: 190, height: 13, marginTop: 12 }]} />
      </View>
      <View style={st.air} />
      <View style={st.photoBox}>
        <View style={[st.sk, { flex: 1, borderRadius: R.xl }]} />
      </View>
      <View style={st.air} />
      <View style={[st.sk, { width: 128, height: 13, marginHorizontal: S.xl, marginTop: 22 }]} />
      <View style={{ height: STRIP_H, flexDirection: 'row', gap: 9, paddingHorizontal: S.xl, marginTop: 10 }}>
        {[0, 1, 2, 3, 4].map(i => <View key={i} style={[st.sk, { width: 66, height: STRIP_H - 8 }]} />)}
      </View>
      <View style={st.bottom}>
        <View style={[st.sk, { width: 130, height: 13, marginBottom: 12 }]} />
        <View style={[st.sk, { height: 54, borderRadius: R.lg }]} />
      </View>
    </View>
  );
}

/* всё занято */
function AllBusy() {
  return (
    <View style={st.busy}>
      <Text style={st.busyT}>Сегодня всё занято</Text>
      <Text style={st.busyS}>Вечер вторника — самое загруженное время недели.</Text>
      <View style={st.busyCard}>
        <Text style={st.busyK}>ЗАВТРА С УТРА</Text>
        <Text style={st.busyV}>08:00 · 2 500 ₽</Text>
        <Text style={st.busySub}>дешевле на 2 000 ₽</Text>
      </View>
      <Pressable style={st.busyBtn} onPress={() => router.push('/grid')}>
        <Text style={st.busyBtnT}>Посмотреть другие дни</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },

  header: { flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: S.xl, paddingBottom: 2 },
  hDate: { color: C.text, fontSize: 15.5, fontWeight: '700', letterSpacing: -0.1 },
  hSub: { color: C.dim2, fontSize: 12.5, marginTop: 2 },
  calBtn: { width: HIT, height: HIT, borderRadius: R.md, borderWidth: 1,
    borderColor: C.line, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },

  offline: { marginHorizontal: S.xl, marginTop: 10, paddingVertical: 10, paddingHorizontal: 13,
    borderRadius: R.md, backgroundColor: 'rgba(240,169,59,.1)',
    borderWidth: 1, borderColor: 'rgba(240,169,59,.3)' },
  offlineT: { color: '#DFCCA8', fontSize: 12.5, lineHeight: 18 },

  headline: { paddingHorizontal: S.xl, paddingTop: 22, paddingBottom: 18 },
  time: { fontSize: 42, fontWeight: '800', letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9, flexWrap: 'wrap' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime },
  metaT: { color: C.dim, fontSize: 13.5 },
  metaSep: { color: C.line, fontSize: 13.5 },

  air: { flex: 1, minHeight: 0 },
  photoBox: { marginHorizontal: S.xl, aspectRatio: 1, flexShrink: 1, minHeight: 130,
    borderRadius: 24, overflow: 'hidden', backgroundColor: C.surface },
  photo: { width: '100%', height: '100%' },
  photoScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(11,15,12,.10)' },

  label: { color: C.dim, fontSize: 13, fontWeight: '600',
    paddingHorizontal: S.xl, marginTop: 0, marginBottom: 11 },
  strip: { paddingHorizontal: S.xl, gap: 9 },
  chip: { width: 66, height: STRIP_H - 8, borderRadius: R.lg, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.lime, borderColor: C.lime },
  chipOff: { opacity: 0.4, backgroundColor: 'transparent' },
  chipH: { color: C.text, fontSize: 21, fontWeight: '700', fontVariant: ['tabular-nums'],
    letterSpacing: -0.5 },
  chipN: { color: C.dim2, fontSize: 11, marginTop: 3 },

  bottom: { paddingHorizontal: S.xl, paddingTop: 14, paddingBottom: 6,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(14,19,13,.72)' : C.ink2 },
  courtRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 11, minHeight: 22 },
  courtDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.greenMid },
  courtT: { color: C.text, fontSize: 13.5, fontWeight: '600', flex: 1 },
  courtHint: { color: C.dim2, fontSize: 12.5 },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 17, alignItems: 'center' },
  ctaT: { color: C.onLime, fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },

  scrim: { flex: 1, backgroundColor: 'rgba(4,7,5,.68)' },
  sheet: { backgroundColor: C.ink2, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: C.line, paddingHorizontal: S.xl, paddingTop: 12 },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.lineStrong,
    alignSelf: 'center', marginBottom: 18, opacity: 0.6 },
  sheetT: { color: C.text, fontSize: 20, fontWeight: '700' },
  sheetS: { color: C.dim2, fontSize: 13, marginTop: 3, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 9,
    paddingHorizontal: 10, marginBottom: 7, borderRadius: R.lg, borderWidth: 1,
    borderColor: C.lineSoft, backgroundColor: C.surface, minHeight: 62 },
  rowOn: { borderColor: C.lime, backgroundColor: 'rgba(198,240,51,.06)' },
  rowPh: { width: 42, height: 42, borderRadius: 11, overflow: 'hidden' },
  rowN: { color: C.text, fontSize: 15.5, fontWeight: '600', flex: 1 },
  check: { width: 20, height: 20, borderRadius: 10, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  rowP: { color: C.dim2, fontSize: 13, fontVariant: ['tabular-nums'] },

  sk: { backgroundColor: C.surface2, borderRadius: R.md },

  busy: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  busyT: { color: C.text, fontSize: 25, fontWeight: '800' },
  busyS: { color: C.dim, fontSize: 14.5, textAlign: 'center', marginTop: 9, lineHeight: 21 },
  busyCard: { alignSelf: 'stretch', marginTop: 24, padding: 16, borderRadius: R.lg,
    borderWidth: 1, borderColor: 'rgba(198,240,51,.3)', backgroundColor: 'rgba(198,240,51,.06)' },
  busyK: { color: C.limeDim, fontSize: 11, fontWeight: '700', letterSpacing: 0.9 },
  busyV: { color: C.text, fontSize: 18, fontWeight: '700', marginTop: 5 },
  busySub: { color: C.dim2, fontSize: 12.5, marginTop: 2 },
  busyBtn: { alignSelf: 'stretch', marginTop: 12, paddingVertical: 16, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center' },
  busyBtnT: { color: C.text, fontSize: 15.5, fontWeight: '600' },
});
