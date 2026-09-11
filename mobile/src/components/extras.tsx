// Ракетки и мячи: прокат, продажа, корзина мячей — то, что в бронь корта
// не входит и оплачивается отдельно.
//
// Заказчик: информация должна быть там, где бронируют, но не лезть в глаза.
// Поэтому на странице корта это свёрнутая секция внизу, под временем, а на
// панели брони — одна тихая строка, по нажатию открывается окно со списком.
// Текст пишет клуб в админке («Прокат ракеток и мячи»), здесь только вид.
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S, HIT, DISP, DISP_MED, BODY, EYEBROW, sheet } from '../theme';
import { useClub } from '../club';
import { cheapest, ownAllowed, parseRentals, type RentalGroup } from '../rentals';
import { Section } from './section';

export function useRentals(): RentalGroup[] {
  return parseRentals(useClub().rentalsText);
}

/** Список: заголовок группы, пункты «название — цена», пометки. */
export function RentalsList({ groups }: { groups: RentalGroup[] }) {
  return (
    <View style={{ gap: 16 }}>
      {groups.map((g, i) => (
        <View key={i}>
          {!!g.title && <Text style={s.gT}>{g.title}</Text>}
          {g.items.map((it, j) => it.price ? (
            <View key={j} style={s.row}>
              <Text style={s.name}>{it.name}</Text>
              <Text style={s.price}>{it.price}</Text>
            </View>
          ) : (
            <Text key={j} style={s.note}>{it.name}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Свёрнутая секция на странице корта: «Ракетки и мячи · от 100 ₽ · можно свои». */
export function RentalsSection() {
  const groups = useRentals();
  if (groups.length === 0) return null;
  const from = cheapest(groups);
  const summary = [from && `от ${from}`, ownAllowed(groups) && 'можно свои',
    'в бронь не входят'].filter(Boolean).join(' · ');
  return (
    <Section title="Ракетки и мячи" summary={summary}>
      <RentalsList groups={groups} />
    </Section>
  );
}

/** Окно со списком — открывается со строки на панели брони. */
export function RentalsSheet({ visible, groups, onClose }: {
  visible: boolean; groups: RentalGroup[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}
      statusBarTranslucent>
      <View style={s.back}>
        <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Закрыть" />
        <View style={[s.box, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={s.eyebrow}>Оплачиваются отдельно от брони</Text>
          <Text style={s.title}>Ракетки и мячи</Text>
          <View style={{ marginTop: 16 }}><RentalsList groups={groups} /></View>
          <Pressable onPress={onClose} accessibilityRole="button"
            style={({ pressed }) => [s.ok, pressed && { opacity: 0.85 }]}>
            <Text style={s.okT}>Понятно</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = sheet(() => ({
  gT: { ...EYEBROW, color: C.dim2, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.lineSoft },
  name: { flex: 1, fontFamily: BODY, color: C.text, fontSize: 14.5, lineHeight: 20 },
  price: { fontFamily: DISP_MED, color: C.text, fontSize: 14.5, letterSpacing: -0.2,
    fontVariant: ['tabular-nums'] },
  note: { fontFamily: BODY, color: C.dim, fontSize: 13, marginTop: 8 },

  back: { flex: 1, backgroundColor: C.scrim },
  box: { backgroundColor: C.ink2, paddingHorizontal: S.xl, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: C.lineStrong },
  eyebrow: { ...EYEBROW, color: C.accent },
  title: { color: C.text, fontFamily: DISP, fontSize: 24, letterSpacing: -0.7,
    textTransform: 'uppercase', marginTop: 6 },
  ok: { marginTop: 20, minHeight: 50, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.lineStrong },
  okT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },
}));

export const RENTALS_HIT = HIT;
