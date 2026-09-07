// Подтверждение записи. Здесь человек первый раз называет себя: входа в приложении
// нет, и сервер узнаёт его по номеру телефона. Имя и номер сохраняются
// на устройстве, чтобы в следующий раз не вводить заново.
import { useEffect, useState } from 'react';
import {
  ScrollView, Text, View, Pressable, StyleSheet, Modal, Image,
  TextInput, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT } from '../src/theme';
import { api, rub, ApiError, type Alternatives } from '../src/api';
import { useProfile, normalizePhone, prettyPhone } from '../src/profile';
import { IMG } from '../src/images';
import { IconChevron } from '../src/components/icons';
import { ScreenSkeleton, NotFound } from '../src/components/state';
import { useHydrated } from '../src/hydrated';
import { hh, longDate, weekday, plural } from '../src/dates';

const CANCEL_HOURS = 4;   // ЗАГЛУШКА: правило отмены ждёт подтверждения клуба
const LATE_MINUTES = 15;

export default function Book() {
  const p = useLocalSearchParams<{
    courtId: string; name: string; date: string; hour: string; hours: string; price: string }>();
  const hydrated = useHydrated();
  const { profile, ready, save } = useProfile();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [taken, setTaken] = useState<Alternatives | null>(null);

  useEffect(() => {
    if (profile) { setName(profile.name); setPhone(prettyPhone(profile.phone)) }
  }, [profile]);

  const courtId = String(p.courtId ?? '');
  const courtName = String(p.name ?? '');
  const date = String(p.date ?? '');
  const hour = Number(p.hour ?? 0);
  const hours = Number(p.hours ?? 1);
  const price = Number(p.price ?? 0);

  if (!hydrated || !ready) return <ScreenSkeleton />;
  if (!courtId || !date || !p.hour) return (
    <NotFound title="Заявка не собрана"
      note="Похоже, вы открыли ссылку напрямую. Выберите время и площадку на главной." />
  );

  const cleanPhone = normalizePhone(phone);
  const canSend = name.trim().length >= 2 && cleanPhone != null && !sending;

  const submit = async () => {
    if (!canSend || !cleanPhone) return;
    setProblem(null);
    setSending(true);
    try {
      const booking = await api.book({
        courtId, date, hour, hours, name: name.trim(), phone: cleanPhone,
      });
      await save({ name: name.trim(), phone: cleanPhone });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/sent', params: {
        id: String(booking.id), name: booking.courtName, date,
        hour: String(hour), hours: String(hours), price: String(booking.price),
        holdUntil: booking.holdUntil ?? '' } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slot_taken') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setTaken(e.payload?.alternatives ?? { sameTime: [], later: null });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setProblem(e instanceof ApiError ? e.message : 'Не получилось отправить заявку.');
      }
    } finally {
      setSending(false);
    }
  };

  /** Выбрали замену — записываемся на неё сразу, повторно спрашивать нечего. */
  const takeAlternative = async (altCourtId: string, altName: string, altHour: number) => {
    if (!cleanPhone) return;
    setTaken(null); setSending(true);
    try {
      const booking = await api.book({
        courtId: altCourtId, date, hour: altHour, hours, name: name.trim(), phone: cleanPhone,
      });
      await save({ name: name.trim(), phone: cleanPhone });
      router.replace({ pathname: '/sent', params: {
        id: String(booking.id), name: booking.courtName, date,
        hour: String(altHour), hours: String(hours), price: String(booking.price) } });
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Не получилось записаться.');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.ink }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Проверьте заявку' }} />

      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 200 }}
        keyboardShouldPersistTaps="handled">
        <View style={s.card}>
          <Row k="Площадка" v={courtName} />
          <Row k="Дата" v={`${longDate(date)}, ${weekday(date)}`} />
          <Row k="Время" v={`${hh(hour)} – ${hh(hour + hours)}`} mono />
          <Row k="Длительность" v={`${hours} ${plural(hours, 'час', 'часа', 'часов')}`} />
          <Row k="К оплате на месте" v={rub(price)} total />
        </View>

        <Text style={s.label}>Ваше имя</Text>
        <TextInput style={s.input} value={name} onChangeText={setName}
          placeholder="Как к вам обращаться" placeholderTextColor={C.dim2}
          autoCapitalize="words" returnKeyType="next" maxLength={80}
          accessibilityLabel="Ваше имя" />

        <Text style={s.label}>Телефон</Text>
        <TextInput style={s.input} value={phone} onChangeText={setPhone}
          placeholder="+7 928 000-00-00" placeholderTextColor={C.dim2}
          keyboardType="phone-pad" maxLength={20}
          accessibilityLabel="Номер телефона" />
        <Text style={s.hint}>
          По номеру клуб найдёт вашу запись, а вы — свои брони в приложении.
        </Text>

        {!!problem && (
          <View style={s.problem}><Text style={s.problemT}>{problem}</Text></View>
        )}

        <View style={s.note}>
          <Text style={s.noteT}>
            Если планы изменятся — отмените в приложении, время освободится для других.
            Отмена бесплатна за <Text style={{ fontWeight: '700' }}>{CANCEL_HOURS} часа</Text>.
            Опоздание больше <Text style={{ fontWeight: '700' }}>{LATE_MINUTES} минут</Text> — корт может быть отдан.
          </Text>
        </View>
      </ScrollView>

      <View style={s.bar}>
        <Pressable onPress={submit} disabled={!canSend} accessibilityRole="button"
          style={({ pressed }) => [s.cta, !canSend && s.ctaOff, pressed && canSend && { opacity: 0.9 }]}>
          {sending
            ? <ActivityIndicator color={C.onLime} />
            : <Text style={[s.ctaT, !canSend && { color: C.dim2 }]}>Записаться</Text>}
        </Pressable>
        <Text style={s.barSub}>
          {canSend || sending ? 'Запись сохранится, менеджер её подтвердит'
            : 'Заполните имя и телефон'}
        </Text>
      </View>

      <TakenSheet alternatives={taken} date={date} hours={hours}
        onPick={takeAlternative} onClose={() => { setTaken(null); router.back() }} />
    </KeyboardAvoidingView>
  );
}

function Row({ k, v, mono, total }: { k: string; v: string; mono?: boolean; total?: boolean }) {
  return (
    <View style={[s.row, total && s.rowTotal]}>
      <Text style={s.rowK}>{k}</Text>
      <Text style={[s.rowV, total && s.rowVTotal,
        (mono || total) && { fontVariant: ['tabular-nums'] }]}>{v}</Text>
    </View>
  );
}

/* Время увели, пока человек заполнял заявку. Замены присылает сервер:
   он один знает, что свободно на самом деле. */
function TakenSheet({ alternatives, date, hours, onPick, onClose }: {
  alternatives: Alternatives | null; date: string; hours: number;
  onPick: (courtId: string, name: string, hour: number) => void;
  onClose: () => void;
}) {
  const a = alternatives;
  const nothing = !!a && a.sameTime.length === 0 && a.later == null;

  return (
    <Modal visible={!!a} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim} />
      <View style={s.sheetWrap}>
        <View style={s.sheet}>
          <View style={s.grab} />
          <Text style={s.sheetT}>Это время только что заняли</Text>
          <Text style={s.sheetS}>
            Пока вы заполняли заявку, время забронировал другой игрок.
            Ничего не списывалось. Вот что свободно прямо сейчас.
          </Text>

          {!!a?.sameTime.length && (
            <>
              <Text style={s.group}>В то же время</Text>
              {a.sameTime.map(alt => (
                <Pressable key={alt.courtId} onPress={() => onPick(alt.courtId, alt.courtName, alt.hour)}
                  style={({ pressed }) => [s.alt, pressed && { opacity: 0.8 }]}>
                  <Image source={IMG[alt.courtId] ?? IMG.c1} style={s.altPh} resizeMode="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={s.altN}>{alt.courtName}</Text>
                    <Text style={s.altS}>{hh(alt.hour)} – {hh(alt.hour + hours)}</Text>
                  </View>
                  <IconChevron size={16} color={C.dim2} />
                </Pressable>
              ))}
            </>
          )}

          {!!a?.later && (
            <>
              <Text style={s.group}>На той же площадке</Text>
              <Pressable onPress={() => onPick(a.later!.courtId, a.later!.courtName, a.later!.hour)}
                style={({ pressed }) => [s.alt, pressed && { opacity: 0.8 }]}>
                <Image source={IMG[a.later.courtId] ?? IMG.c1} style={s.altPh} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={s.altN}>{a.later.courtName}</Text>
                  <Text style={s.altS}>{hh(a.later.hour)} – {hh(a.later.hour + hours)}</Text>
                </View>
                <IconChevron size={16} color={C.dim2} />
              </Pressable>
            </>
          )}

          {nothing && (
            <View style={s.none}>
              <Text style={s.noneT}>
                На это время замены нет. Посмотрите другие дни — там места есть.
              </Text>
            </View>
          )}

          <Pressable onPress={onClose} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.7 }]}>
            <Text style={s.ghostT}>Выбрать другое время самому</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1,
    borderRadius: R.xl, padding: S.lg, marginHorizontal: S.xl, marginBottom: S.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, gap: 14 },
  rowTotal: { borderTopColor: C.line, borderTopWidth: 1, marginTop: 4, paddingTop: 12 },
  rowK: { color: C.dim2, fontSize: 14 },
  rowV: { color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  rowVTotal: { color: C.lime, fontSize: 20 },

  label: { color: C.dim, fontSize: 13.5, fontWeight: '600',
    paddingHorizontal: S.xl, marginBottom: 8, marginTop: 6 },
  input: { marginHorizontal: S.xl, marginBottom: 4, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md,
    paddingVertical: 14, paddingHorizontal: 14, minHeight: 52,
    color: C.text, fontSize: 16 },
  hint: { color: C.dim2, fontSize: 12, lineHeight: 17, paddingHorizontal: S.xl, marginTop: 6 },

  problem: { marginHorizontal: S.xl, marginTop: 14, padding: 13, borderRadius: R.md,
    backgroundColor: 'rgba(229,100,75,.1)', borderWidth: 1, borderColor: 'rgba(229,100,75,.35)' },
  problemT: { color: '#F0B6A8', fontSize: 13, lineHeight: 19 },

  note: { marginHorizontal: S.xl, marginTop: 16, padding: 12, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  noteT: { color: '#DFCCA8', fontSize: 12.5, lineHeight: 18 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 17,
    alignItems: 'center', minHeight: HIT + 10, justifyContent: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  ctaT: { color: C.onLime, fontSize: 17, fontWeight: '700' },
  barSub: { color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,7,5,.7)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.ink2, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: C.line, paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 30 },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.lineStrong,
    alignSelf: 'center', marginBottom: 16, opacity: 0.6 },
  sheetT: { color: C.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  sheetS: { color: C.dim, fontSize: 13.5, lineHeight: 20, marginTop: 7 },
  group: { color: C.dim2, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5,
    marginTop: 18, marginBottom: 8 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 7,
    borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, minHeight: 62 },
  altPh: { width: 44, height: 44, borderRadius: 12 },
  altN: { color: C.text, fontSize: 15.5, fontWeight: '600' },
  altS: { color: C.dim2, fontSize: 12.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  none: { marginTop: 16, padding: 13, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  noneT: { color: '#DFCCA8', fontSize: 13, lineHeight: 19 },
  ghost: { marginTop: 14, paddingVertical: 15, borderRadius: R.lg, alignItems: 'center',
    borderWidth: 1, borderColor: C.lineStrong, minHeight: HIT },
  ghostT: { color: C.text, fontSize: 15, fontWeight: '600' },
});
