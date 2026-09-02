import { ScrollView, Text, View, Pressable, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S } from '../../src/theme';
import { TOURNAMENTS, fmt, type Tournament } from '../../src/data';
import { Pill, SectionTitle } from '../../src/components/ui';
import { TOURN_IMG } from '../../src/images';
import { IconCheck } from '../../src/components/icons';
import { useEntries, isEntered } from '../../src/store';

export default function Tournaments() {
  useEntries();                                    // перерисовка после записи
  const upcoming = TOURNAMENTS.filter(t => t.state !== 'done');
  const past = TOURNAMENTS.filter(t => t.state === 'done');
  const [hero, ...rest] = upcoming;

  const open = (t: Tournament) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/tournament', params: { id: t.id } });
  };

  const heroEntered = hero ? isEntered(hero.id) : false;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }} contentContainerStyle={{ paddingBottom: 30 }}>
      {hero && (
        <Pressable onPress={() => open(hero)}
          style={({ pressed }) => [s.hero, pressed && { transform: [{ scale: 0.99 }] }]}>
          <Image source={TOURN_IMG[hero.cover]} style={s.heroImg} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(9,13,10,.10)', 'rgba(9,13,10,.55)', 'rgba(9,13,10,.92)']}
            locations={[0, 0.5, 1]} style={s.heroScrim} />
          {heroEntered
            ? <View style={s.okFlag}><IconCheck size={12} color={C.onLime} />
                <Text style={s.flagT}>ВЫ ЗАПИСАНЫ</Text></View>
            : <View style={s.flag}><Text style={s.flagT}>РЕГИСТРАЦИЯ ОТКРЫТА</Text></View>}
          <View style={{ marginTop: 'auto' }}>
            <Text style={s.heroName}>{hero.name}</Text>
            <Text style={s.heroMeta}>
              {hero.date}, {hero.time} · {hero.format} ·{' '}
              <Text style={{ color: C.lime }}>
                осталось {hero.total - hero.taken - (heroEntered ? 1 : 0)} мест
              </Text>
            </Text>
          </View>
        </Pressable>
      )}

      <SectionTitle>Ближайшие</SectionTitle>
      {rest.map(t => <Row key={t.id} t={t} onPress={() => open(t)} />)}

      {past.length > 0 && (
        <>
          <SectionTitle>Прошедшие</SectionTitle>
          {past.map(t => <Row key={t.id} t={t} onPress={() => open(t)} past />)}
        </>
      )}
    </ScrollView>
  );
}

function Row({ t, onPress, past }: { t: Tournament; onPress: () => void; past?: boolean }) {
  const entered = isEntered(t.id);
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [s.row, past && { opacity: 0.72 }, pressed && { transform: [{ scale: 0.99 }] }]}>
      <View style={s.date}>
        <Text style={s.dateD}>{t.date.split(' ')[0]}</Text>
        <Text style={s.dateM}>{t.date.split(' ')[1].slice(0, 3)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowName}>{t.name}</Text>
        <Text style={s.rowMeta}>
          {past ? 'Итоги опубликованы' : `${t.time} · ${t.format} · взнос ${fmt(t.fee)}`}
        </Text>
      </View>
      {entered && !past
        ? <View style={s.rowOk}><IconCheck size={12} color={C.onLime} /></View>
        : <Pill text={past ? 'Завершён' : t.state === 'open' ? 'Открыт' : 'Скоро'}
            kind={past ? 'past' : t.state === 'open' ? 'ok' : 'wait'} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  hero: { marginHorizontal: S.xl, height: 200, borderRadius: 24, padding: S.lg,
    backgroundColor: '#1D4526', overflow: 'hidden' },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  heroScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  flag: { alignSelf: 'flex-start', backgroundColor: C.lime, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  okFlag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.lime, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  flagT: { color: C.onLime, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  heroName: { color: C.text, fontSize: 25, fontWeight: '800', lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 12 },
  heroMeta: { color: '#D6DECF', fontSize: 12.5, marginTop: 6, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl, marginBottom: 9,
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 12 },
  date: { width: 46, alignItems: 'center', borderRightWidth: 1, borderRightColor: C.line, paddingRight: 11 },
  dateD: { color: C.text, fontSize: 20, fontWeight: '700' },
  dateM: { color: C.dim2, fontSize: 9.5, letterSpacing: 0.8, fontWeight: '700' },
  rowName: { color: C.text, fontSize: 14, fontWeight: '700' },
  rowMeta: { color: C.dim2, fontSize: 11.5, marginTop: 2 },
  rowOk: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
});
