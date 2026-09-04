// Экран площадки: фотография, цены, правила. Выбор времени живёт в расписании,
// здесь только рассказ о площадке и переход туда.
import { useCallback } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, Image } from 'react-native';
import { router, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP } from '../src/theme';
import { api, rub } from '../src/api';
import { useApi } from '../src/useApi';
import { IMG } from '../src/images';
import { Section, Line } from '../src/components/section';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { hh, today, plural } from '../src/dates';

const CANCEL_HOURS = 4;    // ЗАГЛУШКА: правила ждут подтверждения клуба
const LATE_MINUTES = 15;

export default function CourtScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const day = String(date ?? today());

  const q = useApi(async () => {
    const [courts, grid] = await Promise.all([api.courts(), api.grid(day)]);
    const court = courts.find(c => c.id === String(id)) ?? null;
    const row = grid.courts.find(c => c.courtId === String(id)) ?? null;
    return { court, row, grid };
  }, [id, day]);
  useFocusEffect(useCallback(() => { q.refresh() }, [id, day]));

  if (q.loading) return (<><Stack.Screen options={{ title: 'Площадка' }} /><Loading /></>);
  if (q.error) return (<><Stack.Screen options={{ title: 'Площадка' }} />
    <Failed message={q.error} onRetry={q.reload} /></>);

  const court = q.data?.court;
  const row = q.data?.row;
  if (!court) return (
    <NotFound title="Площадка не найдена"
      note="Возможно, её убрали из расписания. Свободное время всех площадок — на главной." />
  );

  const free = row?.hours.filter(h => h.status === 'free') ?? [];
  const closed = !!row?.closed;

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Stack.Screen options={{ title: court.name }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 170 }} showsVerticalScrollIndicator={false}>

        <View style={s.hero}>
          <Image source={IMG[court.id] ?? IMG.c1} style={s.heroImg} resizeMode="cover" />
          <LinearGradient colors={['rgba(11,15,12,.05)', 'rgba(11,15,12,.5)', 'rgba(11,15,12,.95)']}
            locations={[0, 0.55, 1]} style={s.fill} />
        </View>

        <View style={s.head}>
          <Text style={s.name}>{court.name}</Text>
          <Text style={s.sub}>Magas Padel, Магас</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{rub(court.priceEvening)}</Text>
            <Text style={s.priceU}>за час вечером</Text>
            <View style={[s.tag, closed && s.tagOff]}>
              <Text style={[s.tagT, closed && { color: C.busy }]}>
                {closed ? (court.closedReason ?? 'закрыта')
                  : free.length > 0
                    ? `${free.length} ${plural(free.length, 'свободный час', 'свободных часа', 'свободных часов')}`
                    : 'на сегодня занята'}
              </Text>
            </View>
          </View>
        </View>

        <Section title="Цены"
          summary={`${rub(court.priceDay)} днём · ${rub(court.priceEvening)} вечером`} open>
          <Line k={`Днём, до ${hh(court.eveningFrom)}`} v={`${rub(court.priceDay)} за час`} />
          <Line k={`Вечером, с ${hh(court.eveningFrom)}`} v={`${rub(court.priceEvening)} за час`} accent />
          <Line k="Два часа подряд вечером" v={rub(court.priceEvening * 2)} />
          <Text style={s.small}>
            Цена считается по часам: если игра начинается днём и заходит на вечер,
            часы складываются по своим тарифам. Оплата на месте, в клубе.
          </Text>
        </Section>

        <Section title="Правила"
          summary={`Отмена за ${CANCEL_HOURS} часа · опоздание ${LATE_MINUTES} минут`}>
          <Line k="Отмена" v={`бесплатно за ${CANCEL_HOURS} часа`} />
          <Line k="Опоздание" v={`корт держим ${LATE_MINUTES} минут`} />
          <Line k="Минимальная аренда" v="один час" />
          <Line k="Оплата" v="на месте, в клубе" />
          <Text style={s.small}>
            Если планы изменились — отмените запись в приложении. Время сразу
            освободится для других игроков, и это ничего не стоит.
          </Text>
        </Section>

        <Section title="Что нужно знать" summary="Ракетки, мячи, раздевалка">
          <View style={s.q}>
            <Text style={s.qT}>Эти сведения ещё не получены от клуба</Text>
            <Text style={s.qS}>
              Есть ли прокат ракеток, входят ли мячи в стоимость, что с раздевалкой
              и душем — вопрос к владельцу. Придумывать ответы мы не стали.
            </Text>
          </View>
        </Section>
      </ScrollView>

      <View style={s.bar}>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); router.push('/schedule') }}
          accessibilityRole="button"
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}>
          <Text style={s.ctaT}>Выбрать время</Text>
        </Pressable>
        <Text style={s.barSub}>Все площадки и часы на одном экране</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hero: { height: 230, overflow: 'hidden' },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  head: { paddingHorizontal: S.xl, paddingTop: 4, paddingBottom: 20 },
  name: { color: C.text, fontFamily: DISP, fontSize: 30, letterSpacing: 0.4 },
  sub: { color: C.dim2, fontSize: 13.5, marginTop: 3 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  price: { color: C.text, fontSize: 21, fontWeight: '800', fontVariant: ['tabular-nums'] },
  priceU: { color: C.dim, fontSize: 13 },
  tag: { marginLeft: 'auto', borderWidth: 1, borderColor: 'rgba(198,240,51,.35)',
    backgroundColor: 'rgba(198,240,51,.08)', borderRadius: 8, paddingVertical: 4, paddingHorizontal: 9 },
  tagOff: { borderColor: C.line, backgroundColor: C.surface },
  tagT: { color: C.limeDim, fontSize: 11, fontWeight: '700' },

  small: { color: C.dim2, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  q: { padding: 13, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  qT: { color: C.text, fontSize: 13.5, fontWeight: '700' },
  qS: { color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 5 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 17,
    alignItems: 'center', minHeight: HIT + 10, justifyContent: 'center' },
  ctaT: { color: C.onLime, fontSize: 17, fontWeight: '700' },
  barSub: { color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },
});
