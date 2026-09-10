// Аккаунт: кто человек, куда он ходил и настройки клуба.
//
// Вход по номеру телефона и паролю. Пароль появился не для красоты: без него
// приложение узнавало человека по одному номеру, и тот, кто знал чужой номер,
// видел чужое имя и историю посещений.
//
// Забытый пароль сбрасывает менеджер из админки — он и так говорит с человеком
// по телефону. Кода по SMS нет: нужен провайдер рассылки (вопрос Q57).
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY } from '../src/theme';
import { api, rub, ApiError, type ApiBooking } from '../src/api';
import { useApi } from '../src/useApi';
import {
  useProfile, normalizePhone, prettyPhone, fullName, saveToken, type Profile,
} from '../src/profile';
import { Eyebrow } from '../src/components/velocity';
import { ClubInfo } from '../src/components/clubinfo';
import { dateOfIso, hourOfIso, longDate, hh, plural } from '../src/dates';

/** Записи, которые уже прошли: их и показываем историей. */
const PAST: ApiBooking['status'][] = ['done', 'cancelled', 'no_show', 'expired'];

const LABEL: Record<string, string> = {
  done: 'сыграно', cancelled: 'отменено', no_show: 'не пришли', expired: 'истекло',
};

export default function Account() {
  const { profile, ready, save, forget } = useProfile();
  const [mode, setMode] = useState<'view' | 'edit' | 'password'>('view');

  if (!ready) return <><Stack.Screen options={{ title: 'Аккаунт' }} /><View style={s.root} /></>;

  if (!profile) {
    return <Enter onDone={async (p, token) => { await saveToken(token); await save(p) }} />;
  }
  if (mode === 'edit') {
    return <EditForm profile={profile}
      onDone={async p => { await save(p); setMode('view') }}
      onCancel={() => setMode('view')} />;
  }
  if (mode === 'password') {
    return <PasswordForm profile={profile}
      onDone={async p => { await save(p); setMode('view') }}
      onCancel={() => setMode('view')} />;
  }
  return <Card profile={profile} onEdit={() => setMode('edit')}
    onPassword={() => setMode('password')} onForget={forget} />;
}

/* ── Вход и регистрация ────────────────────────────────────────────────── */

function Enter({ onDone }: { onDone: (p: Profile, token: string) => void }) {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [wa, setWa] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  /** Что делать с этим номером: клуб его ещё не знает, знает без пароля
   *  или на нём уже стоит пароль. Пока не спросили — 'unknown'. */
  const [state, setState] = useState<'unknown' | 'new' | 'known' | 'protected'>('unknown');

  const clean = normalizePhone(phone);
  const asked = useRef<string | null>(null);

  // Спрашиваем сервер, как только номер стал похож на настоящий. Ключ уже
  // спрошенного держим в ref: состояние меняло бы зависимости эффекта, и тот
  // перезапускался бы, отменяя собственный запрос.
  useEffect(() => {
    if (!clean || clean === asked.current) return;
    asked.current = clean;
    api.checkPhone(clean).then(r => {
      setState(!r.known ? 'new' : r.hasPassword ? 'protected' : 'known');
      const p = r.profile;
      if (p) {
        setName(n => n.trim() ? n : p.name);
        setSurname(x => x.trim() ? x : (p.surname ?? ''));
        if (p.whatsapp) setWa(x => x.trim() ? x : prettyPhone(p.whatsapp!));
      }
    }).catch(() => {});
  }, [clean]);

  const login = state === 'protected';
  const ok = !!clean && password.length >= 6 && (login || name.trim().length >= 2);

  const submit = async () => {
    if (!ok || !clean || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true); setProblem(null);
    try {
      const cleanWa = normalizePhone(wa);
      const res = login
        ? await api.login(clean, password)
        : await api.register({
            name: name.trim(), surname: surname.trim() || undefined,
            phone: clean, whatsapp: cleanWa && cleanWa !== clean ? cleanWa : undefined,
            password,
          });
      onDone({
        name: res.profile.name, surname: res.profile.surname ?? undefined,
        phone: res.profile.phone, whatsapp: res.profile.whatsapp ?? undefined,
        hasPassword: res.profile.hasPassword,
      }, res.token);
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Не получилось. Попробуйте ещё раз.');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Аккаунт' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Eyebrow>{login ? 'Вход' : 'Регистрация · 30 секунд'}</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>
            {login ? 'ВХОД\nВ АККАУНТ' : 'СОЗДАТЬ\nАККАУНТ'}
          </Text>
          <Text style={s.lede}>
            {login
              ? 'Этот номер уже защищён паролем. Введите его, чтобы увидеть свои записи.'
              : 'Клуб узнаёт вас по номеру телефона, а пароль закрывает ваши записи от чужих глаз.'}
          </Text>
        </View>

        <Text style={s.label}>Телефон</Text>
        <TextInput style={s.input} value={phone} onChangeText={setPhone}
          placeholder="+7 928 000-00-00" placeholderTextColor={C.busy}
          keyboardType="phone-pad" textContentType="telephoneNumber"
          accessibilityLabel="Номер телефона" />

        {!login && (
          <>
            <Text style={s.label}>Имя</Text>
            <TextInput style={s.input} value={name} onChangeText={setName}
              placeholder="Как к вам обращаться" placeholderTextColor={C.busy}
              autoCapitalize="words" textContentType="givenName"
              accessibilityLabel="Имя" />

            <Text style={s.label}>Фамилия</Text>
            <TextInput style={s.input} value={surname} onChangeText={setSurname}
              placeholder="Необязательно" placeholderTextColor={C.busy}
              autoCapitalize="words" textContentType="familyName"
              accessibilityLabel="Фамилия" />

            <Text style={s.label}>WhatsApp</Text>
            <TextInput style={s.input} value={wa} onChangeText={setWa}
              placeholder="Если номер другой" placeholderTextColor={C.busy}
              keyboardType="phone-pad" accessibilityLabel="Номер WhatsApp" />
          </>
        )}

        <View style={s.labelRow}>
          <Text style={[s.label, { flex: 1, marginTop: 0, paddingRight: 0 }]}>Пароль</Text>
          <Pressable onPress={() => setShow(v => !v)} hitSlop={10} style={s.showBtn}
            accessibilityRole="button"
            accessibilityLabel={show ? 'Скрыть пароль' : 'Показать пароль'}>
            <Text style={s.showT}>{show ? 'скрыть' : 'показать'}</Text>
          </Pressable>
        </View>
        <TextInput style={s.input} value={password} onChangeText={setPassword}
          placeholder={login ? 'Ваш пароль' : 'Не короче 6 знаков'}
          placeholderTextColor={C.busy} secureTextEntry={!show}
          autoCapitalize="none" autoCorrect={false}
          textContentType={login ? 'password' : 'newPassword'}
          accessibilityLabel="Пароль" />

        <Text style={s.hint}>
          {login
            ? 'Забыли пароль — скажите менеджеру, он сбросит его, и вы зададите новый.'
            : 'Пароль хранится у клуба только в зашифрованном виде: подсмотреть его нельзя, а забытый задаётся заново через менеджера.'}
        </Text>

        {state === 'known' && (
          <Text style={s.found}>
            Клуб уже знает этот номер — данные подставились. Осталось придумать пароль.
          </Text>
        )}
        {!!problem && <Text style={s.problem}>{problem}</Text>}

        <Pressable onPress={submit} disabled={!ok || busy} accessibilityRole="button"
          style={({ pressed }) => [s.cta, (!ok || busy) && s.ctaOff,
            pressed && ok && { opacity: 0.9 }]}>
          <Text style={[s.ctaT, (!ok || busy) && { color: C.busy }]}>
            {busy ? 'Минуту…' : login ? 'Войти' : 'Создать аккаунт'}
          </Text>
        </Pressable>
        {!ok && (
          <Text style={s.barSub}>
            {!clean ? 'Введите номер телефона'
              : (!login && name.trim().length < 2) ? 'Введите имя'
              : 'Пароль не короче 6 знаков'}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Правка данных ─────────────────────────────────────────────────────── */

function EditForm({ profile, onDone, onCancel }: {
  profile: Profile; onDone: (p: Profile) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(profile.name);
  const [surname, setSurname] = useState(profile.surname ?? '');
  const [wa, setWa] = useState(profile.whatsapp ? prettyPhone(profile.whatsapp) : '');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const ok = name.trim().length >= 2;

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setProblem(null);
    try {
      const res = await api.updateMe({
        name: name.trim(), surname: surname.trim(),
        whatsapp: normalizePhone(wa) ?? undefined,
      });
      onDone({
        name: res.profile.name, surname: res.profile.surname ?? undefined,
        phone: res.profile.phone, whatsapp: res.profile.whatsapp ?? undefined,
        hasPassword: res.profile.hasPassword,
      });
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Не вышло сохранить');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Мои данные' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Eyebrow>Мои данные</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>МОИ{'\n'}ДАННЫЕ</Text>
          <Text style={s.lede}>
            Номер {prettyPhone(profile.phone)} менять нельзя — по нему клуб вас узнаёт.
          </Text>
        </View>

        <Text style={s.label}>Имя</Text>
        <TextInput style={s.input} value={name} onChangeText={setName}
          autoCapitalize="words" accessibilityLabel="Имя" />

        <Text style={s.label}>Фамилия</Text>
        <TextInput style={s.input} value={surname} onChangeText={setSurname}
          placeholder="Необязательно" placeholderTextColor={C.busy}
          autoCapitalize="words" accessibilityLabel="Фамилия" />

        <Text style={s.label}>WhatsApp</Text>
        <TextInput style={s.input} value={wa} onChangeText={setWa}
          placeholder="Если номер другой" placeholderTextColor={C.busy}
          keyboardType="phone-pad" accessibilityLabel="Номер WhatsApp" />

        {!!problem && <Text style={s.problem}>{problem}</Text>}

        <Pressable onPress={submit} disabled={!ok || busy} accessibilityRole="button"
          style={({ pressed }) => [s.cta, (!ok || busy) && s.ctaOff, pressed && { opacity: 0.9 }]}>
          <Text style={[s.ctaT, (!ok || busy) && { color: C.busy }]}>
            {busy ? 'Сохраняю…' : 'Сохранить'}
          </Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button"
          style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}>
          <Text style={s.linkT}>Отмена</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Пароль ────────────────────────────────────────────────────────────── */

function PasswordForm({ profile, onDone, onCancel }: {
  profile: Profile; onDone: (p: Profile) => void; onCancel: () => void;
}) {
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const has = profile.hasPassword !== false;
  const ok = next.length >= 6 && (!has || old.length >= 1);

  const submit = async () => {
    if (!ok || busy) return;
    setBusy(true); setProblem(null);
    try {
      const res = await api.updateMe({ password: next, oldPassword: has ? old : undefined });
      // Смена пароля закрывает прежние входы; своё устройство остаётся с новым токеном
      if (res.token) await saveToken(res.token);
      onDone({
        name: res.profile.name, surname: res.profile.surname ?? undefined,
        phone: res.profile.phone, whatsapp: res.profile.whatsapp ?? undefined,
        hasPassword: res.profile.hasPassword,
      });
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Не вышло сменить пароль');
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Пароль' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={s.head}>
          <Eyebrow>Безопасность</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>
            {has ? 'СМЕНИТЬ\nПАРОЛЬ' : 'ЗАДАТЬ\nПАРОЛЬ'}
          </Text>
          <Text style={s.lede}>
            После смены пароля вход на других устройствах закроется — на этом
            вы останетесь.
          </Text>
        </View>

        {has && (
          <>
            <Text style={s.label}>Текущий пароль</Text>
            <TextInput style={s.input} value={old} onChangeText={setOld}
              secureTextEntry={!show} autoCapitalize="none" autoCorrect={false}
              accessibilityLabel="Текущий пароль" />
          </>
        )}

        <View style={s.labelRow}>
          <Text style={[s.label, { flex: 1, marginTop: 0, paddingRight: 0 }]}>Новый пароль</Text>
          <Pressable onPress={() => setShow(v => !v)} hitSlop={10} style={s.showBtn}
            accessibilityRole="button"
            accessibilityLabel={show ? 'Скрыть пароль' : 'Показать пароль'}>
            <Text style={s.showT}>{show ? 'скрыть' : 'показать'}</Text>
          </Pressable>
        </View>
        <TextInput style={s.input} value={next} onChangeText={setNext}
          placeholder="Не короче 6 знаков" placeholderTextColor={C.busy}
          secureTextEntry={!show} autoCapitalize="none" autoCorrect={false}
          textContentType="newPassword" accessibilityLabel="Новый пароль" />

        {!!problem && <Text style={s.problem}>{problem}</Text>}

        <Pressable onPress={submit} disabled={!ok || busy} accessibilityRole="button"
          style={({ pressed }) => [s.cta, (!ok || busy) && s.ctaOff, pressed && { opacity: 0.9 }]}>
          <Text style={[s.ctaT, (!ok || busy) && { color: C.busy }]}>
            {busy ? 'Минуту…' : 'Сохранить пароль'}
          </Text>
        </Pressable>
        <Pressable onPress={onCancel} accessibilityRole="button"
          style={({ pressed }) => [s.link, pressed && { opacity: 0.7 }]}>
          <Text style={s.linkT}>Отмена</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ── Карточка человека, история и настройки ────────────────────────────── */

function Card({ profile, onEdit, onPassword, onForget }: {
  profile: Profile; onEdit: () => void; onPassword: () => void;
  onForget: () => Promise<void>;
}) {
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

  const leave = () => {
    const title = 'Выйти из аккаунта?';
    const msg = 'Записи останутся в клубе — вы увидите их снова, когда войдёте.';
    const go = async () => { try { await api.logout() } catch {} await onForget() };
    if (Platform.OS === 'web') { if (confirm(title + '\n\n' + msg)) go(); return }
    Alert.alert(title, msg, [
      { text: 'Остаться', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: go },
    ]);
  };

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: 'Аккаунт' }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <View style={s.head}>
          <Eyebrow>Аккаунт</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>{fullName(profile).toUpperCase()}</Text>
          <Text style={s.phone}>{prettyPhone(profile.phone)}</Text>
          {!!profile.whatsapp && (
            <Text style={s.phone}>WhatsApp · {prettyPhone(profile.whatsapp)}</Text>
          )}

          {profile.hasPassword === false && (
            <Pressable onPress={onPassword} accessibilityRole="button"
              style={({ pressed }) => [s.warn, pressed && { opacity: 0.85 }]}>
              <Text style={s.warnT}>Аккаунт без пароля</Text>
              <Text style={s.warnS}>
                Пока пароля нет, ваши записи может увидеть любой, кто знает ваш
                номер. Нажмите, чтобы задать пароль.
              </Text>
            </Pressable>
          )}

          <View style={s.stats}>
            <Stat n={played} label={plural(played, 'игра', 'игры', 'игр')} />
            <View style={s.statDiv} />
            <Stat n={soon} label="впереди" />
          </View>

          <View style={s.actions}>
            <Pressable onPress={onEdit} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, pressed && { opacity: 0.75 }]}>
              <Text style={s.ghostT}>Мои данные</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/(tabs)/bookings')} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, pressed && { opacity: 0.75 }]}>
              <Text style={s.ghostT}>Мои записи</Text>
            </Pressable>
          </View>
          <View style={s.actions}>
            <Pressable onPress={onPassword} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, pressed && { opacity: 0.75 }]}>
              <Text style={s.ghostT}>
                {profile.hasPassword === false ? 'Задать пароль' : 'Сменить пароль'}
              </Text>
            </Pressable>
            <Pressable onPress={leave} accessibilityRole="button"
              style={({ pressed }) => [s.ghost, pressed && { opacity: 0.75 }]}>
              <Text style={[s.ghostT, { color: C.dim }]}>Выйти</Text>
            </Pressable>
          </View>
        </View>

        <Text style={s.group}>История посещений</Text>

        {q.loading && !q.data && <Text style={s.empty}>Смотрю историю…</Text>}
        {!!q.error && !q.data && <Text style={s.empty}>{q.error}</Text>}
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

  warn: { marginTop: 16, padding: 14, borderWidth: 1,
    borderColor: 'rgba(240,169,59,.38)', backgroundColor: 'rgba(240,169,59,.08)' },
  warnT: { color: '#F0A93B', fontFamily: DISP, fontSize: 15, letterSpacing: -0.4 },
  warnS: { fontFamily: BODY, color: '#DFCCA8', fontSize: 13, lineHeight: 19, marginTop: 6 },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 16,
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
  labelRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: S.xl,
    marginTop: 16, marginBottom: 8 },
  showBtn: { minHeight: HIT, justifyContent: 'center', paddingHorizontal: 4 },
  showT: { color: C.limeDim, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase' },
  input: { marginHorizontal: S.xl, backgroundColor: C.surface, borderWidth: 1,
    borderColor: C.lineStrong, paddingVertical: 14, paddingHorizontal: 14,
    minHeight: 52, color: C.text, fontFamily: BODY, fontSize: 16 },
  hint: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 17,
    paddingHorizontal: S.xl, marginTop: 8 },
  found: { fontFamily: BODY, color: C.limeDim, fontSize: 12.5, lineHeight: 18,
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
});
