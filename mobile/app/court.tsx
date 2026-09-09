// Экран площадки — только рассказ о ней: фотография, описание, цены, правила.
//
// Записи отсюда нет намеренно. Заказчик просил один-единственный путь к брони —
// через сетку «часы × площадки», а этот экран нужен, чтобы посмотреть, какой
// у корта пол и чем он отличается от соседнего, прежде чем выбирать час.
import { useCallback } from 'react';
import { ScrollView, Text, View, StyleSheet, Image, Pressable } from 'react-native';
import { router, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R, S, DISP, DISP_MED, TITLE, BODY } from '../src/theme';
import { api, rub, discountPercent } from '../src/api';
import { useApi } from '../src/useApi';
import { IMG, COURT_PHOTOS } from '../src/images';
import { Gallery } from '../src/components/gallery';
import { Section, Line } from '../src/components/section';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { hh, today, plural } from '../src/dates';
import { useClub } from '../src/club';

const CANCEL_HOURS = 4;    // ЗАГЛУШКА: правила ждут подтверждения клуба
const LATE_MINUTES = 15;

export default function CourtScreen() {
  const club = useClub();
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const day = String(date ?? today());

  const q = useApi(async () => {
    const [courts, grid, prices] = await Promise.all([
      api.courts(), api.grid(day), api.prices()]);
    const court = courts.find(c => c.id === String(id)) ?? null;
    const row = grid.courts.find(c => c.courtId === String(id)) ?? null;
    // Правила про эту площадку или про все сразу
    const rules = prices.rules.filter(r => !r.courtId || r.courtId === String(id));
    return { court, row, grid, rules };
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
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Фотографии — главное на этом экране: площадки отличаются покрытием
            и цветом пола, и выбирают их глазами. */}
        <Gallery photos={COURT_PHOTOS[court.id] ?? [IMG[court.id] ?? IMG.c1]} />

        <View style={s.head}>
          <Text style={s.name}>{court.name}</Text>
          <Text style={s.sub}>Magas Padel, Магас</Text>
          <View style={s.priceRow}>
            <Text style={s.price}>{rub(court.priceStandard)}</Text>
            <Text style={s.priceU}>за час</Text>
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

        <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/schedule') }}
          accessibilityRole="button" accessibilityLabel="Забронировать: открыть сетку времени"
          style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}>
          <Text style={s.ctaT}>Забронировать</Text>
        </Pressable>
        <Text style={s.ctaNote}>Откроется сетка со всеми площадками и часами</Text>

        {court.description ? (
          <View style={s.about}>
            <Text style={s.aboutT}>{court.description}</Text>
          </View>
        ) : (
          <View style={s.about}>
            {/* ЗАГЛУШКА: описание пишет клуб из админки — не выдумываем */}
            <Text style={s.aboutNo}>
              Клуб ещё не рассказал об этой площадке. Появится здесь, как только опишет.
            </Text>
          </View>
        )}

        <Section title="Цены"
          summary={`${rub(court.priceMorning)} утром · ${rub(court.priceStandard)} дальше`} open>
          <Line k={`Утро, до ${hh(court.morningUntil)}`}
            v={`${rub(court.priceMorning)} за час`} accent />
          <Line k={`С ${hh(court.morningUntil)} до полуночи`}
            v={`${rub(court.priceStandard)} за час`} />
          <Line k="Выгода утром"
            v={`−${discountPercent(court.priceMorning, court.priceStandard)}%`} />
          {(q.data?.rules.length ?? 0) > 0 && (
            <Text style={[s.small, { color: C.amber }]}>
              В отдельные дни и часы цена другая — смотрите прайс-лист.
            </Text>
          )}
          <Text style={s.small}>
            Цена считается по часам: если игра начинается утром и заходит за
            {' '}{hh(court.morningUntil)}, часы складываются по своим тарифам.
            Бронь подтверждается предоплатой половины стоимости — менеджер
            подскажет, как её внести. Остальное платится на месте.
          </Text>
        </Section>

        <Section title="Правила"
          summary={`Отмена за ${club.cancelHours} часа · опоздание ${club.lateMinutes} минут`}>
          <Line k="Отмена" v={`за ${club.cancelHours} часа — бесплатно`} />
          <Line k="Опоздание" v={`корт держим ${club.lateMinutes} минут`} />
          <Line k="Минимальная аренда" v="один час" />
          <Line k="Подтверждение" v={`предоплата ${club.prepayPercent} %`} />
          <Line k="Остаток" v="на месте, в клубе" />
          <Text style={s.small}>
            Если планы изменились — скажите менеджеру или отмените в разделе
            «Мои записи». Время сразу освободится для других игроков.
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
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hero: { height: 230, overflow: 'hidden' },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  head: { paddingHorizontal: S.xl, paddingTop: 4, paddingBottom: 20 },
  name: { ...TITLE.page, color: C.text, textTransform: 'uppercase' },
  sub: { fontFamily: BODY, color: C.dim2, fontSize: 13.5, marginTop: 5 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 14, flexWrap: 'wrap' },
  price: { ...TITLE.section, color: C.text, fontVariant: ['tabular-nums'] },
  priceU: { fontFamily: BODY, color: C.dim, fontSize: 13 },
  tag: { marginLeft: 'auto', borderWidth: 1, borderColor: 'rgba(198,240,51,.35)',
    backgroundColor: 'rgba(198,240,51,.08)', borderRadius: 0, paddingVertical: 4, paddingHorizontal: 9 },
  tagOff: { borderColor: C.line, backgroundColor: C.surface },
  tagT: { color: C.limeDim, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1,
    textTransform: 'uppercase' },

  small: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  q: { padding: 13, borderRadius: R.md, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  qT: { color: C.text, fontFamily: DISP_MED, fontSize: 13.5, letterSpacing: -0.2 },
  qS: { fontFamily: BODY, color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 5 },

  cta: { backgroundColor: C.lime, marginHorizontal: S.xl, marginTop: 20,
    paddingVertical: 15, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  ctaNote: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, textAlign: 'center',
    marginTop: 8, marginBottom: 6 },
  about: { marginHorizontal: S.xl, marginBottom: 16, padding: 14, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  aboutT: { fontFamily: BODY, color: C.text, fontSize: 14.5, lineHeight: 21 },
  aboutNo: { fontFamily: BODY, color: C.dim2, fontSize: 13, lineHeight: 19 },
});
