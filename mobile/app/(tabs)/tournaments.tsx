// Список турниров. Данные с сервера; если человек уже записывался,
// сервер по номеру телефона отмечает, на какие турниры он идёт.
import { useCallback } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, Image, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, DISP } from '../../src/theme';
import { api, rub, type ApiTournament } from '../../src/api';
import { useApi } from '../../src/useApi';
import { useProfile } from '../../src/profile';
import { Loading, Failed } from '../../src/components/status';
import { Pill, SectionTitle } from '../../src/components/ui';
import { TOURN_IMG } from '../../src/images';
import { IconCheck } from '../../src/components/icons';
import { hh, dayMonth, dateOfIso, hourOfIso } from '../../src/dates';

export default function Tournaments() {
  const { profile } = useProfile();
  const phone = profile?.phone;
  const q = useApi(() => api.tournaments(phone), [phone]);
  useFocusEffect(useCallback(() => { q.refresh() }, [phone]));

  if (q.loading) return <Loading note="Загружаю турниры" />;
  if (q.error) return <Failed message={q.error} onRetry={q.reload} />;

  const all = q.data ?? [];
  const upcoming = all.filter(t => t.state !== 'done');
  const past = all.filter(t => t.state === 'done');
  const [hero, ...rest] = upcoming;

  const open = (t: ApiTournament) => {
    Haptics.selectionAsync();
    router.push({ pathname: '/tournament', params: { id: String(t.id) } });
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }}
      contentContainerStyle={{ paddingBottom: 30 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={C.dim} />}>

      {hero && (
        <Pressable onPress={() => open(hero)}
          style={({ pressed }) => [s.hero, pressed && { transform: [{ scale: 0.99 }] }]}>
          <Image source={TOURN_IMG[hero.coverUrl ?? 't1'] ?? TOURN_IMG.t1}
            style={s.heroImg} resizeMode="cover" />
          <LinearGradient colors={['rgba(9,13,10,.10)', 'rgba(9,13,10,.55)', 'rgba(9,13,10,.92)']}
            locations={[0, 0.5, 1]} style={s.fill} />
          {hero.entered
            ? <View style={s.okFlag}><IconCheck size={12} color={C.onLime} />
                <Text style={s.flagT}>ВЫ ЗАПИСАНЫ</Text></View>
            : <View style={s.flag}><Text style={s.flagT}>
                {hero.state === 'open' ? 'РЕГИСТРАЦИЯ ОТКРЫТА' : 'СКОРО ОТКРОЕМ ЗАПИСЬ'}</Text></View>}
          <View style={{ marginTop: 'auto' }}>
            <Text style={s.heroName}>{hero.name}</Text>
            <Text style={s.heroMeta}>
              {dayMonth(dateOfIso(hero.startsAt))}, {hh(hourOfIso(hero.startsAt))} · {hero.format} ·{' '}
              <Text style={{ color: C.lime }}>осталось {Math.max(0, hero.seats - hero.taken)} мест</Text>
            </Text>
          </View>
        </Pressable>
      )}

      {rest.length > 0 && <SectionTitle>Ближайшие</SectionTitle>}
      {rest.map(t => <Row key={t.id} t={t} onPress={() => open(t)} />)}

      {past.length > 0 && (
        <>
          <SectionTitle>Прошедшие</SectionTitle>
          {past.map(t => <Row key={t.id} t={t} onPress={() => open(t)} past />)}
        </>
      )}

      {all.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyT}>Турниров пока нет</Text>
          <Text style={s.emptyS}>Клуб ещё не объявил ближайшие турниры.</Text>
        </View>
      )}
    </ScrollView>
  );
}

function Row({ t, onPress, past }: { t: ApiTournament; onPress: () => void; past?: boolean }) {
  const d = dateOfIso(t.startsAt);
  return (
    <Pressable onPress={onPress}
      style={({ pressed }) => [s.row, past && { opacity: 0.72 }, pressed && { transform: [{ scale: 0.99 }] }]}>
      <View style={s.date}>
        <Text style={s.dateD}>{dayMonth(d).split(' ')[0]}</Text>
        <Text style={s.dateM}>{dayMonth(d).split(' ')[1].slice(0, 3)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowName}>{t.name}</Text>
        <Text style={s.rowMeta}>
          {past ? (t.result ? 'Итоги опубликованы' : 'Завершён')
                : `${hh(hourOfIso(t.startsAt))} · ${t.format} · взнос ${rub(t.fee)}`}
        </Text>
      </View>
      {t.entered && !past
        ? <View style={s.rowOk}><IconCheck size={12} color={C.onLime} /></View>
        : <Pill text={past ? 'Завершён' : t.state === 'open' ? 'Открыт' : 'Скоро'}
            kind={past ? 'past' : t.state === 'open' ? 'ok' : 'wait'} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  hero: { marginHorizontal: S.xl, height: 200, borderRadius: 24, padding: S.lg,
    backgroundColor: '#1D4526', overflow: 'hidden', marginTop: 8 },
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  flag: { alignSelf: 'flex-start', backgroundColor: C.lime, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  okFlag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.lime, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  flagT: { color: C.onLime, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  heroName: { color: C.text, fontFamily: DISP, fontSize: 26, letterSpacing: 0.4,
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

  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 40 },
  emptyT: { color: C.text, fontSize: 19, fontWeight: '700' },
  emptyS: { color: C.dim, fontSize: 13.5, marginTop: 8, textAlign: 'center' },
});
