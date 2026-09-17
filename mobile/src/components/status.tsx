// Состояния экрана, пока данных нет: ждём или не вышло.
//
// Когда сервер недоступен (такое уже было — 9,5 часа 16.09.2026), человек
// не должен остаться ни с чем: показываем телефон клуба и WhatsApp, чтобы
// записаться можно было по-старому, звонком.
import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, BODY, sheet } from '../theme';
import { useClub, whatsappUrl } from '../club';
import { prettyPhone } from '../profile';
import { openLink } from './contacts';
import { IconPhone, IconWhatsApp } from './icons';

export function Loading({ note }: { note?: string }) {
  return (
    <View style={s.center}>
      <ActivityIndicator color={C.accent} size="large" />
      {!!note && <Text style={s.note}>{note}</Text>}
    </View>
  );
}

export function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  const club = useClub();
  const wa = whatsappUrl();
  const phone = club.phone ?? club.whatsapp;
  return (
    <View style={s.center}>
      <Text style={s.title}>Не удалось загрузить</Text>
      <Text style={s.note}>{message}</Text>
      <Pressable onPress={onRetry} accessibilityRole="button"
        style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}>
        <Text style={s.btnT}>Попробовать снова</Text>
      </Pressable>

      {(!!phone || !!wa) && (
        <View style={s.help}>
          <Text style={s.helpT}>Пока связи нет, запишитесь напрямую:</Text>
          <View style={s.helpRow}>
            {!!phone && (
              <Pressable onPress={() => openLink(`tel:+${phone.replace(/\D/g, '')}`,
                `Телефон клуба: ${prettyPhone(phone)}`)}
                accessibilityRole="button" accessibilityLabel={`Позвонить в клуб, ${prettyPhone(phone)}`}
                style={({ pressed }) => [s.helpBtn, pressed && { opacity: 0.8 }]}>
                <IconPhone size={17} color={C.text} />
                <Text style={s.helpBtnT}>{prettyPhone(phone)}</Text>
              </Pressable>
            )}
            {!!wa && (
              <Pressable onPress={() => openLink(wa, 'Напишите менеджеру в WhatsApp вручную.')}
                accessibilityRole="button" accessibilityLabel="Написать в WhatsApp"
                style={({ pressed }) => [s.helpBtn, s.helpWa, pressed && { opacity: 0.85 }]}>
                <IconWhatsApp size={17} color={C.onWa} />
                <Text style={[s.helpBtnT, { color: C.onWa }]}>WhatsApp</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

const s = sheet(() => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 34, backgroundColor: C.ink },
  title: { ...TITLE.card, color: C.text, textAlign: 'center' },
  note: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 9 },
  btn: { marginTop: 22, backgroundColor: C.lime, borderRadius: R.lg,
    paddingVertical: 15, paddingHorizontal: 26, minHeight: HIT, justifyContent: 'center' },
  btnT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  help: { marginTop: 26, alignItems: 'center' },
  helpT: { fontFamily: BODY, color: C.dim2, fontSize: 13, marginBottom: 10 },
  helpRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  helpBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: HIT,
    paddingHorizontal: 14, borderRadius: R.lg, borderWidth: 1, borderColor: C.lineStrong,
    backgroundColor: C.surface },
  helpWa: { backgroundColor: C.wa, borderColor: C.wa },
  helpBtnT: { fontFamily: DISP_MED, color: C.text, fontSize: 13.5 },
}));
