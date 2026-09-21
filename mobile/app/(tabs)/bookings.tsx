// Мои записи. Список читается за секунду: слева дата, в строке — где, когда
// и сколько, справа состояние. Подробности, деньги и связь с менеджером —
// на отдельном экране записи, чтобы список не разрастался.
//
// Порядок: сначала ближайшие игры (самая близкая сверху), потом прошедшие
// от свежих к старым. Раньше сервер отдавал всё по возрастанию времени,
// и сверху оказывались давние записи.
import { useCallback, useState } from 'react';
import { ScrollView, Text, View, Pressable, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, TAB_SPACE, sheet, useTheme } from '../../src/theme';
import { api, rub, type ApiBooking, type ApiTournament } from '../../src/api';
import { useApi } from '../../src/useApi';
import { useProfile } from '../../src/profile';
import { Loading, Failed } from '../../src/components/status';
import { IconRacket, IconChevron } from '../../src/components/icons';
import { bookingState, entryState, holdLeft, type BookingState } from '../../src/components/bookingstate';
import { hh, dayMonth, weekdayShort, dateOfIso, hourOfIso, plural } from '../../src/dates';

/** Сколько платить: корт и тренер со скидкой плюс строки счёта — как считает клуб. */
export const dueOf = (b: ApiBooking) =>
  Math.max(0, b.price + (b.coachPrice ?? 0) - (b.discount ?? 0)) + (b.extras ?? []).reduce((n, x) => n + x.amount, 0);

type Row =
  | { kind: 'booking'; at: number; b: ApiBooking; st: BookingState }
  | { kind: 'event'; at: number; t: ApiTournament; st: BookingState };

export default function Bookings() {
  useTheme();
  const { profile, ready, signedIn } = useProfile();
  const phone = signedIn ? (profile?.phone ?? '') : '';
  const [allPast, setAllPast] = useState(false);

  const q = useApi(async () => {
    if (!phone) return { bookings: [] as ApiBooking[], tournaments: [] as ApiTournament[] };
    const [bookings, tourn, classes] = await Promise.all([
      api.myBookings(phone), api.tournaments(phone), api.tournaments(phone, 'class').catch(() => [] as ApiTournament[]),
    ]);
    const tournaments = [...tourn, ...classes];
    return { bookings, tournaments: tournaments.filter(t =>
      t.entry ? t.entry.status !== 'cancelled' || !!t.entry.byClub : t.entered) };
  }, [phone], phone ? `mine.${phone}` : undefined);

  useFocusEffect(useCallback(() => { if (phone) q.refresh() }, [phone]));

  if (!ready) return <Loading />;
  if (!signedIn) return (
    <NeedLogin note={profile
      ? 'Ваши записи привязаны к аккаунту. Войдите — имя и телефон уже подставлены.'
      : 'Войдите или заведите аккаунт, чтобы видеть свои записи.'} />
  );
  if (!phone) return <Empty />;
  if (q.loading) return <Loading note="Смотрю ваши записи" />;
  if (q.error && /войд/i.test(q.error)) return <NeedLogin note={q.error} />;
  if (q.error) return <Failed message={q.error} onRetry={q.reload} />;

  const rows: Row[] = [
    ...(q.data?.bookings ?? []).map(b => ({
      kind: 'booking' as const, at: new Date(b.endsAt).getTime(), b, st: bookingState(b) })),
    ...(q.data?.tournaments ?? []).map(t => ({
      kind: 'event' as const,
      at: new Date(t.startsAt).getTime() + (t.hours ?? 1) * 3600_000, t, st: entryState(t) })),
  ];
  if (!rows.length) return <Empty />;

  const now = Date.now();
  const soon = rows.filter(r => r.at >= now).sort((a, b) => a.at - b.at);
  const past = rows.filter(r => r.at < now).sort((a, b) => b.at - a.at);
  const pastShown = allPast ? past : past.slice(0, 5);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }}
      contentContainerStyle={{ paddingBottom: TAB_SPACE, paddingTop: 6 }}
      refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

      {soon.length > 0 && <Text style={s.sec}>Ближайшие</Text>}
      {soon.map(r => <RowCard key={r.kind + (r.kind === 'booking' ? r.b.id : r.t.id)} row={r} />)}

      {past.length > 0 && <Text style={s.sec}>Прошедшие</Text>}
      {pastShown.map(r => <RowCard key={r.kind + (r.kind === 'booking' ? r.b.id : r.t.id)} row={r} past />)}

      {past.length > pastShown.length && (
        <Pressable onPress={() => setAllPast(true)} accessibilityRole="button"
          style={({ pressed }) => [s.more, pressed && { opacity: 0.8 }]}>
          <Text style={s.moreT}>Показать ещё {past.length - pastShown.length}</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

/** Строка списка: всё главное помещается в три строки текста. */
function RowCard({ row, past }: { row: Row; past?: boolean }) {
  const st = row.st;
  const date = row.kind === 'booking' ? dateOfIso(row.b.startsAt) : dateOfIso(row.t.startsAt);
  const open = () => {
    Haptics.selectionAsync();
    if (row.kind === 'booking') router.push({ pathname: '/booking', params: { id: String(row.b.id) } });
    else router.push({ pathname: '/tournament', params: { id: String(row.t.id), kind: row.t.kind === 'class' ? 'class' : '' } });
  };

  const title = row.kind === 'booking'
    ? (row.b.coachName ? `Тренировка · ${row.b.coachName}` : row.b.courtName)
    : row.t.name;
  const time = row.kind === 'booking'
    ? `${hh(row.b.hour)} – ${hh(row.b.hour + row.b.hours)} · ${row.b.hours} ${plural(row.b.hours, 'час', 'часа', 'часов')}`
    : `Начало ${hh(hourOfIso(row.t.startsAt))}`;
  const money = row.kind === 'booking' ? rub(dueOf(row.b)) : rub(row.t.fee);
  const hint = row.kind === 'booking' ? bookingHint(row.b) : null;

  return (
    <Pressable onPress={open} accessibilityRole="button"
      accessibilityLabel={`${title}, ${dayMonth(date)}, ${time}, ${st.label}`}
      style={({ pressed }) => [s.row, past && { opacity: 0.62 }, pressed && { opacity: 0.85 }]}>
      <View style={s.day}>
        <Text style={s.dayW}>{weekdayShort(date)}</Text>
        <Text style={s.dayN}>{dayMonth(date).split(' ')[0]}</Text>
        <Text style={s.dayM}>{(dayMonth(date).split(' ')[1] ?? '').slice(0, 3)}</Text>
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.titleLine}>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <View style={[s.pill, { backgroundColor: st.bg }]}>
            <Text style={[s.pillT, { color: st.fg }]} numberOfLines={1}>{st.label}</Text>
          </View>
        </View>
        <Text style={s.meta} numberOfLines={1}>
          {time}{row.kind === 'booking' && !!row.b.coachName ? ` · ${row.b.courtName}` : ''}
        </Text>
        <Text style={s.money} numberOfLines={1}>
          {money}
          {hint ? <Text style={[s.hint, hint.warn && { color: C.amber }]}> · {hint.text}</Text> : null}
        </Text>
      </View>

      <IconChevron size={15} color={C.dim2} />
    </Pressable>
  );
}

/** Короткая подсказка про деньги и срок — одной строкой, без подробностей. */
export function bookingHint(b: ApiBooking): { text: string; warn: boolean } | null {
  const paid = b.paid ?? 0, due = dueOf(b);
  const closed = b.status === 'cancelled' || b.status === 'no_show' || b.status === 'expired';
  if (closed) {
    if (paid > 0 && b.keptPrepay) return { text: `предоплата ${rub(paid)} не возвращается`, warn: true };
    if (paid > 0) return { text: `внесено ${rub(paid)} — клуб вернёт`, warn: false };
    if ((b.refunded ?? 0) > 0) return { text: `возвращено ${rub(b.refunded ?? 0)}`, warn: false };
    return null;
  }
  if (due > 0 && paid >= due) return { text: 'оплачено', warn: false };
  if (paid > 0) return { text: `осталось ${rub(due - paid)}`, warn: false };
  const left = holdLeft(b);
  if (left != null) return left > 0
    ? { text: `держим ещё ${left} ${plural(left, 'минуту', 'минуты', 'минут')}`, warn: false }
    : { text: 'срок удержания вышел', warn: true };
  return null;
}

function NeedLogin({ note }: { note: string }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><IconRacket size={26} color={C.accent} /></View>
      <Text style={s.emptyT}>Нужен вход</Text>
      <Text style={s.emptyS}>{note}</Text>
      <Pressable onPress={() => router.push({ pathname: '/account', params: { next: '/bookings' } })}
        accessibilityRole="button"
        style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.9 }]}>
        <Text style={s.emptyBtnT}>Войти в аккаунт</Text>
      </Pressable>
    </View>
  );
}

function Empty() {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><IconRacket size={30} color={C.accent} /></View>
      <Text style={s.emptyT}>Записей пока нет</Text>
      <Text style={s.emptyS}>Запишитесь на корт — запись появится здесь.</Text>
      <Pressable onPress={() => router.push('/courts')}
        style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.85 }]}>
        <Text style={s.emptyBtnT}>Забронировать корт</Text>
      </Pressable>
    </View>
  );
}

const s = sheet(() => ({
  sec: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 16, marginBottom: 8 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: S.xl, marginBottom: 8, padding: 12,
    borderRadius: R.xl, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },

  day: { width: 52, paddingVertical: 8, borderRadius: R.md, backgroundColor: C.surface2, alignItems: 'center' },
  dayW: { fontFamily: BODY, color: C.dim2, fontSize: 11, textTransform: 'uppercase' },
  dayN: { fontFamily: DISP, color: C.text, fontSize: 22, letterSpacing: -0.5, lineHeight: 26 },
  dayM: { fontFamily: BODY, color: C.dim2, fontSize: 11 },

  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontFamily: DISP_MED, color: C.text, fontSize: 15.5 },
  pill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, maxWidth: 150 },
  pillT: { fontFamily: DISP_MED, fontSize: 9.5, letterSpacing: 0.5, textTransform: 'uppercase' },

  meta: { fontFamily: BODY, color: C.dim, fontSize: 13, fontVariant: ['tabular-nums'] },
  money: { fontFamily: BODY, color: C.text, fontSize: 13.5, fontVariant: ['tabular-nums'] },
  hint: { color: C.dim2, fontSize: 13 },

  more: { marginHorizontal: S.xl, marginTop: 4, paddingVertical: 13, borderRadius: R.lg,
    borderWidth: 1, borderColor: C.line, alignItems: 'center', minHeight: HIT, justifyContent: 'center' },
  moreT: { fontFamily: DISP_MED, color: C.dim, fontSize: 11.5, letterSpacing: 1.1, textTransform: 'uppercase' },

  empty: { flex: 1, backgroundColor: C.ink, paddingTop: 84, paddingHorizontal: 40, alignItems: 'center' },
  emptyIcon: { width: 62, height: 62, borderRadius: R.xl, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.accentBorder, backgroundColor: C.accentSoft, marginBottom: 18 },
  emptyT: { ...TITLE.card, color: C.text, textAlign: 'center' },
  emptyS: { fontFamily: BODY, color: C.dim, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: { marginTop: 20, paddingHorizontal: 22, paddingVertical: 14, borderRadius: R.lg,
    backgroundColor: C.lime, minHeight: HIT, justifyContent: 'center' },
  emptyBtnT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
}));
