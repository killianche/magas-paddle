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
import { C, R, S, HIT, DISP, DISP_MED, TITLE, BODY } from '../../src/theme';
import { Eyebrow, Ticker, OutlineText } from '../../src/components/velocity';
import { api, rub, type ApiGrid, type ApiTournament, type ApiBooking } from '../../src/api';
import { useApi } from '../../src/useApi';
import { useProfile, initials } from '../../src/profile';
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
  const { width, height } = useWindowDimensions();
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
  }, [phone], `home.${today()}.${phone ?? 'гость'}`);

  useFocusEffect(useCallback(() => { q.refresh() }, [phone]));

  // Экран рисуется сразу, не дожидаясь сети: фотография, название и кнопка
  // никаких данных не требуют. Крутилка во весь экран была самой заметной
  // задержкой, хотя ждать было нечего.
  const grid = q.data?.grid ?? null;
  const tournaments = q.data?.tournaments ?? [];
  const bookings = q.data?.bookings ?? [];
  const waiting = !q.data && !q.error;
  // Герой занимает первый экран почти целиком — так в макете. Снимки клуба
  // тёмные, поэтому затемняем их слабо и только по краям.
  const heroH = Math.max(430, Math.min(height * 0.62, 520));

  const courts = grid?.courts ?? [];
  const freeHours = courts.reduce(
    (n, c) => n + c.hours.filter(h => h.status === 'free').length, 0);
  const soonest = courts
    .map(c => c.hours.find(h => h.status === 'free')?.hour)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b)[0] ?? null;
  const freeText = waiting ? 'смотрю, что свободно'
    : q.error ? 'нет связи с клубом'
    : soonest == null
      ? 'Сегодня всё занято — посмотрите другие дни'
      : `${freeHours} ${plural(freeHours, 'свободный час', 'свободных часа', 'свободных часов')}`
        + ` · ближайшее в ${hh(soonest)}`;

  // Самая низкая цена дня — её и показываем в «от …» на витрине
  const prices = courts.flatMap(c => c.hours.map(h => h.price)).filter(p => p > 0);
  const cheapest = prices.length ? Math.min(...prices) : 0;

  // Футбольное поле живёт по своим правилам: другая игра, другая компания,
  // другая цена. В общем ряду кортов оно терялось.
  const padel = courts.filter(c => !c.isFootball);
  const pitch = courts.find(c => c.isFootball) ?? null;
  const pitchFree = pitch?.hours.filter(h => h.status === 'free') ?? [];
  const pitchPrice = pitch?.hours.find(h => h.status === 'free')?.price
    ?? pitch?.hours.find(h => h.hour >= (grid?.morningUntil ?? 13))?.price ?? 0;

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

      {/* Герой во всю высоту первого экрана: снимок, поверх него марка,
          плакатный заголовок и одна кнопка. Так устроен макет. */}
      <View style={[st.hero, { height: heroH }]}>
        <Image source={HERO} style={st.fillImg} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(2,7,5,.75)', 'rgba(2,7,5,.10)', 'rgba(2,7,5,.55)', 'rgba(2,7,5,1)']}
          locations={[0, 0.24, 0.62, 1]} style={st.fill} />

        <View style={[st.brandRow, { paddingTop: insets.top + 12 }]}>
          <Mark size={30} />
          <Text style={st.brand} allowFontScaling={false}>
            {CLUB_NAME.toUpperCase().replace(' ', '\n')}
          </Text>
          <View style={{ flex: 1 }} />
          {/* Аккаунт: имя и история посещений. Пока человек не завёл его —
              кнопка зовёт зарегистрироваться. */}
          <Pressable onPress={() => go('/account')} accessibilityRole="button"
            accessibilityLabel={profile ? `Аккаунт: ${profile.name}` : 'Создать аккаунт'}
            style={({ pressed }) => [st.circle, pressed && { opacity: 0.7 }]}>
            <Text style={st.circleT} allowFontScaling={false}>
              {profile ? initials(profile) : '+'}
            </Text>
          </Pressable>
        </View>

        <View style={st.heroCopy}>
          <Eyebrow>{`Ассаламу алейкум · ${CLUB_CITY}`}</Eyebrow>
          {/* Вторая строка контуром — приём из макета: заголовок читается
              как знак, а не просто как крупный текст. */}
          <Text style={st.h1} allowFontScaling={false}>ВЫХОДИ</Text>
          <OutlineText size={52} width={width - S.xl * 2}>НА КОРТ</OutlineText>

          <Pressable onPress={() => go('/schedule')} accessibilityRole="button"
            accessibilityLabel={`Забронировать. ${freeText}`}
            style={({ pressed }) => [st.heroAction, pressed && { opacity: 0.9 }]}>
            <Text style={st.heroActionT}>Забронировать</Text>
            <Text style={st.heroArrow}>→</Text>
          </Pressable>
        </View>
      </View>

      <Ticker items={waiting
        ? ['6 панорамных кортов', 'сегодня до 24:00', 'от 2 000 ₽']
        : [
            `${padel.length} ${plural(padel.length, 'корт', 'корта', 'кортов')}`,
            soonest == null ? 'сегодня всё занято' : `ближайшее в ${hh(soonest)}`,
            cheapest ? `от ${rub(cheapest)}` : 'футбольное поле',
          ]} />

      {!!q.error && (
        <Pressable onPress={q.reload} accessibilityRole="button"
          style={({ pressed }) => [st.offline, pressed && { opacity: 0.8 }]}>
          <Text style={st.offlineT}>Нет связи с клубом</Text>
          <Text style={st.offlineS}>
            {q.data ? 'Показано последнее, что успели загрузить. Нажмите, чтобы обновить.'
                    : 'Нажмите, чтобы попробовать снова.'}
          </Text>
        </Pressable>
      )}

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

      {(padel.length > 0 || waiting) && (
        <View style={st.secHead}>
          <Text style={st.secT}>Падел-корты</Text>
          <Text style={st.secS}>{waiting ? '' : padel.length}</Text>
        </View>
      )}
      {waiting && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.strip} scrollEnabled={false}>
          {[0, 1, 2].map(i => <View key={i} style={[st.card, st.cardWait]} />)}
        </ScrollView>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.strip}>
        {padel.map(c => {
          const free = c.hours.find(h => h.status === 'free');
          const price = c.hours.find(h => h.hour === (free?.hour ?? grid!.morningUntil))?.price ?? 0;
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

      {/* Футбольное поле — отдельным блоком со своей записью */}
      {pitch && (
        <>
          <View style={st.secHead}>
            <Text style={st.secT}>Футбольное поле</Text>
            <Text style={st.secS}>поле целиком</Text>
          </View>
          <Pressable
            onPress={() => go('/football')}
            accessibilityRole="button"
            accessibilityLabel={'Футбольное поле. ' + (pitchFree.length > 0
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
        {/* Сведения о клубе переехали в аккаунт — там же настройки и документы */}
        <Pressable onPress={() => go('/account')} accessibilityRole="button"
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
        <InfoRow k="Работаем" v={`с ${hh(grid?.openHour ?? 9)} до полуночи`} />
        <InfoRow k="Аренда" v="ровно час, можно два и три подряд" />
        <InfoRow k="Оплата" v="предоплата 50 %, остальное на месте" />
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
  hero: { overflow: 'hidden', backgroundColor: C.surface, justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.xl },
  // Марка в две строки, как в макете: MAGAS / PADEL
  brand: { color: C.text, fontFamily: DISP, fontSize: 15, lineHeight: 15,
    letterSpacing: -0.6 },
  circle: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.3)', backgroundColor: 'rgba(2,7,5,.65)',
    alignItems: 'center', justifyContent: 'center' },
  circleT: { fontFamily: DISP, color: C.text, fontSize: 13, letterSpacing: -0.2 },

  heroCopy: { paddingHorizontal: S.xl, paddingBottom: 24 },
  // Плакатный заголовок: очень жирный, прописной, буквы вплотную.
  // Отрицательный трекинг — главная черта макета.
  h1: { ...TITLE.hero, color: C.text, marginTop: 8 },
  // Вторая строка контуром. На iOS это делается обводкой текста.
  heroAction: { flexDirection: 'row', alignItems: 'center', gap: 22,
    alignSelf: 'flex-start', backgroundColor: C.lime,
    paddingVertical: 14, paddingHorizontal: 17, marginTop: 16, minHeight: HIT },
  heroActionT: { color: C.onLime, fontFamily: DISP, fontSize: 13, letterSpacing: 0.8,
    textTransform: 'uppercase' },
  heroArrow: { color: C.onLime, fontFamily: DISP, fontSize: 18 },

  // Мои записи — узкая полоса с акцентной чертой слева, без скруглений
  mine: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl,
    marginTop: 16, padding: 13, backgroundColor: C.surface,
    borderLeftWidth: 3, borderLeftColor: C.lime },
  mineIcon: { width: 26, height: 26, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  mineT: { color: C.text, fontFamily: DISP_MED, fontSize: 13 },
  mineS: { fontFamily: BODY, color: C.dim2, fontSize: 11, marginTop: 2 },

  // Прайс-лист одной строкой
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl,
    paddingVertical: 15, borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.line },
  priceT: { color: C.text, fontFamily: DISP, fontSize: 14, letterSpacing: -0.3,
    textTransform: 'uppercase' },
  priceS: { fontFamily: BODY, color: C.dim2, fontSize: 11, marginTop: 3 },

  // Футбольное поле: крупный плакат со своей записью
  pitch: { marginHorizontal: S.xl, height: 214, overflow: 'hidden',
    backgroundColor: C.surface, justifyContent: 'flex-end' },
  pitchIn: { padding: 16 },
  pitchEyebrow: { color: C.lime, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.6,
    textTransform: 'uppercase' },
  pitchN: { ...TITLE.card, color: C.text, marginTop: 7, textTransform: 'uppercase' },
  pitchS: { fontFamily: BODY, color: '#D0D9D2', fontSize: 11, marginTop: 5 },
  pitchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  pitchPrice: { color: C.text, fontFamily: DISP, fontSize: 18, letterSpacing: -0.5,
    fontVariant: ['tabular-nums'] },
  pitchUnit: { fontFamily: BODY, color: C.dim2, fontSize: 11 },
  pitchCta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 'auto',
    backgroundColor: C.lime, paddingVertical: 10, paddingHorizontal: 14 },
  pitchCtaT: { color: C.onLime, fontFamily: DISP, fontSize: 11, letterSpacing: 0.6,
    textTransform: 'uppercase' },

  offline: { marginHorizontal: S.xl, marginTop: 14, padding: 14, borderRadius: R.lg,
    borderWidth: 1, borderColor: 'rgba(240,169,59,.35)', backgroundColor: 'rgba(240,169,59,.07)' },
  offlineT: { fontFamily: BODY, color: C.amber, fontSize: 13, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase' },
  offlineS: { fontFamily: BODY, color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 5 },
  cardWait: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },

  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.xl, marginTop: 36, marginBottom: 14 },
  secT: { fontFamily: BODY, color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 2.6,
    textTransform: 'uppercase' },
  secS: { fontFamily: BODY, color: C.dim2, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
    fontVariant: ['tabular-nums'] },
  secLink: { fontFamily: BODY, color: C.limeDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.8,
    textTransform: 'uppercase' },
  secLinkHit: { paddingVertical: 12, paddingHorizontal: 10, marginVertical: -12, marginRight: -10,
    minHeight: HIT, justifyContent: 'center' },

  strip: { paddingHorizontal: S.xl, gap: 8 },
  card: { width: 224, height: 155, overflow: 'hidden',
    backgroundColor: C.surface, justifyContent: 'flex-end' },
  cardImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  cardIn: { padding: 13 },
  cardN: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  cardS: { fontFamily: BODY, color: C.limeDim, fontSize: 11, marginTop: 3, fontWeight: '600', letterSpacing: 0.3 },
  // Ярлык поверх плитки — заливка акцентом, прямые углы
  cardPrice: { position: 'absolute', top: 14, right: 14, backgroundColor: C.lime,
    paddingVertical: 5, paddingHorizontal: 7 },
  cardPriceT: { color: C.onLime, fontFamily: DISP, fontSize: 11, letterSpacing: -0.2,
    fontVariant: ['tabular-nums'] },

  tourn: { marginHorizontal: S.xl, height: 188, overflow: 'hidden',
    justifyContent: 'flex-end', backgroundColor: C.surface },
  tournIn: { padding: 15 },
  tournN: { ...TITLE.card, color: C.text, textTransform: 'uppercase' },
  tournS: { fontFamily: BODY, color: '#CBD5C2', fontSize: 13, marginTop: 3, fontWeight: '600' },

  // Без рамки: только волосяные линии между строками. Меньше «коробочности».
  info: { marginHorizontal: S.xl, backgroundColor: C.surface, paddingHorizontal: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  infoK: { fontFamily: BODY, color: C.dim2, fontSize: 13, flex: 1, letterSpacing: 1.2, textTransform: 'uppercase' },
  infoV: { fontFamily: BODY, color: C.text, fontSize: 15, fontWeight: '600', textAlign: 'right', flexShrink: 1 },

  foot: { fontFamily: BODY, color: C.dim2, fontSize: 11, lineHeight: 17, textAlign: 'center',
    marginTop: 22, paddingHorizontal: 30 },
});
