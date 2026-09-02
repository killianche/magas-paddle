import { ScrollView, Text, View, Pressable, StyleSheet, Alert, Platform } from 'react-native';
import { C, R, S } from '../../src/theme';
import { useBookings, cancelBooking, useEntries, leaveTournament } from '../../src/store';
import { fmt, hh, tournamentById } from '../../src/data';
import { Pill } from '../../src/components/ui';
import { IconRacket, IconTrophy } from '../../src/components/icons';
import { router } from 'expo-router';

export default function Bookings() {
  const items = useBookings();
  const entries = useEntries();

  const ask = (id: string, name: string) => {
    const title = `Отменить бронь на ${name}?`;
    const msg = 'Ничего платить не нужно. Слот сразу освободится и станет доступен другим игрокам.';
    if (Platform.OS === 'web') { if (confirm(title + '\n\n' + msg)) cancelBooking(id); return }
    Alert.alert(title, msg, [
      { text: 'Оставить', style: 'cancel' },
      { text: 'Отменить бронь', style: 'destructive', onPress: () => cancelBooking(id) },
    ]);
  };

  const askT = (id: string, name: string) => {
    const title = `Отменить запись на «${name}»?`;
    const msg = 'Место освободится для других игроков.';
    if (Platform.OS === 'web') { if (confirm(title + '\n\n' + msg)) leaveTournament(id); return }
    Alert.alert(title, msg, [
      { text: 'Оставить', style: 'cancel' },
      { text: 'Отменить запись', style: 'destructive', onPress: () => leaveTournament(id) },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }} contentContainerStyle={{ paddingBottom: 30 }}>
      {items.length === 0 && entries.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}><IconRacket size={30} color={C.lime} /></View>
          <Text style={s.emptyT}>Записей пока нет</Text>
          <Text style={s.emptyS}>Запишитесь на корт — запись появится здесь.</Text>
          <Pressable onPress={() => router.replace('/')}
            style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.85 }]}>
            <Text style={s.emptyBtnT}>Выбрать время</Text>
          </Pressable>
        </View>
      ) : <>
        {entries.map(e => {
          const t = tournamentById(e.tournamentId);
          if (!t) return null;
          return (
            <View key={e.tournamentId} style={[s.card, s.cardT]}>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{t.name}</Text>
                  <Text style={s.date}>{t.date}, {t.weekday}</Text>
                </View>
                <View style={s.tIcon}><IconTrophy size={17} color={C.lime} /></View>
              </View>
              <View style={s.foot}>
                <Text style={s.time}>Начало {t.time}</Text>
                <Text style={s.price}>взнос {fmt(t.fee)}</Text>
              </View>
              <View style={s.actions}>
                <Pressable style={s.mini}
                  onPress={() => router.push({ pathname: '/tournament', params: { id: t.id } })}>
                  <Text style={s.miniT}>О турнире</Text>
                </Pressable>
                <Pressable style={[s.mini, s.miniDg]} onPress={() => askT(t.id, t.name)}>
                  <Text style={[s.miniT, { color: C.red }]}>Отменить</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
        {items.map(b => (
        <View key={b.id} style={s.card}>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{b.courtName}</Text>
              <Text style={s.date}>Сегодня, 2 сентября</Text>
            </View>
            <Pill text={b.status === 'confirmed' ? 'Подтверждено' : 'Ожидает'}
              kind={b.status === 'confirmed' ? 'ok' : 'wait'} />
          </View>
          <View style={s.foot}>
            <Text style={s.time}>{hh(b.hour)} – {hh(b.hour + b.hours)}</Text>
            <Text style={s.price}>{fmt(b.price)}</Text>
          </View>
          <View style={s.actions}>
            <Pressable style={s.mini}><Text style={s.miniT}>Показать в клубе</Text></Pressable>
            <Pressable style={[s.mini, s.miniDg]} onPress={() => ask(b.id, b.courtName)}>
              <Text style={[s.miniT, { color: C.red }]}>Отменить</Text>
            </Pressable>
          </View>
        </View>
        ))}
      </>}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  empty: { paddingTop: 84, paddingHorizontal: 40, alignItems: 'center' },
  emptyIcon: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(198,240,51,.26)', backgroundColor: 'rgba(198,240,51,.07)',
    marginBottom: 18 },
  emptyBtn: { marginTop: 20, paddingHorizontal: 22, paddingVertical: 14, borderRadius: R.lg,
    backgroundColor: C.lime },
  emptyBtnT: { color: C.onLime, fontSize: 15.5, fontWeight: '700' },
  emptyT: { color: C.text, fontSize: 19, fontWeight: '700' },
  emptyS: { color: C.dim, fontSize: 13.5, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  cardT: { borderColor: 'rgba(198,240,51,.3)', backgroundColor: 'rgba(198,240,51,.05)' },
  tIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(198,240,51,.28)', backgroundColor: 'rgba(198,240,51,.08)' },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.xl,
    padding: 14, marginHorizontal: S.xl, marginBottom: 10 },
  head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  name: { color: C.text, fontSize: 17.5, fontWeight: '700' },
  date: { color: C.dim2, fontSize: 12, marginTop: 1 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 10 },
  time: { color: C.text, fontSize: 15.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  price: { color: C.dim, fontSize: 13, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  mini: { flex: 1, borderRadius: R.md, paddingVertical: 10, alignItems: 'center',
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2, minHeight: 40 },
  miniDg: { borderColor: 'rgba(229,100,75,.42)' },
  miniT: { color: C.dim, fontSize: 13, fontWeight: '600' },
});
