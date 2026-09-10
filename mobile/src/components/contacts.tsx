// Как нас найти и как связаться. Один блок на все экраны: главная и «Клуб».
// Ссылки и координаты лежат в src/club.ts — здесь только вид и открытие ссылок.
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, BODY } from '../theme';
import { CLUB, pointText, useClub, whatsappUrl } from '../club';
import { IconPin, IconChevron, IconWhatsApp, IconInstagram, IconPhone } from './icons';

/** Открывает ссылку, а если открыть нечем — говорит человеку, что делать руками. */
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
      <View style={s.pin}><IconPin size={22} color={C.lime} /></View>
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

/** Связь одной строкой: написать, позвонить, посмотреть.
 *
 *  WhatsApp занимает всю ширину — это главный путь к менеджеру. Телефон и
 *  Instagram стоят рядом квадратными кнопками: подписи им не нужны, значки
 *  узнаются сами, а места остаётся втрое меньше.
 *  Кнопки без номера видны, но честно неактивны — выдуманного номера нет. */
export function SocialButtons() {
  const club = useClub();
  const wa = whatsappUrl();
  const tel = club.phone ? `tel:${club.phone.replace(/[^\d+]/g, '')}` : null;

  return (
    <View style={s.row}>
      <Pressable
        disabled={!wa}
        onPress={() => wa && open(wa, 'Напишите менеджеру в WhatsApp вручную.')}
        accessibilityRole="button"
        accessibilityLabel={wa ? 'Написать в WhatsApp' : 'WhatsApp: номер клуб ещё не сообщил'}
        style={({ pressed }) => [s.btn, s.wa, !wa && s.off, pressed && wa && { opacity: 0.85 }]}>
        <IconWhatsApp size={21} color={wa ? '#04240F' : C.dim2} />
        <View style={{ flex: 1 }}>
          <Text style={[s.btnT, { color: wa ? '#04240F' : C.dim }]}>WhatsApp</Text>
          <Text numberOfLines={1} style={[s.btnS, { color: wa ? 'rgba(4,36,15,.7)' : C.dim2 }]}>
            {wa ? 'написать менеджеру' : 'скоро'}
          </Text>
        </View>
      </Pressable>

      <Pressable
        disabled={!tel}
        onPress={() => tel && open(tel, `Телефон клуба: ${club.phone}`)}
        accessibilityRole="button"
        accessibilityLabel={tel ? `Позвонить в клуб, ${club.phone}` : 'Телефон: номер клуб ещё не сообщил'}
        style={({ pressed }) => [s.sq, tel ? s.sqOn : s.off, pressed && tel && { opacity: 0.85 }]}>
        <IconPhone size={21} color={tel ? C.text : C.dim2} />
      </Pressable>

      <Pressable
        disabled={!club.instagram}
        onPress={() => club.instagram && open(club.instagram, 'Мы в Instagram: padel_magas')}
        accessibilityRole="button" accessibilityLabel="Открыть Instagram клуба"
        style={({ pressed }) => [s.sq, club.instagram ? s.sqOn : s.off,
          pressed && { opacity: 0.85 }]}>
        <IconInstagram size={21} color={club.instagram ? C.text : C.dim2} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  map: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl,
    padding: 14, borderRadius: R.xl, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface, minHeight: 72 },
  pin: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(198,240,51,.10)', borderWidth: 1, borderColor: 'rgba(198,240,51,.3)' },
  mapT: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  mapS: { fontFamily: BODY, color: C.dim, fontSize: 13, marginTop: 2 },

  row: { flexDirection: 'row', gap: 10, marginHorizontal: S.xl, marginTop: 10 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 12, paddingHorizontal: 13, borderRadius: R.lg, minHeight: HIT },
  wa: { backgroundColor: '#4FCE5D' },
  sq: { width: 54, minHeight: HIT, alignItems: 'center', justifyContent: 'center' },
  sqOn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  ig: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  off: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  btnT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },
  btnS: { fontFamily: BODY, color: C.dim2, fontSize: 11, marginTop: 1 },
});
