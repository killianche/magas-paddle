// Как нас найти и как связаться. Один блок на все экраны: главная и «Клуб».
// Ссылки и координаты лежат в src/club.ts — здесь только вид и открытие ссылок.
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, BODY, sheet } from '../theme';
import { CLUB, pointText, telegramUrl, useClub, whatsappUrl } from '../club';
import { IconPin, IconChevron, IconWhatsApp, IconInstagram, IconPhone, IconTelegram } from './icons';

/** Открывает ссылку, а если открыть нечем — говорит человеку, что делать руками. */
export async function openLink(url: string, fallback: string) { return open(url, fallback) }

async function open(url: string, fallback: string) {
  Haptics.selectionAsync();
  try {
    await Linking.openURL(url);
  } catch {
    const msg = `Не удалось открыть. ${fallback}`;
    if (Platform.OS === 'web') alert(msg); else Alert.alert('Не получилось', msg);
  }
}

/** Карточка «мы здесь» — ведёт в Яндекс.Карты, оттуда строится маршрут. */
export function WhereWeAre() {
  const club = useClub();
  return (
    <Pressable
      onPress={() => club.mapUrl
        ? open(club.mapUrl, `Координаты клуба: ${pointText}`)
        : open(`https://yandex.ru/maps/?pt=${CLUB.point.lon},${CLUB.point.lat}&z=17`,
            `Координаты клуба: ${pointText}`)}
      accessibilityRole="button"
      accessibilityLabel="Открыть расположение клуба в Яндекс.Картах"
      style={({ pressed }) => [s.map, pressed && { opacity: 0.85 }]}>
      <View style={s.pin}><IconPin size={22} color={C.accent} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.mapT}>{CLUB.city}, {CLUB.region}</Text>
        <Text style={s.mapS}>
          {CLUB.address ?? 'Открыть в Яндекс.Картах и построить маршрут'}
        </Text>
      </View>
      <IconChevron size={17} color={C.dim} />
    </Pressable>
  );
}

/** Связь с клубом: четыре одинаковые кнопки — WhatsApp, звонок, Telegram,
 *  Instagram. Раньше WhatsApp был широкой кнопкой, а остальные квадратиками;
 *  заказчик попросил сделать их одинаковыми и убрать блок вниз главной.
 *  Кнопки без ссылки видны, но честно неактивны — выдуманных контактов нет. */
export function SocialButtons({ style }: { style?: any }) {
  const club = useClub();
  const { width } = useWindowDimensions();
  // На узком телефоне плитка ~65 pt: подпись мельче, чтобы «Instagram» влез целиком
  const labelSize = width < 360 ? 9.5 : 11.5;
  const wa = whatsappUrl();
  const tg = telegramUrl();
  const tel = club.phone ? `tel:${club.phone.replace(/[^\d+]/g, '')}` : null;

  const items = [
    { key: 'wa', url: wa, label: 'WhatsApp', icon: IconWhatsApp,
      a11y: wa ? 'Написать в WhatsApp' : 'WhatsApp: номер клуб ещё не сообщил',
      fallback: 'Напишите менеджеру в WhatsApp вручную.' },
    { key: 'tel', url: tel, label: 'Позвонить', icon: IconPhone,
      a11y: tel ? `Позвонить в клуб, ${club.phone}` : 'Телефон: номер клуб ещё не сообщил',
      fallback: `Телефон клуба: ${club.phone}` },
    { key: 'tg', url: tg, label: 'Telegram', icon: IconTelegram,
      a11y: tg ? 'Открыть Telegram клуба' : 'Telegram: клуб ещё не указал',
      fallback: 'Найдите клуб в Telegram вручную.' },
    { key: 'ig', url: club.instagram, label: 'Instagram', icon: IconInstagram,
      a11y: club.instagram ? 'Открыть Instagram клуба' : 'Instagram: клуб ещё не указал',
      fallback: 'Найдите клуб в Instagram вручную.' },
  ];

  return (
    <View style={[s.row, style]}>
      {items.map(it => {
        const Icon = it.icon;
        const on = !!it.url;
        return (
          <Pressable key={it.key} disabled={!on}
            onPress={() => it.url && open(it.url, it.fallback)}
            accessibilityRole="button" accessibilityLabel={it.a11y}
            style={({ pressed }) => [s.tile, pressed && on && { opacity: 0.8 }]}>
            <Icon size={22} color={on ? C.accent : C.dim2} />
            <Text style={[s.tileT, { fontSize: labelSize }, !on && { color: C.dim2 }]}
              numberOfLines={1} allowFontScaling={false}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = sheet(() => ({
  map: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl,
    padding: 14, borderRadius: R.xl, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface, minHeight: 72 },
  pin: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentBorder },
  mapT: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  mapS: { fontFamily: BODY, color: C.dim, fontSize: 13, marginTop: 2 },

  // Четыре равные плитки в ряд
  row: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minHeight: 74, alignItems: 'center', justifyContent: 'center', gap: 7,
    paddingHorizontal: 2, borderRadius: R.lg, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface },
  tileT: { fontFamily: DISP_MED, color: C.text, fontSize: 11.5, letterSpacing: 0.1 },
}));
