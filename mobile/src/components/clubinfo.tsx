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
import { C, S, HIT, DISP, DISP_MED, BODY } from '../theme';
import { CLUB, whatsappUrl } from '../club';
import { hh } from '../dates';
import { Section, Line } from './section';
import { IconChevron } from './icons';

/** ЗАГЛУШКИ: часы и правила ждут подтверждения клуба (вопросы Q44, Q40). */
const OPEN_HOUR = 9, CANCEL_HOURS = 4, LATE_MINUTES = 15;
/** ЗАГЛУШКА: прокат и раздевалка — сведений от клуба пока нет. */
const RENTALS: string | null = null;

export function ClubInfo() {
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
        <Pressable disabled={!CLUB.phone}
          onPress={() => CLUB.phone && open(`tel:${CLUB.phone.replace(/[^\d+]/g, '')}`,
            `Телефон клуба: ${CLUB.phone}`)}
          accessibilityRole="button"
          accessibilityLabel={CLUB.phone ? `Позвонить в клуб, ${CLUB.phone}` : 'Телефон клуба ещё не известен'}
          style={({ pressed }) => [s.act, !CLUB.phone && s.actOff, pressed && { opacity: 0.85 }]}>
          <Text style={[s.actT, !CLUB.phone && { color: C.dim }]}>Позвонить</Text>
          <Text style={s.actS}>{CLUB.phone ?? 'номер скоро появится'}</Text>
        </Pressable>
        <Pressable disabled={!whatsappUrl()}
          onPress={() => open(whatsappUrl()!, 'Напишите менеджеру в WhatsApp вручную.')}
          accessibilityRole="button" accessibilityLabel="Написать в WhatsApp"
          style={({ pressed }) => [s.act, whatsappUrl() ? s.actWa : s.actOff,
            pressed && { opacity: 0.85 }]}>
          <Text style={[s.actT, whatsappUrl() ? { color: '#04240F' } : { color: C.dim }]}>WhatsApp</Text>
          <Text style={[s.actS, whatsappUrl() && { color: 'rgba(4,36,15,.7)' }]}>
            {whatsappUrl() ? 'написать менеджеру' : 'номер скоро появится'}
          </Text>
        </Pressable>
      </View>

      <Section title="Часы работы" summary={`Каждый день с ${hh(OPEN_HOUR)} до полуночи`}>
        <Line k="Будни" v={`${hh(OPEN_HOUR)} – 24:00`} />
        <Line k="Выходные" v={`${hh(OPEN_HOUR)} – 24:00`} />
        <Text style={s.q}>
          ВОПРОС К ЗАКАЗЧИКУ: часы взяты как рабочее предположение. Если в выходные
          или праздники режим другой — пришлите, поправим.
        </Text>
      </Section>

      <Section title="Как добраться" summary={CLUB.address ?? 'адрес ещё не получен'}>
        <View style={s.empty}>
          <Text style={s.emptyT}>Адреса и карты пока нет</Text>
          <Text style={s.emptyS}>
            Клуб ещё не прислал точный адрес. Придумывать его мы не стали:
            человек поедет не туда. Пришлите адрес — добавим карту и маршрут.
          </Text>
        </View>
      </Section>

      <Section title="Оплата и правила"
        summary={`Предоплата 50 % · отмена за ${CANCEL_HOURS} часа`}>
        <Line k="Аренда" v="ровно час, можно два и три подряд" />
        <Line k="Подтверждение" v="предоплата 50 % менеджеру" />
        <Line k="Остаток" v="на месте, в клубе" />
        <Line k="Отмена" v={`за ${CANCEL_HOURS} часа — бесплатно`} />
        <Line k="Как отменить" v="звонок, WhatsApp или «Мои записи»" />
        <Line k="Опоздание" v={`корт держим ${LATE_MINUTES} минут`} />
        <Text style={s.small}>
          После заявки менеджер связывается по телефону или в WhatsApp и говорит,
          как внести предоплату — половину стоимости. Как только она получена,
          бронь становится подтверждённой. Остальное платится на месте.
        </Text>
        <Text style={s.small}>
          Отменить можно у менеджера — по телефону или в WhatsApp, — а также
          самому в разделе «Мои записи».
        </Text>
      </Section>

      <Section title="Прокат и раздевалка" summary={RENTALS ?? 'сведений пока нет'}>
        <View style={s.empty}>
          <Text style={s.emptyT}>Эти сведения ещё не получены</Text>
          <Text style={s.emptyS}>
            Есть ли прокат ракеток и по какой цене, входят ли мячи в стоимость,
            что с раздевалкой, душем и парковкой — вопрос к клубу.
          </Text>
        </View>
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

const s = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: S.xl, paddingBottom: 18 },
  act: { flex: 1, paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, minHeight: HIT + 12 },
  actOff: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  actWa: { backgroundColor: '#25D366', borderColor: '#25D366' },
  actT: { color: C.text, fontFamily: DISP, fontSize: 14, letterSpacing: -0.4,
    textTransform: 'uppercase' },
  actS: { fontFamily: BODY, color: C.dim2, fontSize: 12, marginTop: 3 },

  empty: { padding: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  emptyT: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2 },
  emptyS: { fontFamily: BODY, color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 5 },

  small: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  q: { fontFamily: BODY, color: C.amber, fontSize: 12, lineHeight: 17, marginTop: 12 },

  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    minHeight: HIT },
  docT: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2 },
  docS: { fontFamily: BODY, color: C.dim2, fontSize: 12, marginTop: 2 },
});
