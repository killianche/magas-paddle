// Ракетки и мячи: прокат, продажа, корзина мячей — то, что в бронь корта
// не входит и оплачивается отдельно.
//
// Заказчик: информация должна быть там, где бронируют, но не лезть в глаза.
// Поэтому на странице корта это свёрнутая секция внизу, под временем, а на
// панели брони — одна тихая строка, по нажатию открывается окно со списком.
//
// Вид списка. Сначала были строки «название … цена» — цена уезжала к правому
// краю. Потом плитки с рамками — заказчик сказал, что кубики мешают читать.
// Сейчас просто текст: крупный заголовок группы и под ним обычные строки
// «Для начинающих — 100 ₽ за игру», цена выделена жирным. Читается как фраза.
//
// Текст пишет клуб в админке («Приложение» → «Прокат ракеток и мячи»).
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S, DISP, DISP_MED, BODY, EYEBROW, sheet } from '../theme';
import { useClub } from '../club';
import { cheapest, ownAllowed, parseRentals, type RentalGroup } from '../rentals';
import { Section } from './section';

export function useRentals(): RentalGroup[] {
  return parseRentals(useClub().rentalsText);
}

/** «1 000 ₽ за игру» → сумма отдельно, условие отдельно: жирной делаем
 *  только сумму, иначе при переносе «за игру» повисает жирной строкой. */
function splitPrice(price: string): { amount: string; unit: string } {
  const m = price.match(/^\s*(\d[\d\s ]*(?:[.,]\d+)?\s*(?:₽|руб\.?|р\.)?)\s*(.*)$/i);
  return m ? { amount: m[1].trim(), unit: m[2].trim() } : { amount: price.trim(), unit: '' };
}

export function RentalsList({ groups }: { groups: RentalGroup[] }) {
  return (
    <View style={{ gap: 20 }}>
      {groups.map((g, gi) => (
        <View key={gi}>
          {!!g.title && <Text style={s.group}>{g.title}</Text>}
          {g.items.map((it, i) => {
            const p = it.price ? splitPrice(it.price) : null;
            return (
              <Text key={i} style={[s.line, !it.price && s.note]}>
                {it.name}
                {p ? <Text style={s.price}> — {p.amount}</Text> : null}
                {p?.unit ? ` ${p.unit}` : ''}
              </Text>
            );
          })}
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
          <View style={{ marginTop: 20 }}><RentalsList groups={groups} /></View>
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
  // Заголовок группы крупный: по нему и находят нужное
  group: { color: C.text, fontFamily: DISP, fontSize: 21, lineHeight: 25, letterSpacing: -0.6,
    textTransform: 'uppercase', marginBottom: 8 },
  // Строка целиком: «Для начинающих — 100 ₽ за игру». Плитки и рамки убраны —
  // заказчик сказал, что кубики только мешают читать.
  line: { fontFamily: BODY, color: C.dim, fontSize: 15, lineHeight: 26 },
  price: { fontFamily: DISP_MED, color: C.text },
  note: { color: C.accent },

  back: { flex: 1, backgroundColor: C.scrim },
  box: { backgroundColor: C.ink2, paddingHorizontal: S.xl, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: C.lineStrong },
  eyebrow: { ...EYEBROW, color: C.accent },
  title: { color: C.text, fontFamily: DISP, fontSize: 24, letterSpacing: -0.7,
    textTransform: 'uppercase', marginTop: 6 },
  ok: { marginTop: 24, minHeight: 50, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.lineStrong },
  okT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },
}));
