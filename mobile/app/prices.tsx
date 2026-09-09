// Прайс-лист. Цены берутся с сервера, а не вписаны в экран: клуб меняет их
// в базе, приложение подхватывает без пересборки.
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY } from '../src/theme';
import { api, rub, discountPercent } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { IconChevron } from '../src/components/icons';
import { hh, plural } from '../src/dates';
import { useHydrated } from '../src/hydrated';


export default function Prices() {
  const hydrated = useHydrated();
  const q = useApi(() => api.prices(), [], 'prices');

  if (!hydrated || q.loading) return <Loading note="Смотрю цены" />;
  if (q.error || !q.data) return <Failed message={q.error ?? 'Пустой ответ'} onRetry={q.reload} />;

  const { courts, rules, openHour, morningUntil, closeHour, cancelHours } = q.data;
  const padel = courts.find(c => !c.isFootball);
  const football = courts.find(c => c.isFootball);

  // Сетка сама открывается на сегодня; отдельный параметр часа ей не нужен.
  const go = () => { Haptics.selectionAsync(); router.push('/schedule') };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }}
      contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
      <Stack.Screen options={{ title: 'Цены' }} />

      <View style={s.head}>
        <View style={s.eyebrowRow}>
          <View style={s.slash} />
          <Text style={s.eyebrow}>ЦЕНЫ</Text>
        </View>
        <Text style={s.h1} allowFontScaling={false}>ПРАЙС-ЛИСТ</Text>
        <Text style={s.lede}>Аренда корта целиком, на любое число игроков. Оплата на месте.</Text>
      </View>

      <Pressable onPress={go} accessibilityRole="button"
        style={({ pressed }) => [s.cta, pressed && { opacity: 0.9 }]}>
        <Text style={s.ctaT}>Забронировать корт</Text>
        <IconChevron size={19} color={C.onLime} />
      </Pressable>

      {padel && (() => {
        const open = openHour;
        const until = morningUntil;
        const morningHours = Math.max(0, until - open);
        const dayHours = Math.max(1, closeHour - open);
        const off = discountPercent(padel.priceMorning, padel.priceStandard);
        return (
          <>
            <Text style={s.group}>Падел-корт, за час</Text>

            <Band
              from={open} to={until} price={padel.priceMorning}
              share={morningHours / dayHours} badge={off > 0 ? `−${off}%` : undefined}
              note={`Дешевле обычного на ${off}% — утро свободнее`}
              onBook={go} best />

            <Band
              from={until} to={closeHour} price={padel.priceStandard}
              share={(dayHours - morningHours) / dayHours}
              note="Основная цена: день и вечер"
              onBook={go} />

            <Text style={s.small}>
              Час считается по своему тарифу. Игра с {hh(until - 1)} на два часа —
              {' '}{rub(padel.priceMorning)} за первый час и {rub(padel.priceStandard)} за второй,
              всего {rub(padel.priceMorning + padel.priceStandard)}.
            </Text>
          </>
        );
      })()}

      {/* Особые цены: без них прайс-лист врал бы, как только клуб поднимет
          цену на выходные — в сетке человек увидел бы другую сумму. */}
      {rules.length > 0 && (
        <>
          <Text style={s.group}>Особые цены</Text>
          {rules.map(r => (
            <View key={r.id} style={[s.band, s.bandAlt]}>
              <View style={s.bandTop}>
                <View style={{ flex: 1 }}>
                  <Text style={s.bandTime}>{daysText(r.days)}, {hh(r.fromHour)} – {hh(r.toHour)}</Text>
                  <Text style={s.bandHours}>
                    {r.courtId ? (courts.find(c => c.id === r.courtId)?.name ?? r.courtId)
                               : 'все площадки'}{r.note ? ` · ${r.note}` : ''}
                  </Text>
                  <Text style={[s.price, { color: C.amber, marginTop: 8 }]} allowFontScaling={false}>
                    {rub(r.price)}
                  </Text>
                </View>
              </View>
            </View>
          ))}
          <Text style={s.small}>
            В эти дни и часы действует цена отсюда, а не обычная.
          </Text>
        </>
      )}

      {football && (
        <>
          <Text style={s.group}>Футбольное поле</Text>
          <View style={[s.band, { paddingBottom: 18 }]}>
            <Text style={s.bandTime}>Поле целиком, за час</Text>
            <Text style={s.bandHours}>С {hh(openHour)} до {hh(closeHour)}, цена одна весь день</Text>
            <Text style={[s.price, { marginTop: 8 }]} allowFontScaling={false}>
              {rub(football.priceStandard)}
            </Text>
          </View>
        </>
      )}

      <Text style={s.foot}>
        Цены показаны за аренду площадки целиком.
        Отмена бесплатна за {cancelHours} {plural(cancelHours, 'час', 'часа', 'часов')} до игры.
      </Text>
    </ScrollView>
  );
}

const DAYS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Дни недели человеческим языком: «выходные» вместо «Сб, Вс». */
function daysText(d: number[] | null): string {
  if (!d || d.length === 0 || d.length === 7) return 'Каждый день';
  const k = [...d].sort().join(',');
  if (k === '6,7') return 'Выходные';
  if (k === '1,2,3,4,5') return 'Будни';
  return [...d].sort().map(x => DAYS[x]).join(', ');
}

/** Один тариф: время, цена, доля дня кружком и кнопка «занять». */
function Band({ from, to, price, share, badge, note, onBook, best }: {
  from: number; to: number; price: number; share: number;
  badge?: string; note: string; onBook: () => void; best?: boolean;
}) {
  const hours = to - from;
  return (
    <View style={[s.band, best && s.bandBest]}>
      <View style={s.bandTop}>
        <View style={{ flex: 1 }}>
          <Text style={s.bandTime}>С {hh(from)} до {hh(to)}</Text>
          <Text style={s.bandHours}>
            {hours} {plural(hours, 'час', 'часа', 'часов')} в сутках
          </Text>
          <View style={s.priceRow}>
            <Text style={[s.price, best && { color: C.lime }]} allowFontScaling={false}>
              {rub(price)}
            </Text>
            {!!badge && <View style={s.badge}><Text style={s.badgeT}>{badge}</Text></View>}
          </View>
        </View>
        <Donut share={share} accent={!!best} />
      </View>
      <Text style={s.bandNote}>{note}</Text>
      <Pressable onPress={onBook} accessibilityRole="button"
        accessibilityLabel={`Забронировать время с ${hh(from)} до ${hh(to)}`}
        style={({ pressed }) => [s.book, pressed && { opacity: 0.85 }]}>
        <Text style={s.bookT}>Забронировать это время</Text>
        <IconChevron size={16} color={C.text} />
      </Pressable>
    </View>
  );
}

/** Кружок: какую часть рабочего дня занимает тариф. */
function Donut({ share, accent }: { share: number; accent: boolean }) {
  const size = 62, r = 25, cx = size / 2;
  const len = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cx} r={r} stroke={C.line} strokeWidth={10} fill="none" />
      <Circle cx={cx} cy={cx} r={r} stroke={accent ? C.lime : C.greenMid} strokeWidth={10}
        fill="none" strokeDasharray={`${len * share} ${len}`}
        strokeLinecap="butt" transform={`rotate(-90 ${cx} ${cx})`} />
    </Svg>
  );
}

const s = StyleSheet.create({
  head: { paddingHorizontal: S.xl, paddingTop: 14 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  slash: { width: 22, height: 9, backgroundColor: C.lime,
    transform: [{ skewX: '-20deg' }], borderRadius: 0 },
  eyebrow: { ...EYEBROW, color: C.dim2 },
  h1: { ...TITLE.page, color: C.text, marginTop: 8 },
  lede: { fontFamily: BODY, color: C.dim, fontSize: 15, lineHeight: 21, marginTop: 10 },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: C.lime, borderRadius: R.xl, marginHorizontal: S.xl, marginTop: 18,
    paddingVertical: 16, minHeight: HIT },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },

  group: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 28, marginBottom: 10 },

  band: { marginHorizontal: S.xl, marginBottom: 10, padding: 16, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  bandBest: { borderColor: 'rgba(198,240,51,.42)', backgroundColor: 'rgba(198,240,51,.05)' },
  bandAlt: { borderColor: 'rgba(240,169,59,.4)', backgroundColor: 'rgba(240,169,59,.06)' },
  bandTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bandTime: { ...TITLE.section, color: C.text, textTransform: 'uppercase' },
  bandHours: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginTop: 8 },
  price: { color: C.text, fontFamily: DISP, fontSize: 40, lineHeight: 42,
    letterSpacing: -2, fontVariant: ['tabular-nums'] },
  badge: { backgroundColor: C.lime, borderRadius: 0, paddingHorizontal: 8, paddingVertical: 3 },
  badgeT: { color: C.onLime, fontFamily: DISP, fontSize: 12, letterSpacing: -0.2 },
  bandNote: { fontFamily: BODY, color: C.dim, fontSize: 13, marginTop: 10, lineHeight: 18 },
  soon: { ...TITLE.card, color: C.dim, marginTop: 8 },

  book: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    marginTop: 13, paddingVertical: 12, borderRadius: R.lg, minHeight: 46,
    backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  bookT: { color: C.text, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase' },

  small: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 18, marginHorizontal: S.xl, marginTop: 6 },
  foot: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 18, marginHorizontal: S.xl, marginTop: 24 },
});
