// Мои записи. Данные с сервера: брони ищутся по номеру телефона,
// он же служит опознанием — входа в приложении нет.
import { useCallback } from 'react';
import {
  ScrollView, Text, View, Pressable, StyleSheet, Alert, Platform, RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY } from '../../src/theme';
import { api, rub, ApiError, type ApiBooking, type ApiTournament } from '../../src/api';
import { useApi } from '../../src/useApi';
import { useProfile } from '../../src/profile';
import { Loading, Failed } from '../../src/components/status';

import { IconRacket, IconTrophy, IconCheck } from '../../src/components/icons';
import { hh, longDate, dateOfIso, hourOfIso, plural } from '../../src/dates';

function NeedLogin({ note }: { note: string }) {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><IconRacket size={26} color={C.lime} /></View>
      <Text style={s.emptyT}>Нужен вход</Text>
      <Text style={s.emptyS}>{note}</Text>
      <Pressable onPress={() => router.push('/account')} accessibilityRole="button"
        style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.9 }]}>
        <Text style={s.emptyBtnT}>Войти в аккаунт</Text>
      </Pressable>
    </View>
  );
}

export default function Bookings() {
  const { profile, ready } = useProfile();
  const phone = profile?.phone ?? '';

  const q = useApi(async () => {
    if (!phone) return { bookings: [] as ApiBooking[], tournaments: [] as ApiTournament[] };
    const [bookings, tournaments] = await Promise.all([
      api.myBookings(phone), api.tournaments(phone),
    ]);
    return { bookings, tournaments: tournaments.filter(t => t.entered) };
  }, [phone], phone ? `mine.${phone}` : undefined);

  // Вернулись на вкладку — подтянуть свежее: бронь могли подтвердить
  useFocusEffect(useCallback(() => { if (phone) q.refresh() }, [phone]));

  const cancelBooking = (b: ApiBooking) => {
    const title = `Отменить бронь на ${b.courtName}?`;
    const msg = 'Ничего платить не нужно. Время сразу освободится для других игроков.';
    const go = async () => {
      try {
        await api.cancel(b.id, phone);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        q.refresh();
      } catch (e) {
        const m = e instanceof ApiError ? e.message : 'Не получилось отменить.';
        Platform.OS === 'web' ? alert(m) : Alert.alert('Не вышло', m);
      }
    };
    if (Platform.OS === 'web') { if (confirm(title + '\n\n' + msg)) go(); return }
    Alert.alert(title, msg, [
      { text: 'Оставить', style: 'cancel' },
      { text: 'Отменить бронь', style: 'destructive', onPress: go },
    ]);
  };

  const leaveTournament = (t: ApiTournament) => {
    const title = `Отменить запись на «${t.name}»?`;
    const go = async () => {
      try { await api.leaveTournament(t.id, phone); q.refresh() }
      catch (e) {
        const m = e instanceof ApiError ? e.message : 'Не получилось отменить.';
        Platform.OS === 'web' ? alert(m) : Alert.alert('Не вышло', m);
      }
    };
    if (Platform.OS === 'web') { if (confirm(title)) go(); return }
    Alert.alert(title, 'Место освободится для других игроков.', [
      { text: 'Оставить', style: 'cancel' },
      { text: 'Отменить запись', style: 'destructive', onPress: go },
    ]);
  };

  if (!ready) return <Loading />;

  // Ещё ни разу не записывался — телефона нет, спрашивать сервер не о чем
  if (!phone) return <Empty />;

  if (q.loading) return <Loading note="Смотрю ваши записи" />;
  // Номер защищён паролем, а входа на этом устройстве нет — зовём войти,
  // а не показываем «не удалось загрузить».
  if (q.error && /войд/i.test(q.error)) return <NeedLogin note={q.error} />;
  if (q.error) return <Failed message={q.error} onRetry={q.reload} />;

  const bookings = q.data?.bookings ?? [];
  const entries = q.data?.tournaments ?? [];
  if (bookings.length === 0 && entries.length === 0) return <Empty />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }}
      contentContainerStyle={{ paddingBottom: 30, paddingTop: 8 }}
      refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={C.dim} />}>

      {entries.map(t => (
        <View key={'t' + t.id} style={[s.card, s.cardT]}>
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.name}>{t.name}</Text>
              <Text style={s.date}>{longDate(dateOfIso(t.startsAt))}</Text>
            </View>
            <View style={s.tIcon}><IconTrophy size={17} color={C.lime} /></View>
          </View>
          <View style={s.foot}>
            <Text style={s.time}>Начало {hh(hourOfIso(t.startsAt))}</Text>
            <Text style={s.price}>взнос {rub(t.fee)}</Text>
          </View>
          <View style={s.actions}>
            <Pressable style={s.mini}
              onPress={() => router.push({ pathname: '/tournament', params: { id: String(t.id) } })}>
              <Text style={s.miniT}>О турнире</Text>
            </Pressable>
            <Pressable style={[s.mini, s.miniDg]} onPress={() => leaveTournament(t)}>
              <Text style={[s.miniT, { color: C.red }]}>Отменить</Text>
            </Pressable>
          </View>
        </View>
      ))}

      {bookings.map(b => {
        const st = stateOf(b);
        return (
          <View key={'b' + b.id} style={[s.card, st.dim && { opacity: 0.6 }]}>
            {/* Состояние — первое, что видит человек. Заявка и подтверждённая
                бронь это разные вещи, и разница должна читаться сразу. */}
            <View style={[s.band, { backgroundColor: st.bg }]}>
              <Text style={[s.bandT, { color: st.fg }]}>{st.label}</Text>
            </View>

            <View style={s.body}>
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={s.name}>{b.courtName}</Text>
                  <Text style={s.date}>{longDate(dateOfIso(b.startsAt))}</Text>
                </View>
              </View>
              <View style={s.foot}>
                <Text style={s.time}>{hh(b.hour)} – {hh(b.hour + b.hours)}</Text>
                <Text style={s.price}>{rub(b.price)}</Text>
              </View>

              <Text style={[s.note, st.warn && { color: C.amber }]}>{st.note}</Text>

              <View style={s.actions}>
                <View style={s.mini}>
                  <Text style={s.miniT}>{b.hours} {plural(b.hours, 'час', 'часа', 'часов')}</Text>
                </View>
                {st.canCancel && (
                  <Pressable style={[s.mini, s.miniDg]} onPress={() => cancelBooking(b)}>
                    <Text style={[s.miniT, { color: C.red }]}>Отменить</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Empty() {
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}><IconRacket size={30} color={C.lime} /></View>
      <Text style={s.emptyT}>Записей пока нет</Text>
      <Text style={s.emptyS}>Запишитесь на корт — запись появится здесь.</Text>
      <Pressable onPress={() => router.replace('/')}
        style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.85 }]}>
        <Text style={s.emptyBtnT}>Выбрать время</Text>
      </Pressable>
    </View>
  );
}

/** Сколько минут осталось держать заявку. null — удержания нет. */
function holdLeft(b: { status: string; holdUntil?: string | null }): number | null {
  if (b.status !== 'pending' || !b.holdUntil) return null;
  return Math.max(0, Math.round((new Date(b.holdUntil).getTime() - Date.now()) / 60000));
}

/** Что показать человеку про состояние его записи.
 *
 *  Заявка и подтверждённая бронь — разные вещи. Пока менеджер не подтвердил,
 *  время держится за человеком лишь на срок удержания; после подтверждения
 *  оно закреплено, и его ждут. Раньше разница сводилась к слову
 *  «Ожидает» мелким шрифтом, и её не замечали. */
function stateOf(b: ApiBooking) {
  const left = holdLeft(b);
  const past = new Date(b.endsAt).getTime() < Date.now();

  if (b.status === 'expired') return {
    label: 'ВРЕМЯ ОСВОБОДИЛОСЬ', bg: C.surface2, fg: C.dim,
    note: 'Заявку не успели подтвердить, и время вернулось в расписание. Выберите другое.',
    warn: false, dim: true, canCancel: false,
  };
  if (b.status === 'no_show') return {
    label: 'НЕ СОСТОЯЛАСЬ', bg: C.surface2, fg: C.dim,
    note: 'Клуб отметил, что вы не пришли.',
    warn: false, dim: true, canCancel: false,
  };
  if (past) return {
    label: 'СЫГРАНО', bg: C.surface2, fg: C.dim,
    note: 'Спасибо за игру. Ждём снова.',
    warn: false, dim: true, canCancel: false,
  };
  if (b.status === 'confirmed') return {
    label: 'ЗАБРОНИРОВАНО', bg: C.lime, fg: C.onLime,
    note: 'Менеджер подтвердил запись. Время закреплено за вами — вас ждут в клубе.',
    warn: false, dim: false, canCancel: true,
  };
  // pending
  return {
    label: 'ЖДЁТ ПОДТВЕРЖДЕНИЯ', bg: 'rgba(240,169,59,.18)', fg: C.amber,
    note: left == null
      ? 'Менеджер подтвердит запись и свяжется с вами.'
      : left > 0
        ? `Менеджер подтвердит запись и свяжется с вами. Место держим ещё ${left} ${plural(left, 'минуту', 'минуты', 'минут')}.`
        : 'Срок удержания вышел — место могло освободиться. Свяжитесь с менеджером.',
    warn: left === 0, dim: false, canCancel: true,
  };
}

const s = StyleSheet.create({
  band: { paddingVertical: 7, paddingHorizontal: 14 },
  bandT: { ...EYEBROW },
  body: { padding: 14 },
  note: { fontFamily: BODY, color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 10 },
  empty: { flex: 1, backgroundColor: C.ink, paddingTop: 84, paddingHorizontal: 40, alignItems: 'center' },
  emptyIcon: { width: 62, height: 62, borderRadius: 0, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(198,240,51,.26)', backgroundColor: 'rgba(198,240,51,.07)',
    marginBottom: 18 },
  emptyT: { ...TITLE.card, color: C.text, textAlign: 'center' },
  emptyS: { fontFamily: BODY, color: C.dim, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 20 },
  emptyBtn: { marginTop: 20, paddingHorizontal: 22, paddingVertical: 14, borderRadius: R.lg,
    backgroundColor: C.lime, minHeight: HIT, justifyContent: 'center' },
  emptyBtnT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },

  cardT: { borderColor: 'rgba(198,240,51,.3)', backgroundColor: 'rgba(198,240,51,.05)' },
  tIcon: { width: 34, height: 34, borderRadius: 0, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(198,240,51,.28)', backgroundColor: 'rgba(198,240,51,.08)' },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line, borderRadius: R.xl,
    marginHorizontal: S.xl, marginBottom: 10, overflow: 'hidden' },
  head: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  name: { ...TITLE.section, color: C.text, textTransform: 'uppercase' },
  date: { fontFamily: BODY, color: C.dim2, fontSize: 13, marginTop: 2 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    borderTopWidth: 1, borderTopColor: C.line, paddingTop: 11 },
  time: { color: C.text, fontFamily: DISP, fontSize: 17, letterSpacing: -0.5,
    fontVariant: ['tabular-nums'] },
  price: { fontFamily: BODY, color: C.dim, fontSize: 15, fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  mini: { flex: 1, borderWidth: 1, borderColor: C.line, borderRadius: R.md,
    paddingVertical: 11, alignItems: 'center', minHeight: HIT, justifyContent: 'center' },
  miniDg: { borderColor: 'rgba(229,100,75,.45)' },
  miniT: { color: C.dim, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase' },
});
