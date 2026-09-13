// Карточка турнира: записаться, видеть что записан, видеть когда играть.
// Сетка и счёт — вживую, в приложении их нет.
import { useCallback, useState } from 'react';
import {
  ScrollView, Text, View, Pressable, StyleSheet, Image, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, Stack, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, ApiError } from '../src/api';
import { useApi } from '../src/useApi';
import { fullName, saveToken, useProfile, type Profile } from '../src/profile';
import { TOURN_IMG } from '../src/images';
import { IconCheck, IconClock, IconWhatsApp } from '../src/components/icons';
import { WhoSheet } from '../src/components/booking';
import { openLink } from '../src/components/contacts';
import { whatsappUrl } from '../src/club';
import { holdLeft } from '../src/components/bookingstate';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { hh, dayMonth, weekday, dateOfIso, hourOfIso, longDate, plural } from '../src/dates';

export default function TournamentScreen() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, save } = useProfile();
  const [ask, setAsk] = useState(false);
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

  const pending = t.entry?.status === 'pending';
  const confirmed = t.entry?.status === 'confirmed';
  const left_min = t.entry ? holdLeft({ status: t.entry.status, holdUntil: t.entry.holdUntil }) : null;

  // Запись — как бронь корта: без аккаунта спрашиваем, кто записывается;
  // заявка держит место, человек пишет менеджеру в WhatsApp готовым текстом,
  // затем экран «Заявка отправлена». Менеджер подтверждает в админке.
  const enter = async () => {
    if (!profile) { setAsk(true); return }
    await sendEntry(profile);
  };

  const sendEntry = async (who: Profile) => {
    setBusy(true);
    try {
      const res = await api.enterTournament(t.id,
        { name: who.name, surname: who.surname, phone: who.phone });
      // ID аккаунта становится известен с первой заявкой — запоминаем
      if (res.clientId && who.id !== res.clientId) await save({ ...who, id: res.clientId });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setAsk(false);

      const wa = whatsappUrl();
      if (wa) {
        const text = [
          `Хочу записаться на турнир «${t.name}», ${longDate(date)}, начало в ${hh(hourOfIso(t.startsAt))}. `
            + `Взнос ${rub(t.fee)}.`,
          `Меня зовут ${fullName(who)}.`,
          `ID ${res.clientId}.`,
          `Заявка на турнир №${res.id} в приложении.`,
        ].join('\n');
        await openLink(`${wa}?text=${encodeURIComponent(text)}`, 'Напишите менеджеру в WhatsApp вручную.');
      }
      router.replace({ pathname: '/sent', params: {
        kind: 'tournament', id: String(res.id), name: t.name, date,
        hour: String(hourOfIso(t.startsAt)), hours: String(t.hours ?? 1),
        price: String(t.fee), holdUntil: res.holdUntil ?? '' } });
    } catch (e) {
      const m = e instanceof ApiError ? e.message : 'Не получилось отправить заявку.';
      Platform.OS === 'web' ? alert(m) : Alert.alert('Не вышло', m);
      q.refresh();
    } finally { setBusy(false) }
  };

  /** Ответ из окна «Кто записывается»: запоминаем человека и отправляем заявку. */
  const withWho = async (p: Profile, token?: string) => {
    if (token) await saveToken(token);
    await save(p);
    await sendEntry(p);
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
              : pending ? <Flag text="ЖДЁТ ПОДТВЕРЖДЕНИЯ" warn />
              : confirmed || t.entered ? <Flag text="ВЫ ЗАПИСАНЫ" ok />
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
          {pending ? (
            <View style={s.barOk}>
              <View style={[s.barOkIcon, { backgroundColor: C.warnSoft }]}>
                <IconClock size={16} color={C.amber} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.barOkT}>Заявка отправлена</Text>
                <Text style={s.barOkS}>
                  Ждёт подтверждения менеджера{left_min ? ` · место держим ещё ${left_min} ${plural(left_min, 'минуту', 'минуты', 'минут')}` : ''}
                </Text>
              </View>
            </View>
          ) : t.entered ? (
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
                accessibilityRole="button"
                style={({ pressed }) => [s.cta, canEnter && s.ctaWa, !canEnter && s.ctaOff,
                  pressed && canEnter && { opacity: 0.9 }]}>
                {busy ? <ActivityIndicator color={C.onWa} />
                  : canEnter ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <IconWhatsApp size={20} color={C.onWa} />
                      <Text style={[s.ctaT, { color: C.onWa }]}>Записаться в WhatsApp</Text>
                    </View>
                  ) : (
                    <Text style={[s.ctaT, { color: C.dim2 }]}>
                      {t.state === 'soon' ? 'Запись ещё не открыта' : 'Мест нет'}
                    </Text>
                  )}
              </Pressable>
              {canEnter && <Text style={s.barSub}>Взнос {rub(t.fee)} оплачивается в клубе</Text>}
            </>
          )}
        </View>
      )}

      <WhoSheet visible={ask} title="Кто записывается"
        onCancel={() => setAsk(false)} onDone={withWho} />
    </View>
  );
}

function Flag({ text, ok, warn, muted }: { text: string; ok?: boolean; warn?: boolean; muted?: boolean }) {
  return (
    <View style={[s.flag,
      ok && { backgroundColor: C.lime, borderColor: C.lime },
      // Плашка стоит на фотографии — цвета как в тёмной теме, в любой теме
      warn && { borderColor: 'rgba(240,169,59,.5)', backgroundColor: 'rgba(240,169,59,.14)' },
      muted && { borderColor: 'rgba(255,255,255,.24)', backgroundColor: 'rgba(23,30,22,.8)' }]}>
      <Text style={[s.flagT, ok && { color: C.onLime }, warn && { color: '#F0A93B' }, muted && { color: '#A5B0A8' }]}>
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

const s = sheet(() => ({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  cover: { height: 230, justifyContent: 'flex-end', overflow: 'hidden' },
  coverImg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  coverIn: { padding: S.xl },
  name: { ...TITLE.page, color: '#F5F8F2', marginTop: 12, textTransform: 'uppercase',   // поверх фото
    textShadowColor: 'rgba(0,0,0,.6)', textShadowRadius: 12 },
  flag: { alignSelf: 'flex-start', borderRadius: R.sm, paddingVertical: 5, paddingHorizontal: 10,
    borderWidth: 1, borderColor: 'transparent' },
  flagT: { ...EYEBROW, color: '#F5F8F2' },

  when: { flexDirection: 'row', marginHorizontal: S.xl, marginTop: 16,
    borderWidth: 1, borderColor: C.line, borderRadius: R.xl, backgroundColor: C.surface },
  whenBlock: { flex: 1, padding: 15 },
  whenDiv: { width: 1, backgroundColor: C.line },
  whenK: { ...EYEBROW, color: C.dim2 },
  whenV: { ...TITLE.section, color: C.text, marginTop: 6, textTransform: 'uppercase' },
  whenS: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, marginTop: 2 },

  resultCard: { marginHorizontal: S.xl, marginTop: 12, padding: 15, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.accentBorder, backgroundColor: C.accentSoft },
  resultK: { ...EYEBROW, color: C.limeDim },
  resultT: { fontFamily: BODY, color: C.text, fontSize: 15, lineHeight: 22, marginTop: 7 },

  facts: { marginHorizontal: S.xl, marginTop: 12, borderWidth: 1, borderColor: C.line,
    borderRadius: R.xl, backgroundColor: C.surface, paddingHorizontal: 15 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  factK: { fontFamily: BODY, color: C.dim, fontSize: 14, flex: 1 },
  factV: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2,
    textAlign: 'right', flexShrink: 1 },

  enteredNote: { marginHorizontal: S.xl, marginTop: 12, padding: 15, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  enteredT: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 20 },
  leave: { marginTop: 12, minHeight: HIT, justifyContent: 'center' },
  leaveT: { color: C.red, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink2,
    borderTopWidth: 1, borderTopColor: C.lineSoft },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 17,
    alignItems: 'center', minHeight: HIT + 10, justifyContent: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  // Записаться — как забронировать корт: кнопка цвета WhatsApp
  ctaWa: { backgroundColor: C.wa },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  barSub: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },
  barOk: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 4 },
  barOkIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  barOkT: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  barOkS: { fontFamily: BODY, color: C.dim2, fontSize: 12, marginTop: 1 },
}));
