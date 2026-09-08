// Главная — витрина клуба на живых данных. Показывает, есть ли сегодня место,
// и уводит в выбор времени одной большой кнопкой.
import { useCallback } from 'react';
import {
  Animated, ScrollView, Text, View, Pressable, StyleSheet, Image,
  useWindowDimensions, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED } from '../../src/theme';
import { api, rub, type ApiGrid, type ApiTournament, type ApiBooking } from '../../src/api';
import { useApi } from '../../src/useApi';
import { useProfile } from '../../src/profile';
import { Loading, Failed } from '../../src/components/status';
import { IMG, HERO, TOURN_IMG } from '../../src/images';
import { Mark, IconChevron, IconCheck } from '../../src/components/icons';
import { WhereWeAre, SocialButtons } from '../../src/components/contacts';
import { TopScrim, useTopScrim } from '../../src/components/topscrim';
import {
  today, hh, plural, dayMonth, dateOfIso, hourOfIso,
} from '../../src/dates';

const CLUB_NAME = 'Magas Padel';
const CLUB_CITY = 'Магас';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { profile } = useProfile();
  const phone = profile?.phone;
  const scrim = useTopScrim();

  const q = useApi(async () => {
    const [grid, tournaments, bookings] = await Promise.all([
      api.grid(today()),
      api.tournaments(phone),
      phone ? api.myBookings(phone) : Promise.resolve([] as ApiBooking[]),
    ]);
    return { grid, tournaments, bookings };
  }, [phone]);

  useFocusEffect(useCallback(() => { q.refresh() }, [phone]));

  if (q.loading) return <Loading note="Смотрю, что свободно" />;
  if (q.error || !q.data) return <Failed message={q.error ?? 'Пустой ответ'} onRetry={q.reload} />;

  const { grid, tournaments, bookings } = q.data;
  // Снимок клуба показываем целиком, в своих пропорциях 3:2, и почти
  // не затемняем: фотографии тёмные сами по себе, под градиентом от них
  // остался бы чёрный прямоугольник. Текст поэтому стоит под снимком,
  // а не поверх — так он читается и выглядит дороже.
  const heroH = Math.round(Math.min(width, 520) / 1.5);

  const freeHours = grid.courts.reduce(
    (n, c) => n + c.hours.filter(h => h.status === 'free').length, 0);
  const soonest = grid.courts
    .map(c => c.hours.find(h => h.status === 'free')?.hour)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b)[0] ?? null;
  const freeText = soonest == null
    ? 'Сегодня всё занято — посмотрите другие дни'
    : `${freeHours} ${plural(freeHours, 'свободный час', 'свободных часа', 'свободных часов')}`
      + ` · ближайшее в ${hh(soonest)}`;

  // Самая низкая цена дня — её и показываем в «от …» на витрине
  const cheapest = Math.min(...grid.courts.flatMap(c => c.hours.map(h => h.price)).filter(p => p > 0));

  // Футбольное поле живёт по своим правилам: другая игра, другая компания,
  // другая цена. В общем ряду кортов оно терялось.
  const padel = grid.courts.filter(c => !c.isFootball);
  const pitch = grid.courts.find(c => c.isFootball) ?? null;
  const pitchFree = pitch?.hours.filter(h => h.status === 'free') ?? [];
  const pitchPrice = pitch?.hours.find(h => h.status === 'free')?.price
    ?? pitch?.hours.find(h => h.hour >= grid.morningUntil)?.price ?? 0;

  const tourn = tournaments.find(t => t.state === 'open') ?? tournaments.find(t => t.state === 'soon');
  const mine = bookings.filter(b => b.status !== 'cancelled');
  const entered = tournaments.filter(t => t.entered);

  const go = (path: string, params?: Record<string, string>) => {
    Haptics.selectionAsync();
    router.push(params ? { pathname: path as never, params } : (path as never));
  };

  return (
    <View style={st.root}>
    <Animated.ScrollView style={st.root} contentContainerStyle={{ paddingBottom: 34 }}
      showsVerticalScrollIndicator={false}
      onScroll={scrim.onScroll} scrollEventThrottle={scrim.scrollEventThrottle}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={C.dim} />}>

      <View style={[st.brandRow, { paddingTop: insets.top + 12 }]}>
        <Mark size={34} />
        <Text style={st.brand}>{CLUB_NAME}</Text>
        <Text style={st.brandCity}>{CLUB_CITY}</Text>
      </View>

      <View style={[st.hero, { height: heroH }]}>
        <Image source={HERO} style={st.fillImg} resizeMode="cover" />
        {/* Только мягкий край снизу, чтобы снимок не обрывался линией */}
        <LinearGradient colors={['rgba(11,15,12,0)', 'rgba(11,15,12,.85)']}
          locations={[0.72, 1]} style={st.fill} />
      </View>

      <View style={st.lead}>
        <Text style={st.eyebrow}>АССАЛАМУ АЛЕЙКУМ</Text>
        {/* Один огромный узкий заголовок прописными и больше ничего крупного.
            Так устроена типографика Nike: крайний контраст между витринным
            ярусом и тихим текстом 12–16, середины нет вовсе. */}
        <Text style={st.display} allowFontScaling={false}>ПАДЕЛ{'\n'}В МАГАСЕ</Text>
        <Text style={st.meta}>
          {padel.length} {plural(padel.length, 'корт', 'корта', 'кортов')}
          {pitch ? '  ·  мини-футбольное поле' : ''}
          {'  ·  '}{hh(grid.openHour)}–24:00
        </Text>

        {/* Свободные часы живут прямо в кнопке: раньше то же самое
            повторялось трижды — строкой под кнопкой и отдельной карточкой. */}
        <Pressable onPress={() => go('/schedule')} accessibilityRole="button"
          accessibilityLabel={`Забронировать. ${freeText}`}
          style={({ pressed }) => [st.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] }]}>
          <View style={{ flex: 1 }}>
            <Text style={st.ctaT}>Забронировать</Text>
            <Text style={st.ctaS}>{freeText}</Text>
          </View>
          <IconChevron size={20} color={C.onLime} />
        </Pressable>
      </View>

      {(mine.length > 0 || entered.length > 0) && (
        <Pressable onPress={() => go('/bookings')}
          style={({ pressed }) => [st.mine, pressed && { opacity: 0.8 }]}>
          <View style={st.mineIcon}><IconCheck size={14} color={C.onLime} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.mineT}>
              {mine.length > 0
                ? `${mine[0].courtName}, ${hh(mine[0].hour)} – ${hh(mine[0].hour + mine[0].hours)}`
                : 'Вы записаны на турнир'}
            </Text>
            <Text style={st.mineS}>
              {mine.length + entered.length > 1
                ? `и ещё ${mine.length + entered.length - 1}`
                : mine.length > 0
                  ? (mine[0].status === 'confirmed' ? 'подтверждено' : 'ждёт подтверждения')
                  : 'смотреть в моих записях'}
            </Text>
          </View>
          <IconChevron size={15} color={C.dim2} />
        </Pressable>
      )}

      {/* Связь с клубом — сразу под первым экраном: заказчик просил
          держать WhatsApp и Instagram на виду, а не прятать в «Клуб». */}
      <SocialButtons />

      <View style={st.secHead}>
        <Text style={st.secT}>Падел-корты</Text>
        <Text style={st.secS}>{padel.length}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.strip}>
        {padel.map(c => {
          const free = c.hours.find(h => h.status === 'free');
          const price = c.hours.find(h => h.hour === (free?.hour ?? grid.morningUntil))?.price ?? 0;
          return (
            <Pressable key={c.courtId}
              onPress={() => go('/court', { id: c.courtId, date: today() })}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${free ? 'ближайшее время ' + hh(free.hour) : c.closed ? 'закрыт' : 'сегодня занят'}`}
              style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]}>
              <Image source={IMG[c.courtId] ?? IMG.c1} style={st.cardImg} resizeMode="cover" />
              <LinearGradient colors={['rgba(9,13,10,0)', 'rgba(9,13,10,.9)']}
                locations={[0.35, 1]} style={st.fill} />
              <View style={st.cardIn}>
                <Text style={st.cardN}>{c.name}</Text>
                <Text style={[st.cardS, !free && { color: C.dim2 }]}>
                  {c.closed ? 'закрыт на ремонт' : free ? `свободно с ${hh(free.hour)}` : 'сегодня занят'}
                </Text>
              </View>
              {!c.closed && (
                <View style={st.cardPrice}><Text style={st.cardPriceT}>{rub(price)}</Text></View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Мини-футбольное поле — отдельным блоком со своей записью */}
      {pitch && (
        <>
          <View style={st.secHead}>
            <Text style={st.secT}>Мини-футбол</Text>
            <Text style={st.secS}>поле целиком</Text>
          </View>
          <Pressable
            onPress={() => go('/football')}
            accessibilityRole="button"
            accessibilityLabel={'Мини-футбольное поле. ' + (pitchFree.length > 0
              ? `свободно ${pitchFree.length} ${plural(pitchFree.length, 'час', 'часа', 'часов')} сегодня`
              : 'сегодня занято') + '. Забронировать'}
            style={({ pressed }) => [st.pitch, pressed && { opacity: 0.9 }]}>
            <Image source={IMG[pitch.courtId] ?? IMG.f1} style={st.fillImg} resizeMode="cover" />
            <LinearGradient colors={['rgba(9,13,10,.30)', 'rgba(9,13,10,.62)', 'rgba(9,13,10,.96)']}
              locations={[0, 0.5, 1]} style={st.fill} />
            <View style={st.pitchIn}>
              <Text style={st.pitchEyebrow}>ПОЛЕ ЦЕЛИКОМ</Text>
              <Text style={st.pitchN}>{pitch.name}</Text>
              <Text style={st.pitchS}>
                {pitch.closed ? 'Закрыто на ремонт'
                  : pitchFree.length > 0
                    ? `Свободно ${pitchFree.length} ${plural(pitchFree.length, 'час', 'часа', 'часов')} сегодня`
                    : 'Сегодня занято — посмотрите другие дни'}
              </Text>
              <View style={st.pitchRow}>
                <Text style={st.pitchPrice}>{pitchPrice > 0 ? rub(pitchPrice) : '—'}</Text>
                <Text style={st.pitchUnit}>за час</Text>
                <View style={st.pitchCta}>
                  <Text style={st.pitchCtaT}>Забронировать</Text>
                  <IconChevron size={15} color={C.onLime} />
                </View>
              </View>
            </View>
          </Pressable>
        </>
      )}

      {tourn && (
        <>
          <View style={st.secHead}>
            <Text style={st.secT}>Ближайший турнир</Text>
            <Pressable onPress={() => go('/tournaments')} accessibilityRole="button"
              style={({ pressed }) => [st.secLinkHit, pressed && { opacity: 0.7 }]}>
              <Text style={st.secLink}>все турниры</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => go('/tournament', { id: String(tourn.id) })}
            style={({ pressed }) => [st.tourn, pressed && { opacity: 0.88 }]}>
            <Image source={TOURN_IMG[tourn.coverUrl ?? 't1'] ?? TOURN_IMG.t1}
              style={st.cardImg} resizeMode="cover" />
            <LinearGradient colors={['rgba(9,13,10,.15)', 'rgba(9,13,10,.9)']}
              locations={[0.3, 1]} style={st.fill} />
            <View style={st.tournIn}>
              <Text style={st.tournN}>{tourn.name}</Text>
              <Text style={st.tournS}>
                {dayMonth(dateOfIso(tourn.startsAt))}, {hh(hourOfIso(tourn.startsAt))} ·
                {' '}осталось {Math.max(0, tourn.seats - tourn.taken)} мест
              </Text>
            </View>
          </Pressable>
        </>
      )}

      <View style={st.secHead}>
        <Text style={st.secT}>Клуб</Text>
        <Pressable onPress={() => go('/club')} accessibilityRole="button"
          style={({ pressed }) => [st.secLinkHit, pressed && { opacity: 0.7 }]}>
          <Text style={st.secLink}>контакты и правила</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => go('/prices')} accessibilityRole="button"
        style={({ pressed }) => [st.priceRow, pressed && { opacity: 0.85 }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.priceT}>Прайс-лист</Text>
          <Text style={st.priceS}>от {rub(cheapest)} за час · утром дешевле</Text>
        </View>
        <IconChevron size={17} color={C.dim} />
      </Pressable>

      <WhereWeAre />
      <View style={[st.info, { marginTop: 10 }]}>
        <InfoRow k="Работаем" v={`с ${hh(grid.openHour)} до полуночи`} />
        <InfoRow k="Аренда" v="ровно час, можно два и три подряд" />
        <InfoRow k="Оплата" v="на месте, в клубе" />
        <InfoRow k="Отмена" v="бесплатно за 4 часа" last />
      </View>

      <Text style={st.foot}>
        Данные в приложении пока учебные. Настоящие цены, часы и фотографии — от клуба.
      </Text>
    </Animated.ScrollView>
    <TopScrim scrollY={scrim.scrollY} />
    </View>
  );
}

function InfoRow({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[st.infoRow, last && { borderBottomWidth: 0 }]}>
      <Text style={st.infoK}>{k}</Text>
      <Text style={st.infoV}>{v}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Для картинок мало одних краёв: без ширины и высоты React Native Web
  // растягивает их до собственного размера, и виден лишь угол снимка.
  fillImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%' },
  hero: { overflow: 'hidden', backgroundColor: C.surface, marginTop: 14 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: S.xl },
  brand: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 2.4,
    textTransform: 'uppercase', flex: 1 },
  brandCity: { color: C.dim2, fontSize: 13, letterSpacing: 1.6, textTransform: 'uppercase' },

  lead: { paddingHorizontal: S.xl, paddingTop: 24 },
  eyebrow: { color: C.limeDim, fontFamily: DISP_MED, fontSize: 13, letterSpacing: 3 },
  // Межстрочный у Nike 0,9 от кегля. В React Native так нельзя: при lineHeight
  // меньше размера шрифта iOS срезает верх прописных — уже обжигались.
  // Берём минимальный безопасный запас, 1,04.
  display: { color: C.text, fontFamily: DISP, fontSize: 56, lineHeight: 58,
    letterSpacing: 0, marginTop: 14 },
  // Тихий ярус: всё, что не витрина, живёт здесь и не спорит с заголовком
  meta: { color: C.dim, fontSize: 13, lineHeight: 20, marginTop: 16,
    letterSpacing: 0.4 },
  // Одна кнопка, без соперников на экране
  cta: { backgroundColor: C.lime, borderRadius: R.pill, paddingVertical: 16, paddingHorizontal: 24,
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 22, minHeight: HIT },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 15, letterSpacing: 2.2,
    textTransform: 'uppercase' },
  ctaS: { color: 'rgba(11,15,12,.62)', fontSize: 13, fontWeight: '600',
    marginTop: 3, letterSpacing: 0.2 },

  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl,
    marginBottom: 10, padding: 15, borderRadius: R.xl, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface, minHeight: 66 },
  priceT: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 1.6,
    textTransform: 'uppercase' },
  priceS: { color: C.dim, fontSize: 13, marginTop: 3 },

  mine: { flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: S.xl, marginTop: 10,
    padding: 12, borderRadius: R.lg, borderWidth: 1, borderColor: 'rgba(198,240,51,.28)',
    backgroundColor: 'rgba(198,240,51,.06)', minHeight: 62 },
  mineIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  mineT: { color: C.text, fontSize: 15, fontWeight: '700' },
  mineS: { color: C.dim2, fontSize: 13, marginTop: 1 },

  pitch: { marginHorizontal: S.xl, height: 230, borderRadius: 24, overflow: 'hidden',
    backgroundColor: C.surface, justifyContent: 'flex-end' },
  pitchIn: { padding: 18 },
  pitchEyebrow: { color: C.lime, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 2 },
  pitchN: { color: C.text, fontFamily: DISP, fontSize: 28, lineHeight: 30,
    letterSpacing: 0, marginTop: 8, textTransform: 'uppercase' },
  pitchS: { color: '#D6DECF', fontSize: 13, marginTop: 4 },
  pitchRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 14 },
  pitchPrice: { color: C.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  pitchUnit: { color: C.dim, fontSize: 13 },
  pitchCta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 'auto',
    backgroundColor: C.lime, borderRadius: R.pill, paddingVertical: 10, paddingHorizontal: 16 },
  pitchCtaT: { color: C.onLime, fontSize: 15, fontWeight: '700' },

  // Заголовки разделов: прописные с широким трекингом. Мелкая деталь,
  // но именно она отличает дорогой вид от обычного.
  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.xl, marginTop: 36, marginBottom: 14 },
  secT: { color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 2.6,
    textTransform: 'uppercase' },
  secS: { color: C.dim2, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
    fontVariant: ['tabular-nums'] },
  secLink: { color: C.limeDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.8,
    textTransform: 'uppercase' },
  secLinkHit: { paddingVertical: 12, paddingHorizontal: 10, marginVertical: -12, marginRight: -10,
    minHeight: HIT, justifyContent: 'center' },

  strip: { paddingHorizontal: S.xl, gap: 10 },
  card: { width: 164, height: 206, borderRadius: R.xl, overflow: 'hidden',
    backgroundColor: C.surface, justifyContent: 'flex-end' },
  cardImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  cardIn: { padding: 13 },
  cardN: { color: C.text, fontSize: 15, fontWeight: '700', letterSpacing: 0.6 },
  cardS: { color: C.limeDim, fontSize: 11, marginTop: 3, fontWeight: '600', letterSpacing: 0.3 },
  cardPrice: { position: 'absolute', top: 11, right: 11, backgroundColor: 'rgba(9,13,10,.66)',
    borderRadius: R.pill, paddingVertical: 4, paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(237,242,233,.22)' },
  cardPriceT: { color: C.text, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },

  tourn: { marginHorizontal: S.xl, height: 148, borderRadius: R.xl, overflow: 'hidden',
    justifyContent: 'flex-end', backgroundColor: C.surface },
  tournIn: { padding: 15 },
  tournN: { color: C.text, fontFamily: DISP, fontSize: 28, lineHeight: 30,
    letterSpacing: 0, textTransform: 'uppercase' },
  tournS: { color: '#CBD5C2', fontSize: 13, marginTop: 3, fontWeight: '600' },

  // Без рамки: только волосяные линии между строками. Меньше «коробочности».
  info: { marginHorizontal: S.xl, borderRadius: R.lg, backgroundColor: C.surface,
    paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  infoK: { color: C.dim2, fontSize: 13, flex: 1, letterSpacing: 1.2, textTransform: 'uppercase' },
  infoV: { color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'right', flexShrink: 1 },

  foot: { color: C.dim2, fontSize: 11, lineHeight: 17, textAlign: 'center',
    marginTop: 22, paddingHorizontal: 30 },
});
