// Карточка турнира: записаться, видеть что записан, видеть когда играть.
// Сетка и счёт — вживую, в приложении их нет.
import { useCallback, useState } from 'react';
import {
  ScrollView, Text, View, Pressable, StyleSheet, Image, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP } from '../src/theme';
import { api, rub, ApiError } from '../src/api';
import { useApi } from '../src/useApi';
import { useProfile } from '../src/profile';
import { TOURN_IMG } from '../src/images';
import { IconCheck } from '../src/components/icons';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { hh, dayMonth, weekday, dateOfIso, hourOfIso } from '../src/dates';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useProfile();
  const phone = profile?.phone;
  const [busy, setBusy] = useState(false);

  const q = useApi(async () => {
    const all = await api.tournaments(phone);
    return all.find(t => String(t.id) === String(id)) ?? null;
  }, [id, phone]);
  useFocusEffect(useCallback(() => { q.refresh() }, [id, phone]));

  if (q.loading) return (<><Stack.Screen options={{ title: 'Турнир' }} /><Loading /></>);
  if (q.error) return (<><Stack.Screen options={{ title: 'Турнир' }} />
    <Failed message={q.error} onRetry={q.reload} /></>);

  const t = q.data;
  if (!t) return (
    <NotFound title="Турнир не найден"
      note="Возможно, он уже прошёл и его убрали. Все турниры — во вкладке «Турниры»." />
  );

  const date = dateOfIso(t.startsAt);
  const left = Math.max(0, t.seats - t.taken);
  const done = t.state === 'done';
  const canEnter = t.state === 'open' && left > 0 && !t.entered;

  const enter = async () => {
    if (!profile) {
      const msg = 'Сначала запишитесь на корт — тогда мы будем знать, как вас зовут и как с вами связаться.';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('Нужны имя и телефон', msg);
      return;
    }
    setBusy(true);
    try {
      await api.enterTournament(t.id, profile.name, profile.phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      q.refresh();
    } catch (e) {
      const m = e instanceof ApiError ? e.message : 'Не получилось записаться.';
      Platform.OS === 'web' ? alert(m) : Alert.alert('Не вышло', m);
    } finally { setBusy(false) }
  };

  const leave = () => {
    if (!phone) return;
    const go = async () => {
      setBusy(true);
      try { await api.leaveTournament(t.id, phone); q.refresh() }
      catch (e) {
        const m = e instanceof ApiError ? e.message : 'Не получилось отменить.';
        Platform.OS === 'web' ? alert(m) : Alert.alert('Не вышло', m);
      } finally { setBusy(false) }
    };
    const title = `Отменить запись на «${t.name}»?`;
    const msg = 'Место освободится для других игроков.';
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
          <Image source={TOURN_IMG[t.coverUrl ?? 't1'] ?? TOURN_IMG.t1}
            style={s.coverImg} resizeMode="cover" />
          <LinearGradient colors={['rgba(9,13,10,.12)', 'rgba(9,13,10,.58)', 'rgba(9,13,10,.94)']}
            locations={[0, 0.5, 1]} style={s.fill} />
          <View style={s.coverIn}>
            {done ? <Flag text="ЗАВЕРШЁН" muted />
              : t.entered ? <Flag text="ВЫ ЗАПИСАНЫ" ok />
              : t.state === 'open' ? <Flag text="РЕГИСТРАЦИЯ ОТКРЫТА" ok />
              : <Flag text="СКОРО ОТКРОЕМ ЗАПИСЬ" warn />}
            <Text style={s.name}>{t.name}</Text>
          </View>
        </View>

        <View style={s.when}>
          <View style={s.whenBlock}>
            <Text style={s.whenK}>Дата</Text>
            <Text style={s.whenV}>{dayMonth(date)}</Text>
            <Text style={s.whenS}>{weekday(date)}</Text>
          </View>
          <View style={s.whenDiv} />
          <View style={s.whenBlock}>
            <Text style={s.whenK}>Начало</Text>
            <Text style={s.whenV}>{hh(hourOfIso(t.startsAt))}</Text>
            <Text style={s.whenS}>{done ? 'турнир прошёл' : 'сбор за 20 минут'}</Text>
          </View>
        </View>

        {done && !!t.result && (
          <View style={s.resultCard}>
            <Text style={s.resultK}>ИТОГИ</Text>
            <Text style={s.resultT}>{t.result}</Text>
          </View>
        )}

        <View style={s.facts}>
          <Fact k="Формат" v={t.format} />
          <Fact k="Взнос" v={rub(t.fee)} />
          <Fact k={done ? 'Участников было' : 'Свободных мест'}
            v={done ? String(t.seats) : `${left} из ${t.seats}`} last />
        </View>

        {t.entered && !done && (
          <View style={s.enteredNote}>
            <Text style={s.enteredT}>
              Пары составят на месте — партнёра искать заранее не нужно.
              Если передумаете, отмените запись, чтобы место досталось другому.
            </Text>
            <Pressable onPress={leave} disabled={busy}
              style={({ pressed }) => [s.leave, pressed && { opacity: 0.7 }]}>
              <Text style={s.leaveT}>Отменить запись</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {!done && (
        <View style={s.bar}>
          {t.entered ? (
            <View style={s.barOk}>
              <View style={s.barOkIcon}><IconCheck size={15} color={C.onLime} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.barOkT}>Вы записаны</Text>
                <Text style={s.barOkS}>
                  {dayMonth(date)}, {hh(hourOfIso(t.startsAt))} · взнос {rub(t.fee)} на месте
                </Text>
              </View>
            </View>
          ) : (
            <>
              <Pressable onPress={enter} disabled={!canEnter || busy}
                style={({ pressed }) => [s.cta, !canEnter && s.ctaOff, pressed && canEnter && { opacity: 0.9 }]}>
                {busy ? <ActivityIndicator color={C.onLime} />
                  : <Text style={[s.ctaT, !canEnter && { color: C.dim2 }]}>
                      {t.state === 'soon' ? 'Запись ещё не открыта'
                        : left === 0 ? 'Мест нет' : 'Записаться на турнир'}
                    </Text>}
              </Pressable>
              {canEnter && <Text style={s.barSub}>Взнос {rub(t.fee)} оплачивается в клубе</Text>}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function Flag({ text, ok, warn, muted }: { text: string; ok?: boolean; warn?: boolean; muted?: boolean }) {
  return (
    <View style={[s.flag,
      ok && { backgroundColor: C.lime, borderColor: C.lime },
      warn && { borderColor: 'rgba(240,169,59,.5)', backgroundColor: 'rgba(240,169,59,.14)' },
      muted && { borderColor: C.lineStrong, backgroundColor: 'rgba(23,30,22,.8)' }]}>
      <Text style={[s.flagT, ok && { color: C.onLime }, warn && { color: C.amber }, muted && { color: C.dim }]}>
        {text}
      </Text>
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
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cover: { height: 230, justifyContent: 'flex-end', overflow: 'hidden' },
  coverImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  coverIn: { padding: S.xl },
  name: { color: C.text, fontFamily: DISP, fontSize: 28, lineHeight: 32, marginTop: 11,
    letterSpacing: 0.3, textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 12 },
  flag: { alignSelf: 'flex-start', borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'transparent' },
  flagT: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, color: C.text },

  when: { flexDirection: 'row', marginHorizontal: S.xl, marginTop: 16,
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

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink2,
    borderTopWidth: 1, borderTopColor: C.lineSoft },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 17,
    alignItems: 'center', minHeight: HIT + 10, justifyContent: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  ctaT: { color: C.onLime, fontSize: 17, fontWeight: '700' },
  barSub: { color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },
  barOk: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  barOkIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  barOkT: { color: C.text, fontSize: 15.5, fontWeight: '700' },
  barOkS: { color: C.dim2, fontSize: 12, marginTop: 1 },
});
