// Главная — витрина клуба. Открывается большим приветственным блоком во всю ширину,
// как первый экран сайта: фотография, обращение и кнопка действия прямо на ней.
// Сетка часов живёт отдельно, на /schedule.
import { ScrollView, Text, View, Pressable, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED } from '../../src/theme';
import {
  CLUB, VISIBLE_COURTS, TOURNAMENTS, slotsFor, nextFree, priceAt, fmt, hh,
} from '../../src/data';
import { IMG, HERO, TOURN_IMG } from '../../src/images';
import { Mark, IconChevron, IconCheck } from '../../src/components/icons';
import { useBookings, useEntries } from '../../src/store';

const NOW = 18;   // ЗАГЛУШКА: «текущий час»

/** Русские окончания: 1 час, 2 часа, 5 часов. */
function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bookings = useBookings();
  const entries = useEntries();

  const freeHours = VISIBLE_COURTS.reduce(
    (n, c) => n + slotsFor(c.id, NOW).filter(s => s.status === 'free').length, 0);
  const freeNow = VISIBLE_COURTS.filter(
    c => slotsFor(c.id, NOW).find(s => s.hour === NOW)?.status === 'free').length;
  const soonest = VISIBLE_COURTS
    .map(c => nextFree(c.id, NOW))
    .filter((h): h is number => h != null)
    .sort((a, b) => a - b)[0] ?? null;

  const tourn = TOURNAMENTS.find(t => t.state === 'open');
  const active = bookings.filter(b => b.status !== 'cancelled');
  const heroH = Math.max(430, Math.min(height * 0.62, 560));

  const go = (path: string, params?: Record<string, string>) => {
    Haptics.selectionAsync();
    router.push(params ? { pathname: path as never, params } : (path as never));
  };

  return (
    <ScrollView style={st.root} contentContainerStyle={{ paddingBottom: 34 }}
      showsVerticalScrollIndicator={false}>

      {/* Приветственный блок во всю ширину */}
      <View style={[st.hero, { height: heroH }]}>
        <Image source={HERO} style={st.heroImg} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(9,13,10,.78)', 'rgba(9,13,10,.30)', 'rgba(9,13,10,.80)', 'rgba(9,13,10,.97)']}
          locations={[0, 0.34, 0.72, 1]} style={st.heroScrim} />

        <View style={[st.brandRow, { paddingTop: insets.top + 10 }]}>
          <Mark size={26} />
          <Text style={st.brand}>{CLUB.name}</Text>
          <Text style={st.date}>Вт, 2 сен</Text>
        </View>

        <View style={st.heroIn}>
          <Text style={st.eyebrow}>ДОБРО ПОЖАЛОВАТЬ</Text>
          <Text style={st.title} allowFontScaling maxFontSizeMultiplier={1.15}>
            ПРИХОДИТЕ{'\n'}ИГРАТЬ
          </Text>
          <Text style={st.lede}>
            Шесть кортов и мини-футбольное поле в Магасе.
            Открыты с {hh(CLUB.openHour)} до полуночи.
          </Text>

          <Pressable onPress={() => go('/schedule')} accessibilityRole="button"
            style={({ pressed }) => [st.cta, pressed && { opacity: 0.9, transform: [{ scale: 0.995 }] }]}>
            <Text style={st.ctaT}>Записаться</Text>
          </Pressable>

          <View style={st.live}>
            <View style={st.liveDot} />
            <Text style={st.liveT}>
              {soonest != null
                ? `Сейчас свободно ${freeNow} из ${VISIBLE_COURTS.length} · ближайшее в ${hh(soonest)}`
                : 'На сегодня всё занято — посмотрите другие дни'}
            </Text>
          </View>
        </View>
      </View>

      {/* Сколько всего осталось сегодня */}
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

      {/* Активные записи важнее витрины */}
      {(active.length > 0 || entries.length > 0) && (
        <Pressable onPress={() => go('/bookings')}
          style={({ pressed }) => [st.mine, pressed && { opacity: 0.8 }]}>
          <View style={st.mineIcon}><IconCheck size={14} color={C.onLime} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.mineT}>
              {active.length > 0
                ? `${active[0].courtName}, ${hh(active[0].hour)} – ${hh(active[0].hour + active[0].hours)}`
                : 'Вы записаны на турнир'}
            </Text>
            <Text style={st.mineS}>
              {active.length + entries.length > 1
                ? `и ещё ${active.length + entries.length - 1}`
                : active.length > 0
                  ? (active[0].status === 'confirmed' ? 'подтверждено' : 'ждёт подтверждения')
                  : 'смотреть в моих записях'}
            </Text>
          </View>
          <IconChevron size={15} color={C.dim2} />
        </Pressable>
      )}

      {/* Площадки */}
      <View style={st.secHead}>
        <Text style={st.secT}>Площадки</Text>
        <Text style={st.secS}>{VISIBLE_COURTS.length} штук</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.strip}>
        {VISIBLE_COURTS.map(c => {
          const free = nextFree(c.id, NOW);
          return (
            <Pressable key={c.id} onPress={() => go('/court', { id: c.id, hour: String(free ?? NOW) })}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}, ${free != null ? 'ближайшее время ' + hh(free) : 'сегодня занят'}`}
              style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]}>
              <Image source={IMG[c.id]} style={st.cardImg} resizeMode="cover" />
              <LinearGradient colors={['rgba(9,13,10,0)', 'rgba(9,13,10,.9)']}
                locations={[0.35, 1]} style={st.fill} />
              <View style={st.cardIn}>
                <Text style={st.cardN}>{c.name}</Text>
                <Text style={st.cardS}>
                  {free != null ? `свободно с ${hh(free)}` : 'сегодня занят'}
                </Text>
              </View>
              <View style={st.cardPrice}>
                <Text style={st.cardPriceT}>{fmt(priceAt(c, NOW))}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Турнир */}
      {tourn && (
        <>
          <View style={st.secHead}>
            <Text style={st.secT}>Ближайший турнир</Text>
            <Pressable onPress={() => go('/tournaments')} accessibilityRole="button"
              style={({ pressed }) => [st.secLinkHit, pressed && { opacity: 0.7 }]}>
              <Text style={st.secLink}>все турниры</Text>
            </Pressable>
          </View>
          <Pressable onPress={() => go('/tournament', { id: tourn.id })}
            style={({ pressed }) => [st.tourn, pressed && { opacity: 0.88 }]}>
            <Image source={TOURN_IMG[tourn.cover]} style={st.cardImg} resizeMode="cover" />
            <LinearGradient colors={['rgba(9,13,10,.15)', 'rgba(9,13,10,.9)']}
              locations={[0.3, 1]} style={st.fill} />
            <View style={st.tournIn}>
              <Text style={st.tournN}>{tourn.name}</Text>
              <Text style={st.tournS}>
                {tourn.date}, {tourn.time} · осталось {tourn.total - tourn.taken} мест
              </Text>
            </View>
          </Pressable>
        </>
      )}

      {/* Клуб */}
      <View style={st.secHead}><Text style={st.secT}>Клуб</Text></View>
      <View style={st.info}>
        <InfoRow k="Работаем" v={`с ${hh(CLUB.openHour)} до полуночи`} />
        <InfoRow k="Аренда" v="ровно час, можно два и три подряд" />
        <InfoRow k="Оплата" v="на месте, в клубе" />
        <InfoRow k="Отмена" v={`бесплатно за ${CLUB.cancelHours} часа`} last />
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
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },

  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: S.xl },
  brand: { color: C.text, fontFamily: DISP, fontSize: 17, letterSpacing: 1, flex: 1 },
  date: { color: '#C3CDBB', fontSize: 13, fontWeight: '600' },

  heroIn: { paddingHorizontal: S.xl, paddingBottom: 24 },
  eyebrow: { color: C.lime, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 2.2, marginBottom: 8 },
  // Плакатная типографика: узкий гротеск, плотная выключка, буквы почти вплотную
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
  bandBig: { color: C.lime, fontFamily: DISP, fontSize: 34, fontVariant: ['tabular-nums'],
    letterSpacing: 0 },
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
