import { Text, View, StyleSheet } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { IconCheck } from '../src/components/icons';
import { C, R, S } from '../src/theme';
import { fmt, hh, CLUB } from '../src/data';
import { Card, Row, Btn } from '../src/components/ui';

export default function Sent() {
  const p = useLocalSearchParams<{ name: string; hour: string; hours: string; price: string }>();
  const hour = Number(p.hour ?? 19), hours = Number(p.hours ?? 1);

  return (
    <View style={{ flex: 1, backgroundColor: C.ink, paddingTop: 70 }}>
      <View style={s.done}>
        <View style={s.tick}><IconCheck size={34} color={C.lime} active /></View>
        <Text style={s.h}>Заявка принята</Text>
        <Text style={s.p}>
          Слот <Text style={{ color: C.text, fontWeight: '700' }}>{hh(hour)} – {hh(hour + hours)}</Text>
          {' '}на «{String(p.name)}» закреплён за вами.{'\n'}Менеджер подтвердит в течение 15 минут.
        </Text>
        <View style={s.pill}>
          <View style={s.dot} />
          <Text style={s.pillT}>ОЖИДАЕТ ПОДТВЕРЖДЕНИЯ</Text>
        </View>
      </View>

      <Card style={{ marginTop: 26 }}>
        <Row k="Номер заявки" v="#1043" mono />
        <Row k="К оплате на месте" v={fmt(Number(p.price ?? 4500))} mono />
      </Card>

      <View style={s.bar}>
        <Btn title="Написать в WhatsApp" kind="wa" />
        <Btn title={`Позвонить в клуб · ${CLUB.phone}`} kind="ghost" style={{ marginTop: 9 }} />
        <Btn title="Открыть мои записи" kind="ghost"
          onPress={() => router.replace('/bookings')} style={{ marginTop: 9, borderColor: 'transparent' }} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  done: { alignItems: 'center', paddingHorizontal: 34 },
  tick: { width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: C.lime,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(198,240,51,.09)', marginBottom: 20 },
  h: { color: C.text, fontSize: 26, fontWeight: '800', marginBottom: 10 },
  p: { color: C.dim, fontSize: 14.5, textAlign: 'center', lineHeight: 21 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 18,
    borderWidth: 1, borderColor: 'rgba(240,169,59,.42)', backgroundColor: 'rgba(240,169,59,.1)',
    borderRadius: 22, paddingVertical: 7, paddingHorizontal: 14 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.amber },
  pillT: { color: C.amber, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34 },
});
