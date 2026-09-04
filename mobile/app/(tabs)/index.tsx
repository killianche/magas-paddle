// Главная — витрина клуба на живых данных. Показывает, есть ли сегодня место,
// и уводит в выбор времени одной большой кнопкой.
import { useCallback } from 'react';
import {
  ScrollView, Text, View, Pressable, StyleSheet, Image,
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
import {
  today, hh, plural, dayMonth, weekdayShort, dateOfIso, hourOfIso,
} from '../../src/dates';

const CLUB_NAME = 'Magas Padel';
const CLUB_CITY = 'Магас';

export default function Home() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { profile } = useProfile();
  const phone = profile?.phone;

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
  const heroH = Math.max(430, Math.min(height * 0.62, 560));

  const freeHours = grid.courts.reduce(
    (n, c) => n + c.hours.filter(h => h.status === 'free').length, 0);
  const soonest = grid.courts
    .map(c => c.hours.find(h => h.status === 'free')?.hour)
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b)[0] ?? null;
  const freeNow = soonest == null ? 0
    : grid.courts.filter(c => c.hours.find(h => h.hour === soonest)?.status === 'free').length;

  const tourn = tournaments.find(t => t.state === 'open') ?? tournaments.find(t => t.state === 'soon');
  const mine = bookings.filter(b => b.status !== 'cancelled');
  const entered = tournaments.filter(t => t.entered);

  const go = (path: string, params?: Record<string, string>) => {
    Haptics.selectionAsync();
    router.push(params ? { pathname: path as never, params } : (path as never));
  };

  return (
    <ScrollView style={st.root} contentContainerStyle={{ paddingBottom: 34 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={C.dim} />}>

      <View style={[st.hero, { height: heroH }]}>
        <Image source={HERO} style={st.heroImg} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(9,13,10,.78)', 'rgba(9,13,10,.30)', 'rgba(9,13,10,.80)', 'rgba(9,13,10,.97)']}
          locations={[0, 0.34, 0.72, 1]} style={st.fill} />

        <View style={[st.brandRow, { paddingTop: insets.top + 10 }]}>
          <Mark size={26} />
          <Text style={st.brand}>{CLUB_NAME}</Text>
          <Text style={st.date}>{weekdayShort(today())}, {dayMonth(today()).slice(0, 6)}</Text>
        </View>

        <View style={st.heroIn}>
          <Text style={st.eyebrow}>ДОБРО ПОЖАЛОВАТЬ</Text>
          <Text style={st.title} allowFontScaling maxFontSizeMultiplier={1.15}>
            ПРИХОДИТЕ{'\n'}ИГРАТЬ
          </Text>
          <Text style={st.lede}>
            Шесть кортов и мини-футбольное поле в {CLUB_CITY}е.
            Открыты с {hh(grid.openHour)} до полуночи.
          </Text>

          <Pressable onPress={() => go('/schedule')} accessibilityRole="button"
            style={({ pressed }) => [st.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] }]}>
            <Text style={st.ctaT}>Записаться</Text>
          </Pressable>

          <View style={st.live}>
            <View style={st.liveDot} />
            <Text style={st.liveT}>
              {soonest != null
                ? `Сейчас свободно ${freeNow} из ${grid.courts.length} · ближайшее в ${hh(soonest)}`
                : 'На сегодня всё занято — посмотрите другие дни'}
            </Text>
          </View>
        </View>
      </View>

      <Pressable onPress={() => go('/schedule')}
        style={({ pressed }) => [st.bandWrap, pressed && { opacity: 0.85 }]}>
        <View style={st.band}>
          <Text style={st.bandBig}>{freeHours}</Text>
          <View style={{ flex: 1 }}>
            <Text style={st.bandT}>
              {plural(freeHours, 'свободный час', 'свободных часа', 'свободных часов')} сегодня
            </Text>
            <Text style={st.bandS}>смотреть свободные слоты</Text>
          </View>
          <IconChevron size={16} color={C.dim} />
        </View>
      </Pressable>

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

      <View style={st.secHead}>
        <Text style={st.secT}>Площадки</Text>
        <Text style={st.secS}>{grid.courts.length} штук</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.strip}>
        {grid.courts.map(c => {
          const free = c.hours.find(h => h.status === 'free');
          const price = c.hours.find(h => h.hour === (free?.hour ?? grid.eveningFrom))?.price ?? 0;
          return (
            <Pressable key={c.courtId}
              onPress={() => go('/court', { id: c.courtId, date: today(), hour: String(free?.hour ?? grid.openHour) })}
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
      <View style={st.info}>
        <InfoRow k="Работаем" v={`с ${hh(grid.openHour)} до полуночи`} />
        <InfoRow k="Аренда" v="ровно час, можно два и три подряд" />
        <InfoRow k="Оплата" v="на месте, в клубе" />
        <InfoRow k="Отмена" v="бесплатно за 4 часа" last />
      </View>

      <Text style={st.foot}>
        Данные в приложении пока учебные. Настоящие цены, часы и фотографии — от клуба.
      </Text>
    </ScrollView>
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
  hero: { justifyContent: 'space-between', overflow: 'hidden',
    borderBottomLeftRadius: 30, borderBottomRightRadius: 30, backgroundColor: C.surface },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.xl },
  brand: { color: C.text, fontFamily: DISP, fontSize: 17, letterSpacing: 1, flex: 1 },
  date: { color: '#C3CDBB', fontSize: 13, fontWeight: '600' },
  heroIn: { paddingHorizontal: S.xl, paddingBottom: 24 },
  eyebrow: { color: C.lime, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 2.2, marginBottom: 8 },
  title: { color: C.text, fontFamily: DISP, fontSize: 62, lineHeight: 60,
    letterSpacing: -0.5, textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 16 },
  lede: { color: '#CBD5C2', fontSize: 14, lineHeight: 20, marginTop: 10,
    textShadowColor: 'rgba(0,0,0,.55)', textShadowRadius: 8 },
  cta: { backgroundColor: C.lime, borderRadius: R.xl, paddingVertical: 18,
    alignItems: 'center', marginTop: 20, minHeight: HIT },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 20, letterSpacing: 0.8 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14, justifyContent: 'center' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime },
  liveT: { color: '#C3CDBB', fontSize: 12.5, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 6 },

  bandWrap: { paddingHorizontal: S.xl, marginTop: 18 },
  band: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 15,
    borderRadius: R.xl, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, minHeight: 74 },
  bandBig: { color: C.lime, fontFamily: DISP, fontSize: 34, fontVariant: ['tabular-nums'] },
  bandT: { color: C.text, fontSize: 15, fontWeight: '700' },
  bandS: { color: C.dim2, fontSize: 12.5, marginTop: 2 },

  mine: { flexDirection: 'row', alignItems: 'center', gap: 11, marginHorizontal: S.xl, marginTop: 10,
    padding: 12, borderRadius: R.lg, borderWidth: 1, borderColor: 'rgba(198,240,51,.28)',
    backgroundColor: 'rgba(198,240,51,.06)', minHeight: 62 },
  mineIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  mineT: { color: C.text, fontSize: 14.5, fontWeight: '700' },
  mineS: { color: C.dim2, fontSize: 12, marginTop: 1 },

  secHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    paddingHorizontal: S.xl, marginTop: 28, marginBottom: 12 },
  secT: { color: C.text, fontFamily: DISP, fontSize: 21, letterSpacing: 0.6 },
  secS: { color: C.dim2, fontSize: 12.5 },
  secLink: { color: C.lime, fontSize: 13, fontWeight: '600' },
  secLinkHit: { paddingVertical: 12, paddingHorizontal: 10, marginVertical: -12, marginRight: -10,
    minHeight: HIT, justifyContent: 'center' },

  strip: { paddingHorizontal: S.xl, gap: 10 },
  card: { width: 154, height: 190, borderRadius: R.xl, overflow: 'hidden',
    backgroundColor: C.surface, justifyContent: 'flex-end' },
  cardImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  cardIn: { padding: 12 },
  cardN: { color: C.text, fontSize: 15, fontWeight: '700' },
  cardS: { color: C.lime, fontSize: 12, marginTop: 2, fontWeight: '600' },
  cardPrice: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(9,13,10,.72)',
    borderRadius: 8, paddingVertical: 3, paddingHorizontal: 8 },
  cardPriceT: { color: C.text, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },

  tourn: { marginHorizontal: S.xl, height: 148, borderRadius: R.xl, overflow: 'hidden',
    justifyContent: 'flex-end', backgroundColor: C.surface },
  tournIn: { padding: 15 },
  tournN: { color: C.text, fontFamily: DISP, fontSize: 22, letterSpacing: 0.4 },
  tournS: { color: '#CBD5C2', fontSize: 12.5, marginTop: 3, fontWeight: '600' },

  info: { marginHorizontal: S.xl, borderRadius: R.xl, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface, paddingHorizontal: 15 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  infoK: { color: C.dim, fontSize: 14, flex: 1 },
  infoV: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },

  foot: { color: C.dim2, fontSize: 11.5, lineHeight: 17, textAlign: 'center',
    marginTop: 22, paddingHorizontal: 30 },
});
