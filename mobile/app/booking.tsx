// Одна запись: всё про неё на своём экране — состояние, время, из чего
// сложилась сумма и что делать дальше. Список «Моих записей» от этого
// остаётся коротким, а подробности не теряются.
import { useCallback } from 'react';
import { ScrollView, Text, View, Pressable, Alert, Platform, RefreshControl } from 'react-native';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, type ApiBooking } from '../src/api';
import { useApi } from '../src/useApi';
import { fullName, useProfile, type Profile } from '../src/profile';
import { whatsappUrl, useClub } from '../src/club';
import { openLink } from '../src/components/contacts';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { bookingState, StateIcon } from '../src/components/bookingstate';
import { dueOf } from './(tabs)/bookings';
import { hh, longDate, dateOfIso, plural } from '../src/dates';

export default function BookingScreen() {
  useTheme();
  const club = useClub();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, signedIn } = useProfile();
  const phone = signedIn ? (profile?.phone ?? '') : '';

  const q = useApi(async () => {
    if (!phone) return null;
    const rows = await api.myBookings(phone);
    return rows.find(x => String(x.id) === String(id)) ?? null;
    // Свой ключ кэша: под `mine.<номер>` лежит весь список вкладки «Мои записи»,
    // и экран одной брони на нём спотыкался
  }, [phone, id], phone ? `bk.${phone}.${id}` : undefined);

  useFocusEffect(useCallback(() => { if (phone) q.refresh() }, [phone, id]));

  const screen = <Stack.Screen options={{ title: 'Запись' }} />;
  if (q.loading) return <>{screen}<Loading note="Открываю запись" /></>;
  if (q.error) return <>{screen}<Failed message={q.error} onRetry={q.reload} /></>;
  const b = q.data;
  if (!b) return (<>{screen}
    <NotFound title="Запись не найдена" note="Возможно, её уже нет. Все ваши записи — во вкладке «Мои записи»." />
  </>);

  const st = bookingState(b);
  const paid = b.paid ?? 0, due = dueOf(b);
  const left = Math.max(0, due - paid);
  const prepay = Math.ceil(due * club.prepayPercent / 100 / 100) * 100;

  const who = (p: Profile | null) =>
    p ? [`Меня зовут ${fullName(p)}.`, p.id ? `ID ${p.id}.` : ''].filter(Boolean) : [];

  const writeManager = (text: string) => {
    const wa = whatsappUrl();
    if (!wa) {
      const m = 'WhatsApp клуба пока не указан.';
      Platform.OS === 'web' ? alert(m) : Alert.alert('Не получилось', m);
      return;
    }
    Haptics.selectionAsync();
    openLink(`${wa}?text=${encodeURIComponent(text)}`, 'Напишите менеджеру в WhatsApp вручную.');
  };
  const askCancel = () => writeManager([
    `Хочу отменить бронь: ${b.courtName}, ${longDate(dateOfIso(b.startsAt))}, ${hh(b.hour)} – ${hh(b.hour + b.hours)}.`,
    `Заявка №${b.id}.`, ...who(profile),
  ].join('\n'));
  const askQuestion = () => writeManager([
    `Вопрос по записи: ${b.courtName}, ${longDate(dateOfIso(b.startsAt))}, ${hh(b.hour)} – ${hh(b.hour + b.hours)}.`,
    `Заявка №${b.id}.`, ...who(profile),
  ].join('\n'));

  return (
    <>
      {screen}
      <ScrollView style={{ flex: 1, backgroundColor: C.ink }}
        contentContainerStyle={{ paddingBottom: 40, paddingTop: 10 }}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

        {/* Состояние — первое, что видит человек */}
        <View style={[s.state, { backgroundColor: st.bg }]}>
          <StateIcon state={st} size={14} />
          <Text style={[s.stateT, { color: st.fg }]}>{st.label}</Text>
        </View>
        <Text style={[s.note, st.warn && { color: C.amber }]}>{st.note}</Text>

        <View style={s.card}>
          <Row k="Площадка" v={b.courtName} />
          {!!b.coachName && <Row k="Тренер" v={b.coachName} />}
          <Row k="Дата" v={longDate(dateOfIso(b.startsAt))} />
          <Row k="Время" v={`${hh(b.hour)} – ${hh(b.hour + b.hours)}`} mono />
          <Row k="Длительность" v={`${b.hours} ${plural(b.hours, 'час', 'часа', 'часов')}`} />
        </View>

        <Text style={s.sec}>Деньги</Text>
        <View style={s.card}>
          {!!b.coachPrice && <Row k="Тренировка" v={rub(b.coachPrice)} />}
          {(!b.coachPrice || !!b.price) && <Row k="Корт" v={b.price ? rub(b.price) : 'входит в тренировку'} />}
          {!!b.discount && <Row k="Скидка клуба" v={`−${rub(b.discount)}`} accent />}
          {(b.extras ?? []).map((x, i) => (
            <Row key={i} k={`${x.item}${x.qty > 1 ? ` × ${x.qty}` : ''}`} v={rub(x.amount)} />
          ))}
          <Row k="Итого" v={rub(due)} total />
          {paid > 0 && <Row k="Внесено" v={rub(paid)} />}
          {!st.dim && left > 0 && paid > 0 && <Row k="Осталось" v={rub(left)} />}
          {!st.dim && paid <= 0 && due > 0 && (
            <Row k={`Предоплата ${club.prepayPercent} %`} v={rub(prepay)} />
          )}
          {st.dim && paid > 0 && (
            <Row k={b.keptPrepay ? 'Предоплата' : 'Клуб вернёт'}
              v={b.keptPrepay ? `${rub(paid)} остаётся клубу` : rub(paid)} />
          )}
          {!!b.refunded && <Row k="Возвращено" v={rub(b.refunded)} />}
        </View>

        {!st.dim && (
          <Text style={s.hint}>
            {club.bookingNote?.trim() || 'Входит только корт. Ракетки и мячи — отдельно.'}
          </Text>
        )}

        <View style={s.acts}>
          <Pressable onPress={askQuestion} accessibilityRole="button"
            style={({ pressed }) => [s.btn, pressed && { opacity: 0.85 }]}>
            <Text style={s.btnT}>Написать менеджеру</Text>
          </Pressable>
          {st.canCancel && (
            <Pressable onPress={askCancel} accessibilityRole="button"
              style={({ pressed }) => [s.btn, s.btnDg, pressed && { opacity: 0.85 }]}>
              <Text style={[s.btnT, { color: C.dangerText }]}>Отменить запись</Text>
            </Pressable>
          )}
          {st.dim && (
            <Pressable onPress={() => router.push('/courts')} accessibilityRole="button"
              style={({ pressed }) => [s.btn, s.btnAcc, pressed && { opacity: 0.9 }]}>
              <Text style={[s.btnT, { color: C.onLime }]}>Записаться снова</Text>
            </Pressable>
          )}
        </View>

        <Text style={s.small}>Заявка №{b.id}</Text>
      </ScrollView>
    </>
  );
}

function Row({ k, v, mono, total, accent }: {
  k: string; v: string; mono?: boolean; total?: boolean; accent?: boolean;
}) {
  return (
    <View style={[s.row, total && s.rowTotal]}>
      <Text style={s.rowK}>{k}</Text>
      <Text style={[s.rowV, total && s.rowVTotal, accent && { color: C.amber },
        (mono || total) && { fontVariant: ['tabular-nums'] }]}>{v}</Text>
    </View>
  );
}

const s = sheet(() => ({
  state: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    marginHorizontal: S.xl, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 },
  stateT: { ...EYEBROW },
  note: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 20,
    marginHorizontal: S.xl, marginTop: 10 },

  sec: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1, borderRadius: R.xl,
    padding: S.lg, marginHorizontal: S.xl, marginTop: 14 },

  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, gap: 14 },
  rowTotal: { borderTopColor: C.line, borderTopWidth: 1, marginTop: 4, paddingTop: 12 },
  rowK: { fontFamily: BODY, color: C.dim2, fontSize: 14 },
  rowV: { fontFamily: BODY, color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  rowVTotal: { color: C.accent, fontFamily: DISP, fontSize: 22, letterSpacing: -1 },

  hint: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 18,
    marginHorizontal: S.xl, marginTop: 10 },

  acts: { marginHorizontal: S.xl, marginTop: 22, gap: 10 },
  btn: { borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.lg, paddingVertical: 15,
    alignItems: 'center', minHeight: HIT, justifyContent: 'center' },
  btnDg: { borderColor: C.dangerBorder },
  btnAcc: { backgroundColor: C.lime, borderColor: C.lime },
  btnT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase' },

  small: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 18 },
}));
