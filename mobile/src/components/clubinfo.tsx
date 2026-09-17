// Сведения о клубе: связь, часы, дорога, правила, прокат, документы.
//
// Раньше это был отдельный экран, куда вела стрелка в углу главной. Заказчик
// просил стрелку убрать, а сведения не терять — теперь они живут в аккаунте,
// как настройки в обычных приложениях.
//
// Всё, чего клуб ещё не сообщил, показано честно как незаполненное, а не
// выдумано — правило «не додумывать» в CLAUDE.md.
import { Alert, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { C, S, HIT, DISP, DISP_MED, BODY, sheet, R } from '../theme';
import { CLUB, hoursOnDate, sameEveryDay, useClub, weekLines, whatsappUrl } from '../club';
import { hh, today } from '../dates';
import { Section, Line } from './section';
import { WhereWeAre } from './contacts';
import { IconChevron } from './icons';
import { RentalsList } from './extras';
import { parseRentals } from '../rentals';

/** Номер в базе лежит цифрами — человеку показываем привычно. */
const pretty = (digits: string) => {
  const d = digits.replace(/\D/g, '');
  return d.length === 11
    ? `+${d[0]} ${d.slice(1,4)} ${d.slice(4,7)}-${d.slice(7,9)}-${d.slice(9)}`
    : '+' + d;
};
export function ClubInfo() {
  const club = useClub();
  const open = async (url: string, fallback: string) => {
    Haptics.selectionAsync();
    try {
      const ok = await Linking.canOpenURL(url);
      if (ok) return Linking.openURL(url);
      throw new Error('no handler');
    } catch {
      const msg = `Не удалось открыть. ${fallback}`;
      if (Platform.OS === 'web') alert(msg); else Alert.alert('Не получилось', msg);
    }
  };

  return (
    <>
      {/* Номера клуб ещё не дал. Показывать выдуманный нельзя: человек
          позвонит незнакомому. Кнопки видны, но честно неактивны. */}
      <View style={s.actions}>
        <Pressable disabled={!club.phone}
          onPress={() => club.phone && open(`tel:${club.phone.replace(/[^\d+]/g, '')}`,
            `Телефон клуба: ${club.phone}`)}
          accessibilityRole="button"
          accessibilityLabel={club.phone ? `Позвонить в клуб, ${club.phone}` : 'Телефон клуба ещё не известен'}
          style={({ pressed }) => [s.act, !club.phone && s.actOff, pressed && { opacity: 0.85 }]}>
          <Text style={[s.actT, !club.phone && { color: C.dim }]}>Позвонить</Text>
          <Text style={s.actS}>{club.phone ? pretty(club.phone) : 'номер скоро появится'}</Text>
        </Pressable>
        <Pressable disabled={!whatsappUrl()}
          onPress={() => open(whatsappUrl()!, 'Напишите менеджеру в WhatsApp вручную.')}
          accessibilityRole="button" accessibilityLabel="Написать в WhatsApp"
          style={({ pressed }) => [s.act, whatsappUrl() ? s.actWa : s.actOff,
            pressed && { opacity: 0.85 }]}>
          <Text style={[s.actT, whatsappUrl() ? { color: C.onWa } : { color: C.dim }]}>WhatsApp</Text>
          <Text style={[s.actS, whatsappUrl() && { color: C.onWa, opacity: 0.75 }]}>
            {whatsappUrl() ? 'написать менеджеру' : 'номер скоро появится'}
          </Text>
        </Pressable>
      </View>

      {/* Часы по дням недели задаёт менеджер в админке. Одинаковые соседние
          дни — одной строкой, чтобы не читать семь одинаковых строк. */}
      <Section title="Часы работы"
        summary={sameEveryDay(club)
          ? `Каждый день с ${hh(club.openHour)} до ${hh(club.closeHour)}`
          : (() => { const d = hoursOnDate(club, today());
              return d.closed ? 'Сегодня не работаем' : `Сегодня с ${hh(d.open)} до ${hh(d.close)}` })()}>
        {sameEveryDay(club)
          ? <Line k="Каждый день" v={`${hh(club.openHour)} – ${hh(club.closeHour)}`} />
          : weekLines(club).map(l => <Line key={l.days} k={l.days} v={l.hours} />)}
      </Section>

      {/* Пока адреса нет — только город и кнопка карты, без пояснений */}
      <Section title="Как добраться" summary={club.address ?? `${CLUB.city}, ${CLUB.region}`}>
        {!!club.address && <Line k="Адрес" v={club.address} />}
        {/* У карточки свои поля от краёв экрана, а секция уже с полями */}
        <View style={{ marginHorizontal: -S.xl }}><WhereWeAre /></View>
      </Section>

      {/* Заказчик убрал длительность аренды, остаток, срок отмены и опоздание:
          здесь только предоплата и то, что отменяют через WhatsApp */}
      <Section title="Оплата и правила" summary={`Предоплата ${club.prepayPercent} %`}>
        <Line k="Подтверждение" v={`предоплата ${club.prepayPercent} % менеджеру`} />
        <Line k="Как отменить" v="написать менеджеру в WhatsApp" />
        <Text style={s.small}>
          После заявки менеджер связывается по телефону или в WhatsApp и говорит,
          как внести предоплату — {club.prepayPercent} % стоимости. Как только она
          получена, бронь становится подтверждённой. Остальное платится на месте.
        </Text>
      </Section>

      <Section title="Прокат и раздевалка"
        summary={club.rentalsText ? 'что есть в клубе' : 'сведений пока нет'}>
        {club.rentalsText
          ? <RentalsList groups={parseRentals(club.rentalsText)} />
          : (
            <View style={s.empty}>
              <Text style={s.emptyT}>Эти сведения ещё не заполнены</Text>
              <Text style={s.emptyS}>
                Есть ли прокат ракеток и по какой цене, входят ли мячи в стоимость,
                что с раздевалкой и душем — менеджер пишет это в админке.
              </Text>
            </View>
          )}
      </Section>

      <Section title="Документы" summary="Политика конфиденциальности">
        <Pressable
          onPress={() => CLUB.privacyUrl
            ? open(CLUB.privacyUrl, 'Ссылка пока не задана.')
            : (Platform.OS === 'web'
                ? alert('Документ ещё не опубликован.')
                : Alert.alert('Пока нет', 'Документ ещё не опубликован.'))}
          accessibilityRole="button"
          style={({ pressed }) => [s.doc, pressed && { opacity: 0.7 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.docT}>Политика конфиденциальности</Text>
            <Text style={s.docS}>{CLUB.privacyUrl ? 'открыть' : 'ещё не опубликована'}</Text>
          </View>
          <IconChevron size={15} color={C.dim2} />
        </Pressable>
      </Section>
    </>
  );
}

const s = sheet(() => ({
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: S.xl, paddingBottom: 18 },
  act: { flex: 1, paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, minHeight: HIT + 12,
    borderRadius: R.lg },
  actOff: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  actWa: { backgroundColor: C.wa, borderColor: C.wa },
  actT: { color: C.text, fontFamily: DISP, fontSize: 14, letterSpacing: -0.4,
    textTransform: 'uppercase' },
  actS: { fontFamily: BODY, color: C.dim2, fontSize: 12, marginTop: 3 },

  empty: { padding: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.xl },
  emptyT: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2 },
  emptyS: { fontFamily: BODY, color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 5 },

  small: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  rentals: { fontFamily: BODY, color: C.text, fontSize: 14, lineHeight: 21 },
  q: { fontFamily: BODY, color: C.amber, fontSize: 12, lineHeight: 17, marginTop: 12 },

  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    minHeight: HIT },
  docT: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2 },
  docS: { fontFamily: BODY, color: C.dim2, fontSize: 12, marginTop: 2 },
}));
