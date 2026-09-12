// Главная — витрина клуба на живых данных.
//
// Первый экран — только большая фотография клуба и две кнопки записи:
// падел-корт и мини-футбольное поле. Заголовок «Выходи на корт» и приветствие
// заказчик попросил убрать совсем.
import { useCallback, useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Animated, Text, View, Pressable, StyleSheet, Image,
  useWindowDimensions, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, BODY, EYEBROW, TAB_SPACE, sheet, useTheme } from '../../src/theme';
import { Ticker } from '../../src/components/velocity';
import { api, rub, mediaUrl, type ApiBooking } from '../../src/api';
import { useApi } from '../../src/useApi';
import { useProfile, initials } from '../../src/profile';
import { useClub } from '../../src/club';
import { IMG, HERO, HERO_LIGHT, TOURN_IMG } from '../../src/images';
import { Mark, IconChevron, IconCheck, IconBell, IconAccount } from '../../src/components/icons';
import { SocialButtons } from '../../src/components/contacts';
import { ClubBlock } from '../../src/components/clubblock';
import { LookLine } from '../../src/components/courtlook';
import { TopScrim, useTopScrim } from '../../src/components/topscrim';
import { today, hh, plural, dayMonth, dateOfIso, hourOfIso } from '../../src/dates';
import { upcomingGrid } from '../../src/upcoming';

/** Поверх фотографии текст всегда светлый — в любой теме оформления. */
const ON_PHOTO = '#F5F8F2';
const TILE_GAP = 10;

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { profile } = useProfile();
  const club = useClub();
  const phone = profile?.phone;
  const scrim = useTopScrim();
  const mode = useTheme();
  // Часы и заряд над фотографией всегда светлые; в светлой теме, когда
  // фото уехало вверх, — тёмные, иначе их не видно на светлом фоне.
  const [onHero, setOnHero] = useState(true);
  useEffect(() => {
    const id = scrim.scrollY.addListener(({ value }) => setOnHero(value < 60));
    return () => scrim.scrollY.removeListener(id);
  }, []);
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => { setFocused(true); return () => setFocused(false) }, []));

  // Непрочитанные уведомления: отдельным лёгким запросом, чтобы главная не
  // ждала его и рисовалась сразу.
  const notes = useApi(
    () => phone ? api.notifications(phone) : Promise.resolve({ items: [], unread: 0 }),
    [phone], phone ? `notes.${phone}` : undefined);
  const unread = notes.data?.unread ?? 0;

  const q = useApi(async () => {
    const [next, tournaments, bookings, prices] = await Promise.all([
      upcomingGrid(),
      api.tournaments(phone),
      phone ? api.myBookings(phone) : Promise.resolve([] as ApiBooking[]),
      api.prices(),
    ]);
    return { grid: next.grid, tomorrow: next.tomorrow, tournaments, bookings, prices };
  }, [phone], `home.${today()}.${phone ?? 'гость'}`);

  useFocusEffect(useCallback(() => { q.refresh(); notes.refresh() }, [phone]));

  // Экран рисуется сразу, не дожидаясь сети: фотография и кнопки никаких
  // данных не требуют.
  const grid = q.data?.grid ?? null;
  const tournaments = q.data?.tournaments ?? [];
  const bookings = q.data?.bookings ?? [];
  const waiting = !q.data && !q.error;
  // Поздно вечером сегодняшние часы уже прошли — плитки говорят про завтра
  const tomorrow = q.data?.tomorrow ?? false;
  const Day = tomorrow ? 'Завтра' : 'Сегодня';
  const day = tomorrow ? 'завтра' : 'сегодня';
  // Первый экран — одна большая фотография, кнопки внизу неё
  const heroH = Math.max(460, Math.min(height * 0.7, 600));
  const tileW = Math.floor((width - S.xl * 2 - TILE_GAP) / 2);
  // «Мини-футбольное поле» должно стоять в одну строку и на узком телефоне:
  // на 360 pt при кегле 19 оно переносилось
  const ctaSize = width < 340 ? 15 : width < 385 ? 17 : 19;
  // Фото первого экрана: своё из админки, иначе встроенное. В светлой теме —
  // светлый кадр: тёмный снимок на белом фоне выглядит чужеродно.
  const hero = mode === 'light'
    ? (club.heroLightUrl ? { uri: mediaUrl(club.heroLightUrl) } : HERO_LIGHT)
    : (club.heroUrl ? { uri: mediaUrl(club.heroUrl) } : HERO);

  const courts = grid?.courts ?? [];
  const soonest = courts
    .map(c => c.hours.find(h => h.status === 'free')?.hour)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b)[0] ?? null;
  const freeHours = courts.reduce(
    (n, c) => n + c.hours.filter(h => h.status === 'free').length, 0);
  const freeText = waiting ? 'смотрю, что свободно'
    : q.error ? 'нет связи с клубом'
    : soonest == null ? `${Day} всё занято — посмотрите другие дни`
    : `${freeHours} ${plural(freeHours, 'свободный час', 'свободных часа', 'свободных часов')}`
      + ` ${day} · ближайшее в ${hh(soonest)}`;

  const prices = courts.flatMap(c => c.hours.map(h => h.price)).filter(p => p > 0);
  const cheapest = prices.length ? Math.min(...prices) : 0;

  const padel = courts.filter(c => !c.isFootball);
  const pitch = courts.find(c => c.isFootball) ?? null;
  const pitchFree = pitch?.hours.filter(h => h.status === 'free') ?? [];
  const pitchPrice = pitch?.hours.find(h => h.status === 'free')?.price
    ?? pitch?.hours.find(h => h.hour >= (grid?.morningUntil ?? 13))?.price ?? 0;

  // «сегодня» вместо даты: так короче и понятнее
  const mineDay = (() => {
    const b = bookings.filter(x => x.status !== 'cancelled')[0];
    if (!b) return '';
    const d = dateOfIso(b.startsAt);
    return d === today() ? 'сегодня' : dayMonth(d);
  })();
  const tourn = tournaments.find(t => t.state === 'open') ?? tournaments.find(t => t.state === 'soon');
  const mine = bookings.filter(b => b.status !== 'cancelled');
  const entered = tournaments.filter(t => t.entered);

  const go = (path: string, params?: Record<string, string>) => {
    Haptics.selectionAsync();
    router.push(params ? { pathname: path as never, params } : (path as never));
  };

  return (
    <View style={st.root}>
    <Animated.ScrollView style={st.root} contentContainerStyle={{ paddingBottom: TAB_SPACE }}
      showsVerticalScrollIndicator={false}
      onScroll={scrim.onScroll} scrollEventThrottle={scrim.scrollEventThrottle}
      refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

      {/* Большая фотография клуба: сверху марка и кнопки аккаунта, внизу —
          две кнопки записи. Больше на первом экране ничего нет. */}
      <View style={[st.hero, { height: heroH }]}>
        <Image source={hero} style={st.fillImg} resizeMode="cover" />
        {/* Затемнение сверху и снизу: марка и кнопки белые, а фото бывает
            светлым — на нём белое иначе не читается */}
        <LinearGradient
          colors={['rgba(2,7,5,.9)', 'rgba(2,7,5,.35)', 'rgba(2,7,5,0)', 'rgba(2,7,5,.92)']}
          locations={[0, 0.16, 0.45, 1]} style={st.fill} />

        <View style={[st.brandRow, { paddingTop: insets.top + 12 }]}>
          <Mark size={30} />
          {/* Сначала PADEL, под ним MAGAS — так попросил заказчик */}
          <Text style={st.brand} allowFontScaling={false}>PADEL{'\n'}MAGAS</Text>
          <View style={{ flex: 1 }} />
          <Pressable onPress={() => go('/notifications')} accessibilityRole="button"
            accessibilityLabel={unread > 0
              ? `Уведомления, непрочитанных: ${unread}` : 'Уведомления'}
            style={({ pressed }) => [st.circle, { marginRight: 8 },
              pressed && { opacity: 0.7 }]}>
            <IconBell size={18} color={ON_PHOTO} />
            {unread > 0 && <View style={st.badge} />}
          </Pressable>
          <Pressable onPress={() => go('/account')} accessibilityRole="button"
            accessibilityLabel={profile ? `Аккаунт: ${profile.name}` : 'Создать аккаунт'}
            style={({ pressed }) => [st.circle, pressed && { opacity: 0.7 }]}>
            {profile
              ? <Text style={st.circleT} allowFontScaling={false}>{initials(profile)}</Text>
              : <IconAccount size={19} color={ON_PHOTO} />}
          </Pressable>
        </View>

        {/* Две кнопки одного вида: корт — залитая, поле — без цвета */}
        <View style={st.heroActions}>
          <Pressable onPress={() => go('/courts')} accessibilityRole="button"
            accessibilityLabel={`Забронировать падел-корт. ${freeText}`}
            style={({ pressed }) => [st.cta, st.ctaLime, pressed && { opacity: 0.9 }]}>
            <View style={{ flex: 1 }}>
              <Text style={[st.ctaEy, { color: C.onLime, opacity: 0.65 }]}>Забронировать</Text>
              <Text style={[st.ctaT, { fontSize: ctaSize, lineHeight: ctaSize + 3, color:C.onLime }]}>Падел-корт</Text>
            </View>
            <Text style={[st.ctaArrow, { color: C.onLime }]}>→</Text>
          </Pressable>

          {club.showFootball && (
            <Pressable onPress={() => go('/football')} accessibilityRole="button"
              accessibilityLabel="Забронировать мини-футбольное поле"
              style={({ pressed }) => [st.cta, st.ctaGhost, pressed && { opacity: 0.85 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[st.ctaEy, { color: 'rgba(245,248,242,.66)' }]}>Забронировать</Text>
                <Text style={[st.ctaT, { fontSize: ctaSize, lineHeight: ctaSize + 3, color:ON_PHOTO }]}>Мини-футбольное поле</Text>
              </View>
              <Text style={[st.ctaArrow, { color: ON_PHOTO }]}>→</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Ticker items={waiting
        ? ['Magas Padel', 'падел-корты', 'мини-футбольное поле']
        : [
            `${padel.length} ${plural(padel.length, 'корт', 'корта', 'кортов')}`,
            soonest == null ? `${day} всё занято`
              : tomorrow ? `завтра с ${hh(soonest)}` : `ближайшее в ${hh(soonest)}`,
            cheapest ? `от ${rub(cheapest)}` : 'мини-футбольное поле',
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
          <View style={st.mineIcon}><IconCheck size={17} color={C.onLime} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.mineEy}>{mine.length > 0 ? 'Ваша запись' : 'Турнир'}</Text>
            <Text style={st.mineT}>
              {mine.length > 0
                ? `${mine[0].courtName} · ${hh(mine[0].hour)} – ${hh(mine[0].hour + mine[0].hours)}`
                : 'Вы записаны на турнир'}
            </Text>
            <Text style={st.mineS}>
              {mine.length > 0
                ? `${mineDay} · ${mine[0].status === 'confirmed' ? 'подтверждено' : 'ждёт подтверждения'}`
                    + (mine.length + entered.length > 1 ? ` · и ещё ${mine.length + entered.length - 1}` : '')
                : 'смотреть в моих записях'}
            </Text>
          </View>
          <IconChevron size={18} color={C.dim2} />
        </Pressable>
      )}

      <SocialButtons />

      {/* Корты плитками по два в ряд: все шесть видны сразу, без прокрутки
          вбок. Нажатие — страница корта с его временем. */}
      <View style={st.secHead}>
        <Text style={st.secT}>Падел-корты</Text>
        <Pressable onPress={() => go('/courts')} accessibilityRole="button"
          style={({ pressed }) => [st.secLinkHit, pressed && { opacity: 0.7 }]}>
          <Text style={st.secLink}>все корты</Text>
        </Pressable>
      </View>
      <View style={st.tiles}>
        {waiting && [0, 1, 2, 3].map(i => (
          <View key={i} style={[st.tile, st.tileWait, { width: tileW, height: Math.round(tileW * 0.8) + 74 }]} />
        ))}
        {padel.map(c => {
          const live = c.hours.filter(h => h.status !== 'past');
          const free = live.find(h => h.status === 'free');
          const ps = live.map(h => h.price).filter(p => p > 0);
          const from = ps.length ? Math.min(...ps) : 0;
          return (
            <Pressable key={c.courtId}
              onPress={() => go('/court', { id: c.courtId })}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${c.closed ? 'закрыт' : free ? `${day} свободно с ${hh(free.hour)}` : `${day} занят`}`}
              style={({ pressed }) => [st.tile, { width: tileW }, pressed && { opacity: 0.85 }]}>
              <View style={{ height: Math.round(tileW * 0.8) }}>
                <Image source={c.photo ? { uri: mediaUrl(c.photo) } : (IMG[c.courtId] ?? IMG.c1)}
                  style={st.fillImg} resizeMode="cover" />
                <LinearGradient colors={['rgba(2,7,5,0)', 'rgba(2,7,5,.8)']}
                  locations={[0.45, 1]} style={st.fill} />
                <Text style={st.tileN}>{c.name}</Text>
                {c.color && <View style={[st.tileBar, { backgroundColor: c.color.hex }]} />}
              </View>
              <View style={st.tileBody}>
                <Text style={[st.tileS, (!free || c.closed) && { color: C.dim2 }]} numberOfLines={1}>
                  {c.closed ? 'Закрыт'
                    : free ? `${tomorrow ? 'Завтра' : 'Свободно'} с ${hh(free.hour)}`
                    : `${Day} занят`}
                </Text>
                {from > 0 && !c.closed && <Text style={st.tileP}>{rub(from)}</Text>}
                <LookLine color={c.color} tags={c.tags} />
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* Мини-футбольное поле — отдельным плакатом со своей записью.
          Клуб может выключить его в админке. */}
      {pitch && club.showFootball && (
        <>
          <View style={st.secHead}>
            <Text style={st.secT}>Мини-футбольное поле</Text>
          </View>
          <Pressable
            onPress={() => go('/football')}
            accessibilityRole="button"
            accessibilityLabel={'Мини-футбольное поле. ' + (pitchFree.length > 0
              ? `свободно ${pitchFree.length} ${plural(pitchFree.length, 'час', 'часа', 'часов')} ${day}`
              : `${day} занято`) + '. Забронировать'}
            style={({ pressed }) => [st.pitch, pressed && { opacity: 0.9 }]}>
            <Image source={pitch.photo ? { uri: mediaUrl(pitch.photo) } : (IMG[pitch.courtId] ?? IMG.f1)} style={st.fillImg} resizeMode="cover" />
            <LinearGradient colors={['rgba(9,13,10,.25)', 'rgba(9,13,10,.55)', 'rgba(9,13,10,.95)']}
              locations={[0, 0.5, 1]} style={st.fill} />
            <View style={st.pitchIn}>
              <Text style={st.pitchEyebrow}>Поле целиком</Text>
              <Text style={st.pitchS}>
                {pitch.closed ? 'Закрыто на ремонт'
                  : pitchFree.length > 0
                    ? `Свободно ${pitchFree.length} ${plural(pitchFree.length, 'час', 'часа', 'часов')} ${day}`
                    : `${Day} занято — посмотрите другие дни`}
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
              style={st.fillImg} resizeMode="cover" />
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
      <ClubBlock prices={q.data?.prices ?? null} maxHours={grid?.maxHours ?? 3} />

      {/* Пропадает сама, когда клуб загрузит фото всех площадок */}
      {courts.some(c => !c.photo) && (
        <Text style={st.foot}>
          Фотографии кортов пока временные — клуб заменит их своими.
        </Text>
      )}
    </Animated.ScrollView>
    <TopScrim scrollY={scrim.scrollY} />
    {focused && <StatusBar style={onHero || mode === 'dark' ? 'light' : 'dark'} />}
    </View>
  );
}

const st = sheet(() => ({
  root: { flex: 1, backgroundColor: C.ink },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Для картинок мало одних краёв: без ширины и высоты React Native Web
  // растягивает их до собственного размера, и виден лишь угол снимка.
  fillImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%' },
  hero: { overflow: 'hidden', backgroundColor: '#0A1D14', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.xl },
  // Марка в две строки: PADEL / MAGAS
  brand: { color: ON_PHOTO, fontFamily: DISP, fontSize: 15, lineHeight: 15,
    letterSpacing: -0.6 },
  badge: { position: 'absolute', top: 7, right: 8, width: 9, height: 9, borderRadius: 5,
    backgroundColor: '#C9F23D', borderWidth: 1.5, borderColor: '#020705' },
  circle: { width: 38, height: 38, borderRadius: 19, borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,.3)', backgroundColor: 'rgba(2,7,5,.65)',
    alignItems: 'center', justifyContent: 'center' },
  circleT: { fontFamily: DISP, color: ON_PHOTO, fontSize: 13, letterSpacing: -0.2 },

  heroActions: { paddingHorizontal: S.xl, paddingBottom: 22, gap: 10 },
  // Кнопки записи: над крупной надписью — мелкое «Забронировать». Так длинное
  // «Мини-футбольное поле» помещается в одну строку и на узком телефоне.
  cta: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66,
    paddingVertical: 12, paddingHorizontal: 18, borderWidth: 1 },
  ctaLime: { backgroundColor: C.lime, borderColor: C.lime },
  ctaGhost: { backgroundColor: 'rgba(2,7,5,0.45)', borderColor: 'rgba(255,255,255,0.5)' },
  ctaEy: { ...EYEBROW },
  ctaT: { fontFamily: DISP, fontSize: 19, lineHeight: 22, letterSpacing: -0.5,
    textTransform: 'uppercase', marginTop: 3 },
  ctaArrow: { fontFamily: DISP, fontSize: 22 },

  mine: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: S.xl,
    marginTop: 16, padding: 16, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.line, borderLeftWidth: 4, borderLeftColor: C.lime },
  mineIcon: { width: 36, height: 36, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  mineEy: { ...EYEBROW, color: C.accent, fontSize: 10.5, letterSpacing: 1.4 },
  mineT: { color: C.text, fontFamily: DISP, fontSize: 17, letterSpacing: -0.4, marginTop: 4 },
  mineS: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, marginTop: 3 },

  // Плитки кортов
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: TILE_GAP, paddingHorizontal: S.xl },
  tile: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  tileWait: { opacity: 0.6 },
  tileN: { position: 'absolute', left: 10, bottom: 10, right: 10, color: ON_PHOTO,
    fontFamily: DISP, fontSize: 17, letterSpacing: -0.5, textTransform: 'uppercase' },
  tileBar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  tileBody: { paddingHorizontal: 11, paddingVertical: 11, gap: 4, minHeight: 74 },
  tileS: { fontFamily: BODY, color: C.limeDim, fontSize: 12, fontWeight: '600' },
  tileP: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.4,
    fontVariant: ['tabular-nums'] },

  pitch: { marginHorizontal: S.xl, height: 252, overflow: 'hidden',
    backgroundColor: '#0A1D14', justifyContent: 'flex-end' },
  pitchIn: { padding: 18 },
  pitchEyebrow: { ...EYEBROW, color: '#C9F23D' },
  pitchS: { fontFamily: BODY, color: '#D0D9D2', fontSize: 14, marginTop: 7 },
  pitchRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  pitchPrice: { color: ON_PHOTO, fontFamily: DISP, fontSize: 24, letterSpacing: -0.6,
    fontVariant: ['tabular-nums'] },
  pitchUnit: { fontFamily: BODY, color: '#A5B0A8', fontSize: 11 },
  pitchCta: { flexDirection: 'row', alignItems: 'center', gap: 7, marginLeft: 'auto',
    backgroundColor: C.lime, paddingVertical: 13, paddingHorizontal: 15 },
  pitchCtaT: { color: C.onLime, fontFamily: DISP, fontSize: 12, letterSpacing: 0.6,
    textTransform: 'uppercase' },

  offline: { marginHorizontal: S.xl, marginTop: 14, padding: 14, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.warnBorder, backgroundColor: C.warnSoft },
  offlineT: { fontFamily: BODY, color: C.amber, fontSize: 13, fontWeight: '700', letterSpacing: 1.2,
    textTransform: 'uppercase' },
  offlineS: { fontFamily: BODY, color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 5 },

  secHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: S.xl, marginTop: 36, marginBottom: 14 },
  secT: { fontFamily: BODY, color: C.text, fontSize: 13, fontWeight: '700', letterSpacing: 2.6,
    textTransform: 'uppercase' },
  secLink: { fontFamily: BODY, color: C.limeDim, fontSize: 13, fontWeight: '600', letterSpacing: 0.8,
    textTransform: 'uppercase' },
  secLinkHit: { paddingVertical: 12, paddingHorizontal: 10, marginVertical: -12, marginRight: -10,
    minHeight: HIT, justifyContent: 'center' },

  tourn: { marginHorizontal: S.xl, height: 188, overflow: 'hidden',
    justifyContent: 'flex-end', backgroundColor: '#0A1D14' },
  tournIn: { padding: 15 },
  tournN: { ...TITLE.card, color: ON_PHOTO, textTransform: 'uppercase' },
  tournS: { fontFamily: BODY, color: '#CBD5C2', fontSize: 13, marginTop: 3, fontWeight: '600' },

  foot: { fontFamily: BODY, color: C.dim2, fontSize: 11, lineHeight: 17, textAlign: 'center',
    marginTop: 22, paddingHorizontal: 30 },
}));
