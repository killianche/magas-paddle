// Экран клуба: связь, часы, правила, документы.
// Всё, чего клуб ещё не сообщил, показано честно как незаполненное,
// а не выдумано — см. правило «не додумывать» в CLAUDE.md.
import { Linking, Platform, ScrollView, StyleSheet, Text, View, Pressable, Image, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP } from '../src/theme';
import { CLUB, COURTS, hh } from '../src/data';
import { HERO } from '../src/images';
import { Section, Line } from '../src/components/section';
import { IconChevron } from '../src/components/icons';

/** ЗАГЛУШКИ: данные, которых клуб ещё не дал. Показываются как незаполненные. */
const UNKNOWN = {
  address: null as string | null,
  parking: null as string | null,
  rentals: null as string | null,
  privacyUrl: null as string | null,
};

export default function Club() {
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
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Stack.Screen options={{ title: 'Клуб' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        <View style={s.hero}>
          <Image source={HERO} style={s.heroImg} resizeMode="cover" />
          <LinearGradient colors={['rgba(9,13,10,.25)', 'rgba(9,13,10,.65)', 'rgba(9,13,10,.96)']}
            locations={[0, 0.55, 1]} style={s.fill} />
          <View style={s.heroIn}>
            <Text style={s.name}>{CLUB.name}</Text>
            <Text style={s.sub}>
              {/* Считаем все корты клуба, а не только открытые: закрытый на ремонт
                  никуда не делся, и «5 кортов» вводило бы в заблуждение */}
              {CLUB.city} · {COURTS.filter(c => !c.football).length} кортов и мини-футбольное поле
            </Text>
          </View>
        </View>

        {/* Связь — главное, ради чего сюда заходят */}
        <View style={s.actions}>
          <Pressable onPress={() => open(`tel:${CLUB.phone.replace(/[^\d+]/g, '')}`,
            `Телефон клуба: ${CLUB.phone}`)}
            accessibilityRole="button" accessibilityLabel={`Позвонить в клуб, ${CLUB.phone}`}
            style={({ pressed }) => [s.act, pressed && { opacity: 0.85 }]}>
            <Text style={s.actT}>Позвонить</Text>
            <Text style={s.actS}>{CLUB.phone}</Text>
          </Pressable>
          <Pressable onPress={() => open(`https://wa.me/${CLUB.whatsapp}`,
            'Напишите менеджеру в WhatsApp вручную.')}
            accessibilityRole="button" accessibilityLabel="Написать в WhatsApp"
            style={({ pressed }) => [s.act, s.actWa, pressed && { opacity: 0.85 }]}>
            <Text style={[s.actT, { color: '#04240F' }]}>WhatsApp</Text>
            <Text style={[s.actS, { color: 'rgba(4,36,15,.7)' }]}>написать менеджеру</Text>
          </Pressable>
        </View>

        <Section title="Часы работы" summary={`Каждый день с ${hh(CLUB.openHour)} до полуночи`} open>
          <Line k="Будни" v={`${hh(CLUB.openHour)} – 24:00`} />
          <Line k="Выходные" v={`${hh(CLUB.openHour)} – 24:00`} />
          <Text style={s.q}>
            ВОПРОС К ЗАКАЗЧИКУ: часы взяты как рабочее предположение. Если в выходные
            или праздники режим другой — пришлите, поправим.
          </Text>
        </Section>

        <Section title="Как добраться" summary={UNKNOWN.address ?? 'адрес ещё не получен'}>
          <View style={s.empty}>
            <Text style={s.emptyT}>Адреса и карты пока нет</Text>
            <Text style={s.emptyS}>
              Клуб ещё не прислал точный адрес и координаты. Придумывать их мы не стали:
              человек поедет не туда. Пришлите адрес — добавим карту и маршрут.
            </Text>
          </View>
        </Section>

        <Section title="Правила" summary={`Отмена за ${CLUB.cancelHours} часа · опоздание ${CLUB.lateMinutes} минут`}>
          <Line k="Аренда" v="ровно час, можно два и три подряд" />
          <Line k="Оплата" v="на месте, в клубе" />
          <Line k="Отмена" v={`бесплатно за ${CLUB.cancelHours} часа`} />
          <Line k="Опоздание" v={`корт держим ${CLUB.lateMinutes} минут`} />
          <Text style={s.small}>
            Отменить запись можно в разделе «Мои записи» — время сразу освободится
            для других игроков.
          </Text>
        </Section>

        <Section title="Прокат и раздевалка" summary={UNKNOWN.rentals ?? 'сведений пока нет'}>
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
            onPress={() => UNKNOWN.privacyUrl
              ? open(UNKNOWN.privacyUrl, 'Ссылка пока не задана.')
              : (Platform.OS === 'web'
                  ? alert('Документ ещё не опубликован.')
                  : Alert.alert('Пока нет', 'Документ ещё не опубликован.'))}
            style={({ pressed }) => [s.doc, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.docT}>Политика конфиденциальности</Text>
              <Text style={s.docS}>
                {UNKNOWN.privacyUrl ? 'открыть' : 'ещё не опубликована'}
              </Text>
            </View>
            <IconChevron size={15} color={C.dim2} />
          </Pressable>
          <Text style={s.q}>
            ВОПРОС К ЗАКАЗЧИКУ: без постоянного адреса этого документа приложение
            не пройдёт проверку Apple — правило 5.1.1. Нужен человек, который её напишет,
            и место, где она будет лежать.
          </Text>
        </Section>

        <Text style={s.foot}>
          Данные в приложении пока учебные. Настоящие цены, часы, контакты
          и фотографии — от клуба.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hero: { height: 210, justifyContent: 'flex-end', overflow: 'hidden' },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroIn: { padding: S.xl },
  name: { color: C.text, fontFamily: DISP, fontSize: 30, letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,.5)', textShadowRadius: 12 },
  sub: { color: '#CBD5C2', fontSize: 13, marginTop: 4 },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: S.xl, paddingVertical: 18 },
  act: { flex: 1, borderRadius: R.lg, paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface, minHeight: HIT + 12 },
  actWa: { backgroundColor: '#25D366', borderColor: '#25D366' },
  actT: { color: C.text, fontSize: 15.5, fontWeight: '700' },
  actS: { color: C.dim2, fontSize: 12, marginTop: 3, fontVariant: ['tabular-nums'] },

  empty: { padding: 14, borderRadius: R.md, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface },
  emptyT: { color: C.text, fontSize: 14, fontWeight: '700' },
  emptyS: { color: C.dim, fontSize: 12.5, lineHeight: 18, marginTop: 5 },

  small: { color: C.dim2, fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  q: { color: C.amber, fontSize: 12, lineHeight: 17, marginTop: 12 },

  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12,
    minHeight: HIT },
  docT: { color: C.text, fontSize: 14.5, fontWeight: '600' },
  docS: { color: C.dim2, fontSize: 12, marginTop: 2 },

  foot: { color: C.dim2, fontSize: 11.5, lineHeight: 17, textAlign: 'center',
    marginTop: 20, paddingHorizontal: 30 },
});
