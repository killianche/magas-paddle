// Блок «Клуб» внизу главной: цены целиком, ракетки и мячи, где мы, правила.
//
// Заказчик просил сделать эту часть «очень качественной и мощной» и держать
// все цены прямо на главной: отдельной страницы с ценами нет, перехода
// никуда нет. Поэтому здесь весь прайс-лист — тарифы корта, поле, особые
// цены — и отдельным блоком прокат ракеток и мячей.
// Все числа берутся из админки, ничего не вписано в код.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C, S, DISP, DISP_MED, BODY, EYEBROW, sheet } from '../theme';
import { rub, type ApiPrices } from '../api';
import { CLUB, pointText, useClub } from '../club';
import { hh } from '../dates';
import { openLink } from './contacts';
import { RentalsList, useRentals } from './extras';

const DAYS = ['', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Дни недели человеческим языком: «выходные» вместо «Сб, Вс». */
function daysText(d: number[] | null): string {
  if (!d || d.length === 0 || d.length === 7) return 'Каждый день';
  const k = [...d].sort().join(',');
  if (k === '6,7') return 'Выходные';
  if (k === '1,2,3,4,5') return 'Будни';
  return [...d].sort().map(x => DAYS[x]).join(', ');
}

export function ClubBlock({ prices, maxHours }: { prices: ApiPrices | null; maxHours: number }) {
  const club = useClub();
  const rentals = useRentals();
  const padel = prices?.courts.filter(c => !c.isFootball) ?? [];
  const pitch = prices?.courts.find(c => c.isFootball);
  const name = new Map((prices?.courts ?? []).map(c => [c.id, c.name]));
  // У кортов могут быть разные цены — тогда показываем самую низкую с «от»
  const morning = padel.length ? Math.min(...padel.map(c => c.priceMorning)) : 0;
  const standard = padel.length ? Math.min(...padel.map(c => c.priceStandard)) : 0;
  const varies = padel.some(c => c.priceMorning !== padel[0].priceMorning
    || c.priceStandard !== padel[0].priceStandard);
  const from = varies ? 'от ' : '';
  const cheapest = Math.min(morning, standard);
  const until = prices?.morningUntil ?? 0;
  const pitchPrice = pitch ? Math.min(pitch.priceMorning, pitch.priceStandard) : 0;
  const rules = prices?.rules ?? [];

  const two = (n: number) => String(n).padStart(2, '0');

  return (
    <View style={s.wrap}>
      {/* Цена — крупно, как на афише. Ниже все тарифы: больше их смотреть негде. */}
      <View style={s.price}>
        <View style={s.priceHead}>
          <Text style={s.eyebrow}>Прайс-лист</Text>
          <Text style={s.eyebrowDim}>падел-корт · час</Text>
        </View>
        <Text style={s.big} allowFontScaling={false}>
          {prices ? `${varies || morning !== standard ? 'от ' : ''}${rub(cheapest)}` : '—'}
        </Text>

        {!!prices && (
          <View style={s.rows}>
            {morning !== standard ? (
              <>
                <PriceRow k={`Утро · до ${hh(until)}`} v={`${from}${rub(morning)}`} accent />
                <PriceRow k={`День и вечер · с ${hh(until)}`} v={`${from}${rub(standard)}`} />
              </>
            ) : (
              <PriceRow k="Весь день" v={`${from}${rub(standard)}`} accent />
            )}
            {!!pitch && <PriceRow k="Мини-футбольное поле" v={rub(pitchPrice)} />}
            {rules.map(r => (
              <PriceRow key={r.id}
                k={`${daysText(r.days)} · ${hh(r.fromHour)}–${hh(r.toHour)}`
                  + (r.courtId ? ` · ${name.get(r.courtId) ?? r.courtId}` : '')}
                v={rub(r.price)} />
            ))}
          </View>
        )}

        <Text style={s.note}>
          {morning !== standard
            ? `Каждый час считается по своему тарифу: игра с ${hh(until - 1)} на два часа — `
              + `${rub(morning)} за первый час и ${rub(standard)} за второй. `
            : ''}
          Бронь подтверждается предоплатой {club.prepayPercent} %, остальное — на месте.
        </Text>
      </View>

      {/* Ракетки и мячи — свой прайс-лист: в аренду корта они не входят.
          Без заголовка и пояснений: заказчик просил оставить только сам прайс —
          крупные «Прокат ракеток», «Мячи» и строки с ценами. */}
      {rentals.length > 0 && (
        <View style={s.rent}><RentalsList groups={rentals} /></View>
      )}

      {/* Где мы: схема — картинка, а не карта; настоящая открывается нажатием */}
      <Pressable
        onPress={() => openLink(
          club.mapUrl ?? `https://yandex.ru/maps/?pt=${CLUB.point.lon},${CLUB.point.lat}&z=17`,
          `Координаты клуба: ${pointText}`)}
        accessibilityRole="button"
        accessibilityLabel="Где мы: открыть в Яндекс.Картах и построить маршрут"
        style={({ pressed }) => [s.map, pressed && { opacity: 0.9 }]}>
        <MapArt />
        <View style={s.mapBody}>
          <Text style={s.eyebrow}>Где мы</Text>
          <Text style={s.mapT}>{CLUB.city}</Text>
          <Text style={s.mapS}>{club.address ?? CLUB.region}</Text>
          <View style={s.route}>
            <Text style={s.routeT}>Построить маршрут</Text>
            <Text style={s.routeA}>→</Text>
          </View>
        </View>
      </Pressable>

      {/* Правила четырьмя цифрами: их запоминают, а абзацы — пролистывают */}
      <View style={s.facts}>
        <Fact big={`${two(club.openHour)}–${two(club.closeHour)}`} label="часы работы" />
        <Fact big={maxHours > 1 ? `1–${maxHours} ч` : '1 ч'} label="аренда подряд" />
        <Fact big={`${club.prepayPercent} %`} label="предоплата" />
        <Fact big={`${club.cancelHours} ч`} label="бесплатная отмена до начала" />
      </View>
    </View>
  );
}

function PriceRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowK}>{k}</Text>
      <Text style={[s.rowV, accent && { color: C.accent }]}>{v}</Text>
    </View>
  );
}

function Fact({ big, label }: { big: string; label: string }) {
  return (
    <View style={s.fact}>
      <Text style={s.factBig} allowFontScaling={false}>{big}</Text>
      <Text style={s.factL}>{label}</Text>
    </View>
  );
}

/** Схема района: улицы линиями и метка клуба. Условная картинка, не карта. */
function MapArt() {
  return (
    <Svg width="100%" height={150} viewBox="0 0 360 150" preserveAspectRatio="xMidYMid slice">
      <Rect x="0" y="0" width="360" height="150" fill={C.surface} />
      <Path d="M-10 118 L380 62" stroke={C.lineStrong} strokeWidth="10" />
      <Path d="M-10 118 L380 62" stroke={C.surface2} strokeWidth="7" />
      <Path d="M92 -10 L150 160" stroke={C.line} strokeWidth="5" />
      <Path d="M250 -10 L214 160" stroke={C.line} strokeWidth="5" />
      <Path d="M-10 30 L380 40" stroke={C.lineSoft} strokeWidth="3" />
      <Path d="M-10 146 L380 132" stroke={C.lineSoft} strokeWidth="3" />
      <Path d="M20 -10 L60 160" stroke={C.lineSoft} strokeWidth="3" />
      <Path d="M320 -10 L300 160" stroke={C.lineSoft} strokeWidth="3" />
      <Rect x="160" y="18" width="46" height="30" fill={C.surface2} />
      <Rect x="262" y="88" width="40" height="34" fill={C.surface2} />
      <Circle cx="196" cy="83" r="30" fill={C.accent} opacity="0.10" />
      <Circle cx="196" cy="83" r="17" fill={C.accent} opacity="0.22" />
      <Circle cx="196" cy="83" r="8" fill={C.accent} />
      <Circle cx="196" cy="83" r="3" fill={C.onLime} />
    </Svg>
  );
}

const s = sheet(() => ({
  wrap: { marginHorizontal: S.xl, gap: 12 },
  eyebrow: { ...EYEBROW, color: C.accent },
  eyebrowDim: { ...EYEBROW, color: C.dim2, letterSpacing: 1.2 },

  price: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderLeftWidth: 4, borderLeftColor: C.lime, padding: 18 },
  priceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  big: { color: C.text, fontFamily: DISP, fontSize: 46, lineHeight: 50, letterSpacing: -1.8,
    marginTop: 10, fontVariant: ['tabular-nums'] },
  rows: { marginTop: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    paddingVertical: 11, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  rowK: { fontFamily: BODY, color: C.dim, fontSize: 13.5, flexShrink: 1 },
  rowV: { fontFamily: DISP, color: C.text, fontSize: 15, letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] },
  note: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 17, marginTop: 14,
    paddingTop: 13, borderTopWidth: 1, borderTopColor: C.lineStrong },

  rent: { marginTop: 10 },

  map: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden',
    marginTop: 6 },
  mapBody: { padding: 16, paddingTop: 14 },
  mapT: { color: C.text, fontFamily: DISP, fontSize: 24, letterSpacing: -0.8,
    textTransform: 'uppercase', marginTop: 6 },
  mapS: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 19, marginTop: 3 },
  route: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 14, minHeight: 46, paddingHorizontal: 14, backgroundColor: C.lime },
  routeT: { fontFamily: DISP, color: C.onLime, fontSize: 12.5, letterSpacing: 0.8,
    textTransform: 'uppercase' },
  routeA: { fontFamily: DISP, color: C.onLime, fontSize: 18 },

  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { flexGrow: 1, flexBasis: '45%', minHeight: 96, padding: 14, justifyContent: 'space-between',
    borderWidth: 1, borderColor: C.line },
  factBig: { color: C.text, fontFamily: DISP, fontSize: 30, lineHeight: 33, letterSpacing: -1.2,
    fontVariant: ['tabular-nums'] },
  factL: { ...EYEBROW, color: C.dim2, letterSpacing: 1, marginTop: 8 },
}));
