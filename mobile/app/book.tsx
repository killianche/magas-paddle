import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S } from '../src/theme';
import { fmt, hh, CLUB } from '../src/data';
import { Card, Row, Btn } from '../src/components/ui';
import { addBooking } from '../src/store';

export default function Book() {
  const p = useLocalSearchParams<{ courtId: string; name: string; hour: string; hours: string; price: string }>();
  const hour = Number(p.hour ?? 19);
  const hours = Number(p.hours ?? 1);
  const total = Number(p.price ?? 4500);

  const submit = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addBooking({ courtId: String(p.courtId), courtName: String(p.name), hour, hours, price: total });
    router.replace({ pathname: '/sent', params: { name: String(p.name), hour: String(hour),
      hours: String(hours), price: String(total) } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 190 }}>
        <Card>
          <Row k="Площадка" v={String(p.name)} />
          <Row k="Дата" v="Вторник, 2 сентября" />
          <Row k="Время" v={`${hh(hour)} – ${hh(hour + hours)}`} mono />
          <Row k="Длительность" v={`${hours} ${hours === 1 ? 'час' : 'часа'}`} />
          <Row k="Тариф" v={hour >= 18 ? 'Вечерний, после 18:00' : 'Дневной'} />
          <Row k="К оплате на месте" v={fmt(total)} total />
        </Card>

        <Text style={s.label}>Ваше имя</Text>
        <View style={s.input}><Text style={s.inputT}>Ислам</Text>
          <Text style={s.saved}>сохранено</Text></View>

        <Text style={s.label}>Телефон</Text>
        <View style={s.input}><Text style={[s.inputT, { fontVariant: ['tabular-nums'] }]}>+7 928 ••• 12-34</Text>
          <Text style={s.saved}>сохранено</Text></View>

        <View style={s.note}>
          <Text style={s.noteT}>
            Если планы изменятся — отмените в приложении, слот освободится для других.
            Опоздание больше <Text style={{ fontWeight: '700' }}>{CLUB.lateMinutes} минут</Text> — корт может быть отдан.
          </Text>
        </View>
      </ScrollView>

      <View style={s.bar}>
        <Btn title="Отправить заявку" onPress={submit} />
        <Text style={s.barSub}>Заявка сохранится в приложении и откроется WhatsApp</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  label: { color: C.dim, fontSize: 13.5, fontWeight: '600', paddingHorizontal: S.xl, marginBottom: 8, marginTop: 6 },
  input: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: S.xl, marginBottom: 8, backgroundColor: C.surface, borderWidth: 1,
    borderColor: C.lineStrong, borderRadius: R.md, paddingVertical: 13, paddingHorizontal: 14, minHeight: 50 },
  inputT: { color: C.text, fontSize: 15 },
  saved: { color: C.limeDim, fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  note: { marginHorizontal: S.xl, marginTop: 8, padding: 12, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  noteT: { color: '#DFCCA8', fontSize: 12.5, lineHeight: 18 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink, borderTopWidth: 1, borderTopColor: C.lineSoft },
  barSub: { color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },
});
