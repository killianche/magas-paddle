// Карточка турнира. Ровно то, что нужно клубу: записаться, видеть что записан,
// видеть когда играть. Сетка, счёт и жеребьёвка — вживую, в приложении их нет.
// Когда турнир прошёл, менеджер меняет обложку и пишет итог — экран показывает их.
import { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, Image, Platform, Alert } from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT } from '../src/theme';
import { tournamentById, fmt, CLUB } from '../src/data';
import { TOURN_IMG } from '../src/images';
import { IconCheck } from '../src/components/icons';
import { useEntries, isEntered, enterTournament, leaveTournament } from '../src/store';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = tournamentById(String(id));
  useEntries();                        // перерисовка при записи и отмене
  const [justEntered, setJustEntered] = useState(false);

  if (!t) return null;

  const entered = isEntered(t.id);
  const left = t.total - t.taken - (entered ? 1 : 0);
  const done = t.state === 'done';
  const canEnter = t.state === 'open' && left > 0;

  const enter = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    enterTournament(t.id);
    setJustEntered(true);
  };

  const leave = () => {
    const title = `Отменить запись на «${t.name}»?`;
    const msg = 'Место освободится для других игроков. Записаться заново можно, пока есть места.';
    const go = () => { leaveTournament(t.id); setJustEntered(false) };
    if (Platform.OS === 'web') { if (confirm(title + '\n\n' + msg)) go(); return }
    Alert.alert(title, msg, [
      { text: 'Оставить', style: 'cancel' },
      { text: 'Отменить запись', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <Stack.Screen options={{ title: done ? 'Турнир завершён' : 'Турнир' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: done ? 40 : 200 }}>

        <View style={s.cover}>
          <Image source={TOURN_IMG[t.cover]} style={s.coverImg} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(9,13,10,.12)', 'rgba(9,13,10,.58)', 'rgba(9,13,10,.94)']}
            locations={[0, 0.5, 1]} style={s.coverScrim} />
          <View style={s.coverIn}>
            {done
              ? <View style={s.doneFlag}><Text style={s.doneFlagT}>ЗАВЕРШЁН</Text></View>
              : entered
                ? <View style={s.okFlag}><IconCheck size={12} color={C.onLime} /><Text style={s.okFlagT}>ВЫ ЗАПИСАНЫ</Text></View>
                : t.state === 'open'
                  ? <View style={s.openFlag}><Text style={s.openFlagT}>РЕГИСТРАЦИЯ ОТКРЫТА</Text></View>
                  : <View style={s.soonFlag}><Text style={s.soonFlagT}>СКОРО ОТКРОЕМ ЗАПИСЬ</Text></View>}
            <Text style={s.name}>{t.name}</Text>
          </View>
        </View>

        {/* Когда играть — самое важное для записавшегося */}
        <View style={s.when}>
          <View style={s.whenBlock}>
            <Text style={s.whenK}>Дата</Text>
            <Text style={s.whenV}>{t.date}</Text>
            <Text style={s.whenS}>{t.weekday}</Text>
          </View>
          <View style={s.whenDiv} />
          <View style={s.whenBlock}>
            <Text style={s.whenK}>Начало</Text>
            <Text style={s.whenV}>{t.time}</Text>
            <Text style={s.whenS}>{done ? 'турнир прошёл' : 'сбор за 20 минут'}</Text>
          </View>
        </View>

        {done && t.result && (
          <View style={s.resultCard}>
            <Text style={s.resultK}>ИТОГИ</Text>
            <Text style={s.resultT}>{t.result}</Text>
          </View>
        )}

        <View style={s.facts}>
          <Fact k="Формат" v={t.format} />
          <Fact k="Взнос" v={fmt(t.fee)} />
          <Fact k="Место" v={`${CLUB.name}, ${CLUB.city}`} />
          <Fact k={done ? 'Участников было' : 'Свободных мест'}
            v={done ? String(t.total) : `${left} из ${t.total}`} last />
        </View>

        {entered && !done && (
          <View style={s.enteredNote}>
            <Text style={s.enteredT}>
              Пары составят на месте — партнёра искать заранее не нужно.
              Если передумаете, отмените запись, чтобы место досталось другому.
            </Text>
            <Pressable onPress={leave} style={({ pressed }) => [s.leave, pressed && { opacity: 0.7 }]}>
              <Text style={s.leaveT}>Отменить запись</Text>
            </Pressable>
          </View>
        )}

        {!entered && !done && t.state === 'soon' && (
          <View style={s.note}>
            <Text style={s.noteT}>
              Запись откроется ближе к дате. Мы пришлём уведомление, когда можно будет записаться.
            </Text>
          </View>
        )}

        {!entered && !done && t.state === 'open' && left === 0 && (
          <View style={s.note}>
            <Text style={s.noteT}>
              Все места заняты. Если кто-то откажется, место освободится — мы сообщим.
            </Text>
          </View>
        )}
      </ScrollView>

      {!done && (
        <View style={s.bar}>
          {entered ? (
            <>
              <View style={s.barOk}>
                <View style={s.barOkIcon}><IconCheck size={15} color={C.onLime} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={s.barOkT}>Вы записаны</Text>
                  <Text style={s.barOkS}>{t.date}, {t.time} · взнос {fmt(t.fee)} на месте</Text>
                </View>
              </View>
              {justEntered && (
                <Pressable onPress={() => router.replace('/bookings')}
                  style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }]}>
                  <Text style={s.ghostT}>Открыть мои записи</Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Pressable onPress={enter} disabled={!canEnter}
                style={({ pressed }) => [s.cta, !canEnter && s.ctaOff, pressed && canEnter && { opacity: 0.9 }]}>
                <Text style={[s.ctaT, !canEnter && { color: C.dim2 }]}>
                  {t.state === 'soon' ? 'Запись ещё не открыта'
                    : left === 0 ? 'Мест нет' : 'Записаться на турнир'}
                </Text>
              </Pressable>
              {canEnter && (
                <Text style={s.barSub}>Взнос {fmt(t.fee)} оплачивается в клубе</Text>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function Fact({ k, v, last }: { k: string; v: string; last?: boolean }) {
  return (
    <View style={[s.fact, last && { borderBottomWidth: 0 }]}>
      <Text style={s.factK}>{k}</Text>
      <Text style={s.factV}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  cover: { height: 230, justifyContent: 'flex-end', overflow: 'hidden' },
  coverImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  coverScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  coverIn: { padding: S.xl },
  name: { color: C.text, fontSize: 26, fontWeight: '800', lineHeight: 30, marginTop: 11,
    textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 12 },

  openFlag: { alignSelf: 'flex-start', backgroundColor: C.lime, borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10 },
  openFlagT: { color: C.onLime, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  soonFlag: { alignSelf: 'flex-start', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'rgba(240,169,59,.5)', backgroundColor: 'rgba(240,169,59,.14)' },
  soonFlagT: { color: C.amber, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  okFlag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: C.lime, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  okFlagT: { color: C.onLime, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },
  doneFlag: { alignSelf: 'flex-start', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: 'rgba(23,30,22,.8)' },
  doneFlagT: { color: C.dim, fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8 },

  when: { flexDirection: 'row', alignItems: 'stretch', marginHorizontal: S.xl, marginTop: 16,
    borderWidth: 1, borderColor: C.line, borderRadius: R.xl, backgroundColor: C.surface },
  whenBlock: { flex: 1, padding: 15 },
  whenDiv: { width: 1, backgroundColor: C.line },
  whenK: { color: C.dim2, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  whenV: { color: C.text, fontSize: 21, fontWeight: '800', marginTop: 5, letterSpacing: -0.3 },
  whenS: { color: C.dim2, fontSize: 11.5, marginTop: 2 },

  resultCard: { marginHorizontal: S.xl, marginTop: 12, padding: 15, borderRadius: R.xl,
    borderWidth: 1, borderColor: 'rgba(198,240,51,.28)', backgroundColor: 'rgba(198,240,51,.06)' },
  resultK: { color: C.limeDim, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.9 },
  resultT: { color: C.text, fontSize: 15, lineHeight: 22, marginTop: 7 },

  facts: { marginHorizontal: S.xl, marginTop: 12, borderWidth: 1, borderColor: C.line,
    borderRadius: R.xl, backgroundColor: C.surface, paddingHorizontal: 15 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  factK: { color: C.dim, fontSize: 14, flex: 1 },
  factV: { color: C.text, fontSize: 14.5, fontWeight: '600', textAlign: 'right', flexShrink: 1 },

  enteredNote: { marginHorizontal: S.xl, marginTop: 12, padding: 15, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  enteredT: { color: C.dim, fontSize: 13.5, lineHeight: 20 },
  leave: { marginTop: 12, minHeight: HIT, justifyContent: 'center' },
  leaveT: { color: C.red, fontSize: 14.5, fontWeight: '600' },

  note: { marginHorizontal: S.xl, marginTop: 12, padding: 13, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  noteT: { color: '#DFCCA8', fontSize: 13, lineHeight: 19 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink,
    borderTopWidth: 1, borderTopColor: C.lineSoft },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 17, alignItems: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  ctaT: { color: C.onLime, fontSize: 17, fontWeight: '700' },
  barSub: { color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },
  barOk: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  barOkIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  barOkT: { color: C.text, fontSize: 15.5, fontWeight: '700' },
  barOkS: { color: C.dim2, fontSize: 12, marginTop: 1 },
  ghost: { marginTop: 11, paddingVertical: 13, borderRadius: R.lg, alignItems: 'center',
    borderWidth: 1, borderColor: C.lineStrong },
  ghostT: { color: C.text, fontSize: 14.5, fontWeight: '600' },
});
