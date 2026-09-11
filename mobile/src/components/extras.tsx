// Ракетки и мячи: прокат, продажа, корзина мячей — то, что в бронь корта
// не входит и оплачивается отдельно.
//
// Заказчик: информация должна быть там, где бронируют, но не лезть в глаза.
// Поэтому на странице корта это свёрнутая секция внизу, под временем, а на
// панели брони — одна тихая строка, по нажатию открывается окно со списком.
//
// Вид списка — плитками, а не строками «название … цена». Строками цена
// уезжала к правому краю, и прочитать блок с одного взгляда было нельзя:
// заказчик так и сказал. В плитке первым делом видно цену, под ней «за игру»
// и только потом название — так глаз находит нужное сразу.
//
// Текст пишет клуб в админке («Приложение» → «Прокат ракеток и мячи»).
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, S, DISP, DISP_MED, BODY, EYEBROW, sheet } from '../theme';
import { useClub } from '../club';
import { cheapest, ownAllowed, parseRentals, type RentalGroup } from '../rentals';
import { IconCheck } from './icons';
import { Section } from './section';

export function useRentals(): RentalGroup[] {
  return parseRentals(useClub().rentalsText);
}

/** «1 000 ₽ за игру» → сумма отдельно, условие отдельно. */
function splitPrice(price: string): { amount: string; unit: string } {
  const m = price.match(/^\s*(\d[\d\s ]*(?:[.,]\d+)?\s*(?:₽|руб\.?|р\.)?)\s*(.*)$/i);
  return m ? { amount: m[1].trim(), unit: m[2].trim() } : { amount: price.trim(), unit: '' };
}

/** Плитки с ценами и пометки вроде «можно свои». */
export function RentalsList({ groups }: { groups: RentalGroup[] }) {
  return (
    <View style={{ gap: 18 }}>
      {groups.map((g, gi) => {
        const priced = g.items.filter(i => i.price);
        const notes = g.items.filter(i => !i.price);
        return (
          <View key={gi}>
            {!!g.title && <Text style={s.group}>{g.title}</Text>}
            <View style={s.tiles}>
              {priced.map((it, i) => {
                const { amount, unit } = splitPrice(it.price!);
                return (
                  <View key={i} style={s.tile}>
                    <Text style={s.amount} allowFontScaling={false}>{amount}</Text>
                    {!!unit && <Text style={s.unit}>{unit}</Text>}
                    <Text style={s.name}>{it.name}</Text>
                  </View>
                );
              })}
            </View>
            {notes.map((n, i) => (
              <View key={i} style={s.note}>
                <View style={s.noteIcon}><IconCheck size={11} color={C.onLime} /></View>
                <Text style={s.noteT}>{n.name}</Text>
              </View>
            ))}
          </View>
        );
      })}
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
          <View style={{ marginTop: 18 }}><RentalsList groups={groups} /></View>
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
  group: { ...EYEBROW, color: C.accent, marginBottom: 9 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Плитка тянется на половину ширины; длинному названию хватает двух строк
  tile: { flexGrow: 1, flexBasis: '46%', minWidth: 132, paddingVertical: 12, paddingHorizontal: 13,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  amount: { color: C.text, fontFamily: DISP, fontSize: 21, lineHeight: 24, letterSpacing: -0.7,
    fontVariant: ['tabular-nums'] },
  unit: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, marginTop: 2 },
  name: { fontFamily: BODY, color: C.dim, fontSize: 13, lineHeight: 18, marginTop: 8 },

  note: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  noteIcon: { width: 17, height: 17, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  noteT: { fontFamily: DISP_MED, color: C.text, fontSize: 13 },

  back: { flex: 1, backgroundColor: C.scrim },
  box: { backgroundColor: C.ink2, paddingHorizontal: S.xl, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: C.lineStrong },
  eyebrow: { ...EYEBROW, color: C.accent },
  title: { color: C.text, fontFamily: DISP, fontSize: 24, letterSpacing: -0.7,
    textTransform: 'uppercase', marginTop: 6 },
  ok: { marginTop: 22, minHeight: 50, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.lineStrong },
  okT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },
}));
