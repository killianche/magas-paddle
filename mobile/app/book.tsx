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
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, ApiError, type Alternatives } from '../src/api';
import { useProfile, normalizePhone, prettyPhone } from '../src/profile';
import { useClub } from '../src/club';
import { IMG } from '../src/images';
import { IconChevron } from '../src/components/icons';
import { ScreenSkeleton, NotFound } from '../src/components/state';
import { useHydrated } from '../src/hydrated';
import { hh, longDate, plural } from '../src/dates';


export default function Book() {
  useTheme();
  const club = useClub();
  const p = useLocalSearchParams<{
    courtId: string; name: string; date: string; hour: string; hours: string; price: string }>();
  const hydrated = useHydrated();
  const { profile, ready, save } = useProfile();

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [taken, setTaken] = useState<Alternatives | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setSurname(profile.surname ?? '');
      setPhone(prettyPhone(profile.phone));
    }
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
        courtId, date, hour, hours,
        name: name.trim(), surname: surname.trim() || undefined, phone: cleanPhone,
        whatsapp: profile?.whatsapp ?? undefined,
      });
      await save({ ...profile, name: name.trim(),
        surname: surname.trim() || undefined, phone: cleanPhone });
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
        courtId: altCourtId, date, hour: altHour, hours,
        name: name.trim(), surname: surname.trim() || undefined, phone: cleanPhone,
        whatsapp: profile?.whatsapp ?? undefined,
      });
      await save({ ...profile, name: name.trim(),
        surname: surname.trim() || undefined, phone: cleanPhone });
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
          <Row k="Дата" v={longDate(date)} />
          <Row k="Время" v={`${hh(hour)} – ${hh(hour + hours)}`} mono />
          <Row k="Длительность" v={`${hours} ${plural(hours, 'час', 'часа', 'часов')}`} />
          <Row k="Стоимость" v={rub(price)} total />
        </View>

        <Text style={s.label}>Ваше имя</Text>
        <TextInput style={s.input} value={name} onChangeText={setName}
          placeholder="Как к вам обращаться" placeholderTextColor={C.dim2}
          autoCapitalize="words" returnKeyType="next" maxLength={80}
          accessibilityLabel="Ваше имя" />

        <Text style={s.label}>Фамилия</Text>
        <TextInput style={s.input} value={surname} onChangeText={setSurname}
          placeholder="Необязательно" placeholderTextColor={C.dim2}
          autoCapitalize="words" returnKeyType="next" maxLength={80}
          accessibilityLabel="Ваша фамилия" />

        <Text style={s.label}>Телефон</Text>
        <TextInput style={s.input} value={phone} onChangeText={setPhone}
          placeholder="+7 928 000-00-00" placeholderTextColor={C.dim2}
          keyboardType="phone-pad" maxLength={20}
          accessibilityLabel="Номер телефона" />
        <Text style={s.hint}>
          По номеру клуб найдёт вашу запись.
        </Text>

        {!!problem && (
          <View style={s.problem}><Text style={s.problemT}>{problem}</Text></View>
        )}

        <View style={[s.note, { borderColor: C.warnBorder,
          backgroundColor: C.warnSoft }]}>
          <Text style={[s.noteT, { color: C.warnText }]}>
            Это <Text style={{ fontFamily: DISP_MED }}>заявка</Text>: менеджер свяжется и
            скажет, как внести предоплату — {club.prepayPercent} % стоимости.
          </Text>
        </View>
      </ScrollView>

      <View style={s.bar}>
        <Pressable onPress={submit} disabled={!canSend} accessibilityRole="button"
          style={({ pressed }) => [s.cta, !canSend && s.ctaOff, pressed && canSend && { opacity: 0.9 }]}>
          {sending
            ? <ActivityIndicator color={C.onLime} />
            : <Text style={[s.ctaT, !canSend && { color: C.dim2 }]}>Отправить заявку</Text>}
        </Pressable>
        {!canSend && !sending && (
          <Text style={s.barSub}>Заполните имя и телефон</Text>
        )}
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

const s = sheet(() => ({
  card: { backgroundColor: C.surface, borderColor: C.line, borderWidth: 1,
    borderRadius: R.xl, padding: S.lg, marginHorizontal: S.xl, marginBottom: S.md },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 8, gap: 14 },
  rowTotal: { borderTopColor: C.line, borderTopWidth: 1, marginTop: 4, paddingTop: 12 },
  rowK: { fontFamily: BODY, color: C.dim2, fontSize: 14 },
  rowV: { fontFamily: BODY, color: C.text, fontSize: 14, fontWeight: '600', textAlign: 'right', flexShrink: 1 },
  rowVTotal: { color: C.accent, fontFamily: DISP, fontSize: 22, letterSpacing: -1 },

  label: { ...EYEBROW, color: C.dim2,
    paddingHorizontal: S.xl, marginBottom: 8, marginTop: 10 },
  input: { fontFamily: BODY, marginHorizontal: S.xl, marginBottom: 4, backgroundColor: C.surface,
    borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md,
    paddingVertical: 14, paddingHorizontal: 14, minHeight: 52,
    color: C.text, fontSize: 16 },
  hint: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 17, paddingHorizontal: S.xl, marginTop: 6 },

  problem: { marginHorizontal: S.xl, marginTop: 14, padding: 13, borderRadius: R.md,
    backgroundColor: C.dangerSoft, borderWidth: 1, borderColor: C.dangerBorder },
  problemT: { fontFamily: BODY, color: C.dangerText, fontSize: 13, lineHeight: 19 },

  note: { marginHorizontal: S.xl, marginTop: 16, padding: 12, borderRadius: R.md,
    backgroundColor: C.warnSoft, borderWidth: 1, borderColor: C.warnBorder },
  noteT: { fontFamily: BODY, color: C.warnText, fontSize: 12.5, lineHeight: 18 },

  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink2,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, paddingVertical: 17,
    alignItems: 'center', minHeight: HIT + 10, justifyContent: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  barSub: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.scrim },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.ink2,
    borderTopWidth: 1, borderColor: C.line, paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 30 },
  grab: { width: 38, height: 4, borderRadius: 0, backgroundColor: C.lineStrong,
    alignSelf: 'center', marginBottom: 16, opacity: 0.6 },
  sheetT: { ...TITLE.card, color: C.text, textTransform: 'uppercase' },
  sheetS: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 20, marginTop: 7 },
  group: { ...EYEBROW, color: C.dim2, marginTop: 18, marginBottom: 8 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 7,
    borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, minHeight: 62 },
  altPh: { width: 44, height: 44, borderRadius: 0 },
  altN: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  altS: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  none: { marginTop: 16, padding: 13, borderRadius: R.md,
    backgroundColor: C.warnSoft, borderWidth: 1, borderColor: C.warnBorder },
  noneT: { fontFamily: BODY, color: C.warnText, fontSize: 13, lineHeight: 19 },
  ghost: { marginTop: 14, paddingVertical: 15, borderRadius: R.lg, alignItems: 'center',
    borderWidth: 1, borderColor: C.lineStrong, minHeight: HIT },
  ghostT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },
}));
