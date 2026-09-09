// Аккаунт: кто человек и куда он ходил.
//
// Пароля нет намеренно. Клуб узнаёт человека по номеру телефона — по нему же
// сервер отдаёт его записи. Заводить логин с паролем ради шести кортов значит
// добавить экран, который нечем восстановить, если человек его забудет.
// Имя, фамилия и номер хранятся на устройстве и уходят только вместе с заявкой.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY } from '../src/theme';
import { api, rub, type ApiBooking } from '../src/api';
import { useApi } from '../src/useApi';
import { useProfile, normalizePhone, prettyPhone, fullName, type Profile } from '../src/profile';
import { Eyebrow } from '../src/components/velocity';
import { ClubInfo } from '../src/components/clubinfo';
import { dateOfIso, hourOfIso, longDate, hh, plural } from '../src/dates';

/** Записи, которые уже прошли: их и показываем историей. */
const PAST: ApiBooking['status'][] = ['done', 'cancelled', 'no_show', 'expired'];

const LABEL: Record<string, string> = {
  done: 'сыграно', cancelled: 'отменено', no_show: 'не пришли', expired: 'истекло',
};

export default function Account() {
  const { profile, ready, save } = useProfile();
  const [edit, setEdit] = useState(false);

  if (!ready) return <><Stack.Screen options={{ title: 'Аккаунт' }} /><View style={s.root} /></>;
  if (!profile || edit) {
    return <Form initial={profile} onDone={async p => { await save(p); setEdit(false) }}
      onCancel={profile ? () => setEdit(false) : undefined} />;
  }
  return <Card profile={profile} onEdit={() => setEdit(true)} />;
}

/* ── Регистрация и правка данных ───────────────────────────────────────── */

function Form({ initial, onDone, onCancel }: {
  initial: Profile | null; onDone: (p: Profile) => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [surname, setSurname] = useState(initial?.surname ?? '');
  const [phone, setPhone] = useState(initial?.phone ? prettyPhone(initial.phone) : '');
  const [wa, setWa] = useState(initial?.whatsapp ? prettyPhone(initial.whatsapp) : '');

  // Достаточно одного номера: у кого-то WhatsApp на другом номере, у кого-то
  // его нет вовсе. Основным становится телефон, а если его не дали — WhatsApp.
  const cleanPhone = normalizePhone(phone);
  const cleanWa = normalizePhone(wa);
  const main = cleanPhone ?? cleanWa;
  const ok = name.trim().length >= 2 && !!main;

  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = async () => {
    if (!ok || !main || saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const p: Profile = {
      name: name.trim(), surname: surname.trim() || undefined, phone: main,
      whatsapp: cleanWa && cleanWa !== main ? cleanWa : undefined,
    };
    setSaving(true); setProblem(null);
    // Анкету держим и на сервере: после переустановки приложения человек
    // вводит только номер, остальное подставится само.
    try { await api.saveClient({ name: p.name, surname: p.surname, phone: p.phone,
      whatsapp: p.whatsapp }) }
    catch (e) { setProblem(e instanceof Error ? e.message : 'Не вышло сохранить на сервере') }
    setSaving(false);
    onDone(p);
  };

  // Ввели знакомый номер — подставляем, что клуб уже о человеке знает.
  // Что уже спрашивали, помним в ref, а не в состоянии: состояние меняло бы
  // зависимости эффекта, тот перезапускался бы и сам гасил свой же ответ.
  const looked = useRef<string | null>(null);
  useEffect(() => {
    if (initial || !cleanPhone || cleanPhone === looked.current) return;
    looked.current = cleanPhone;
    api.client(cleanPhone).then(c => {
      if (!c) return;
      setName(n => n.trim() ? n : c.name);
      setSurname(x => x.trim() ? x : (c.surname ?? ''));
      if (c.whatsapp) setWa(x => x.trim() ? x : prettyPhone(c.whatsapp!));
    }).catch(() => {});
  }, [cleanPhone, initial]);

  return (
    <KeyboardAvoidingView style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: initial ? 'Мои данные' : 'Аккаунт' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Eyebrow>{initial ? 'Мои данные' : 'Регистрация · 30 секунд'}</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>
            {initial ? 'МОИ\nДАННЫЕ' : 'СОЗДАТЬ\nАККАУНТ'}
          </Text>
          <Text style={s.lede}>
            Клуб узнаёт вас по номеру телефона: по нему в приложении видны ваши
            записи, а менеджер понимает, с кем связаться.
          </Text>
        </View>

        <Text style={s.label}>Имя</Text>
        <TextInput style={s.input} value={name} onChangeText={setName}
          placeholder="Как к вам обращаться" placeholderTextColor={C.busy}
          autoCapitalize="words" textContentType="givenName" returnKeyType="next" />

        <Text style={s.label}>Фамилия</Text>
        <TextInput style={s.input} value={surname} onChangeText={setSurname}
          placeholder="Необязательно" placeholderTextColor={C.busy}
          autoCapitalize="words" textContentType="familyName" returnKeyType="next" />

        <Text style={s.label}>Телефон</Text>
        <TextInput style={s.input} value={phone} onChangeText={setPhone}
          placeholder="+7 928 000-00-00" placeholderTextColor={C.busy}
          keyboardType="phone-pad" textContentType="telephoneNumber" />
        <Text style={s.label}>WhatsApp</Text>
        <TextInput style={s.input} value={wa} onChangeText={setWa}
          placeholder="Если номер другой" placeholderTextColor={C.busy}
          keyboardType="phone-pad" />
        <Text style={s.hint}>
          Достаточно одного номера — по нему менеджер подтвердит бронь.
          Данные хранятся на вашем телефоне и уходят только вместе с заявкой.
        </Text>

        {!!problem && <Text style={s.problem}>{problem}</Text>}

        <Pressable onPress={submit} disabled={!ok || saving} accessibilityRole="button"
          style={({ pressed }) => [s.cta, (!ok || saving) && s.ctaOff,
            pressed && ok && { opacity: 0.9 }]}>
          <Text style={[s.ctaT, (!ok || saving) && { color: C.busy }]}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </Text>
        </Pressable>
        {!ok && <Text style={s.barSub}>Нужны имя и хотя бы один номер</Text>}

        {onCancel && (
          <Pressable onPress={onCancel} accessibilityRole="button"
            style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}>
            <Text style={s.linkT}>Отмена</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Карточка человека и история ───────────────────────────────────────── */

function Card({ profile, onEdit }: { profile: Profile; onEdit: () => void }) {
  const q = useApi(() => api.myBookings(profile.phone), [profile.phone],
    `account.${profile.phone}`);
  useFocusEffect(useCallback(() => { q.refresh() }, [profile.phone]));

  const all = q.data ?? [];
  const past = all
    .filter(b => PAST.includes(b.status) || new Date(b.endsAt).getTime() < Date.now())
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  const played = past.filter(b => b.status === 'done'
    || (b.status === 'confirmed' && new Date(b.endsAt).getTime() < Date.now())).length;
  const soon = all.filter(b => !PAST.includes(b.status)
    && new Date(b.endsAt).getTime() >= Date.now()).length;

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: 'Аккаунт' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.head}>
          <Eyebrow>Аккаунт</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>
            {fullName(profile).toUpperCase()}
          </Text>
          <Text style={s.phone}>{prettyPhone(profile.phone)}</Text>
          {!!profile.whatsapp && (
            <Text style={s.phone}>WhatsApp · {prettyPhone(profile.whatsapp)}</Text>
          )}

          <View style={s.stats}>
            <Stat n={played} label={plural(played, 'игра', 'игры', 'игр')} />
            <View style={s.statDiv} />
            <Stat n={soon} label="впереди" />
          </View>

          <View style={s.actions}>
            <Pressable onPress={onEdit} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, pressed && { opacity: 0.75 }]}>
              <Text style={s.ghostT}>Изменить данные</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/bookings')} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, pressed && { opacity: 0.75 }]}>
              <Text style={s.ghostT}>Мои записи</Text>
            </Pressable>
          </View>
        </View>

        <Text style={s.group}>История посещений</Text>

        {q.loading && !q.data && <Text style={s.empty}>Смотрю историю…</Text>}
        {!!q.error && !q.data && (
          <Text style={s.empty}>{q.error}</Text>
        )}
        {!q.loading && !q.error && past.length === 0 && (
          <Text style={s.empty}>
            Пока пусто. Как только вы сыграете, записи появятся здесь.
          </Text>
        )}

        {past.map(b => (
          <View key={b.id} style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.rowN}>{b.courtName}</Text>
              <Text style={s.rowS}>
                {longDate(dateOfIso(b.startsAt))} · {hh(hourOfIso(b.startsAt))} – {hh(hourOfIso(b.startsAt) + b.hours)}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.rowP}>{rub(b.price)}</Text>
              <Text style={[s.rowSt, b.status === 'done' && { color: C.limeDim }]}>
                {LABEL[b.status] ?? 'сыграно'}
              </Text>
            </View>
          </View>
        ))}

        <Text style={s.group}>Клуб и настройки</Text>
        <ClubInfo />
      </ScrollView>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={s.statN}>{n}</Text>
      <Text style={s.statL}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  head: { paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 6 },
  h1: { ...TITLE.page, color: C.text, marginTop: 8 },
  lede: { fontFamily: BODY, color: C.dim, fontSize: 14.5, lineHeight: 21, marginTop: 10 },
  phone: { fontFamily: DISP_MED, color: C.dim, fontSize: 15, letterSpacing: -0.2,
    marginTop: 6, fontVariant: ['tabular-nums'] },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 18,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, padding: 15 },
  statDiv: { width: 1, alignSelf: 'stretch', backgroundColor: C.line, marginHorizontal: 14 },
  statN: { fontFamily: DISP, color: C.text, fontSize: 30, letterSpacing: -1.4,
    fontVariant: ['tabular-nums'] },
  statL: { ...EYEBROW, color: C.dim2, marginTop: 3 },

  actions: { flexDirection: 'row', gap: 9, marginTop: 10 },
  ghost: { flex: 1, borderWidth: 1, borderColor: C.lineStrong, minHeight: HIT,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  ghostT: { color: C.text, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase' },

  group: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 26, marginBottom: 10 },
  empty: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20,
    marginHorizontal: S.xl },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl,
    marginBottom: 8, padding: 13, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface },
  rowN: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  rowS: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, marginTop: 3 },
  rowP: { fontFamily: DISP_MED, color: C.text, fontSize: 14, letterSpacing: -0.2,
    fontVariant: ['tabular-nums'] },
  rowSt: { ...EYEBROW, color: C.dim2, marginTop: 4 },

  label: { ...EYEBROW, color: C.dim2, paddingHorizontal: S.xl, marginTop: 16, marginBottom: 8 },
  input: { marginHorizontal: S.xl, backgroundColor: C.surface, borderWidth: 1,
    borderColor: C.lineStrong, paddingVertical: 14, paddingHorizontal: 14,
    minHeight: 52, color: C.text, fontFamily: BODY, fontSize: 16 },
  hint: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 17,
    paddingHorizontal: S.xl, marginTop: 8 },

  cta: { backgroundColor: C.lime, marginHorizontal: S.xl, marginTop: 22,
    paddingVertical: 15, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  ctaOff: { backgroundColor: '#15251B' },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  barSub: { fontFamily: BODY, color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },
  problem: { fontFamily: BODY, color: '#F0B6A8', fontSize: 13, lineHeight: 19,
    marginHorizontal: S.xl, marginTop: 14 },
  link: { paddingVertical: 14, alignItems: 'center', minHeight: HIT, justifyContent: 'center' },
  linkT: { color: C.dim, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase' },

  doc: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: S.xl,
    paddingVertical: 13, minHeight: HIT, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line },
  docT: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2 },
  docS: { fontFamily: BODY, color: C.dim2, fontSize: 12, marginTop: 2 },
});
