// Запись на турнир — форма в приложении.
//
// Раньше заявка уходила менеджеру в WhatsApp. Заказчик попросил записывать
// онлайн: человек сам вписывает имя, фамилию и телефон, заявка ждёт
// подтверждения администратора, а ответ приходит в уведомления и виден
// на странице турнира и в «Моих записях».
//
// Номер, защищённый паролем, без входа записать нельзя — как и при брони:
// иначе кто угодно записал бы чужой аккаунт.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { C, R, S, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, getToken, ApiError } from '../src/api';
import { useApi } from '../src/useApi';
import { normalizePhone, saveToken, useProfile } from '../src/profile';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { hh, dayMonth, dateOfIso, hourOfIso } from '../src/dates';

type PhoneState = 'unknown' | 'new' | 'known' | 'protected' | 'mine';

export default function TournamentEntry() {
  useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile, ready, save } = useProfile();

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<PhoneState>('unknown');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const filled = useRef(false);

  // Уже знакомый человек — поля заполнены, остаётся проверить и отправить
  useEffect(() => {
    if (!ready || filled.current) return;
    filled.current = true;
    if (!profile) return;
    setName(profile.name ?? '');
    setSurname(profile.surname ?? '');
    setPhone(profile.phone ?? '');
  }, [ready, profile]);

  const clean = normalizePhone(phone);
  // Вошёл в аккаунт с этим номером на этом устройстве — пароль не спрашиваем
  const loggedIn = !!clean && !!getToken() && normalizePhone(profile?.phone ?? '') === clean;

  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!clean) { setState('unknown'); asked.current = null; return }
    if (loggedIn) { setState('mine'); return }
    if (clean === asked.current) return;
    asked.current = clean;
    api.checkPhone(clean)
      .then(r => setState(!r.known ? 'new' : r.hasPassword ? 'protected' : 'known'))
      .catch(() => setState('new'));
  }, [clean, loggedIn]);

  const q = useApi(async () => {
    const all = await api.tournaments(profile?.phone);
    return all.find(t => String(t.id) === String(id)) ?? null;
  }, [id]);

  const screen = <Stack.Screen options={{ title: 'Запись на турнир' }} />;
  if (q.loading || !ready) return (<>{screen}<Loading /></>);
  if (q.error) return (<>{screen}<Failed message={q.error} onRetry={q.reload} /></>);
  const t = q.data;
  if (!t) return (<>{screen}
    <NotFound title="Турнир не найден" note="Все турниры — во вкладке «Турниры»." /></>);

  const date = dateOfIso(t.startsAt);
  const left = Math.max(0, t.seats - t.taken);
  const closed = t.state !== 'open' ? 'Запись на этот турнир закрыта'
    : left === 0 ? 'Мест больше нет' : null;

  const login = state === 'protected';
  const nameOk = name.trim().length >= 2;
  const surnameOk = surname.trim().length >= 2;
  const ok = !closed && !!clean && nameOk && surnameOk && (!login || password.length >= 6);

  const submit = async () => {
    if (!ok || !clean || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true); setProblem(null);
    try {
      let hasPassword = loggedIn ? !!profile?.hasPassword : false;
      let id: number | undefined = loggedIn ? profile?.id : undefined;
      if (login) {
        const s = await api.login(clean, password);
        await saveToken(s.token);
        hasPassword = true; id = s.profile.id;
      }
      const res = await api.enterTournament(t.id,
        { name: name.trim(), surname: surname.trim(), phone: clean });
      await save({
        ...(profile && normalizePhone(profile.phone) === clean ? profile : {}),
        name: name.trim(), surname: surname.trim(), phone: clean,
        id: res.clientId ?? id, hasPassword,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace({ pathname: '/sent', params: {
        kind: 'tournament', id: String(res.id), name: t.name, date,
        hour: String(hourOfIso(t.startsAt)), hours: String(t.hours ?? 1), price: String(t.fee) } });
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Не получилось отправить заявку. Проверьте интернет.');
      q.refresh();
    } finally { setBusy(false) }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}>
      {screen}
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

        <View style={s.card}>
          <Text style={s.eyebrow}>Турнир</Text>
          <Text style={s.title}>{t.name}</Text>
          <View style={s.facts}>
            {/* «21» крупно, месяц ниже: «21 сентября» в узкую колонку не влезало */}
            <Fact k="Дата" v={dayMonth(date).split(' ')[0]} sub={dayMonth(date).split(' ').slice(1).join(' ')} />
            <Fact k="Начало" v={hh(hourOfIso(t.startsAt))} />
            <Fact k="Взнос" v={rub(t.fee)} sub="в клубе" />
            <Fact k="Мест" v={`${left}`} sub={`из ${t.seats}`} last />
          </View>
        </View>

        <Text style={s.section}>Участник</Text>

        <Field label="Имя" value={name} onChange={setName} placeholder="Как вас зовут"
          autoCapitalize="words" textContentType="givenName" />
        <Field label="Фамилия" value={surname} onChange={setSurname} placeholder="Для списка участников"
          autoCapitalize="words" textContentType="familyName" />
        <Field label="Телефон" value={phone} onChange={v => { setPhone(v); setProblem(null) }}
          placeholder="89289204029" keyboardType="phone-pad" textContentType="telephoneNumber"
          hint={state === 'mine' ? 'Вы вошли в аккаунт с этим номером'
            : login ? 'Номер защищён паролем — введите его, чтобы записаться'
            : 'По нему клуб свяжется с вами, если что-то изменится'} />
        {login && (
          <Field label="Пароль" value={password} onChange={setPassword} placeholder="Пароль от аккаунта"
            secure textContentType="password" autoCapitalize="none" />
        )}

        <View style={s.how}>
          <Step n="1" t="Отправляете заявку — место за вами придержано." />
          <Step n="2" t="Администратор проверяет и подтверждает участие." />
          <Step n="3" t="Приходит уведомление «Вы записаны», запись видна в «Моих записях»." />
        </View>
      </ScrollView>

      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) + 10 }]}>
        {!!(problem || closed) && <Text style={s.problem}>{problem ?? closed}</Text>}
        <Pressable onPress={submit} disabled={!ok || busy} accessibilityRole="button"
          accessibilityLabel="Отправить заявку на турнир"
          style={({ pressed }) => [s.cta, (!ok || busy) && s.ctaOff, pressed && ok && { opacity: 0.9 }]}>
          {busy ? <ActivityIndicator color={C.onLime} />
            : <Text style={[s.ctaT, !ok && { color: C.dim2 }]}>Отправить заявку</Text>}
        </Pressable>
        {!closed && !ok && !busy && (
          <Text style={s.need}>
            {!nameOk ? 'Впишите имя' : !surnameOk ? 'Впишите фамилию'
              : !clean ? 'Впишите номер телефона' : 'Введите пароль'}
          </Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Fact({ k, v, sub, last }: { k: string; v: string; sub?: string; last?: boolean }) {
  return (
    <View style={[s.fact, !last && s.factLine]}>
      <Text style={s.factK}>{k}</Text>
      <Text style={s.factV} numberOfLines={1} adjustsFontSizeToFit>{v}</Text>
      {!!sub && <Text style={s.factS} numberOfLines={1}>{sub}</Text>}
    </View>
  );
}

function Field({ label, value, onChange, placeholder, hint, secure, ...rest }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
  hint?: string; secure?: boolean;
  keyboardType?: 'phone-pad'; autoCapitalize?: 'words' | 'none';
  textContentType?: 'givenName' | 'familyName' | 'telephoneNumber' | 'password';
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChange}
        placeholder={placeholder} placeholderTextColor={C.dim2}
        secureTextEntry={secure} autoCorrect={false} accessibilityLabel={label} {...rest} />
      {!!hint && <Text style={s.hint}>{hint}</Text>}
    </View>
  );
}

function Step({ n, t }: { n: string; t: string }) {
  return (
    <View style={s.step}>
      <View style={s.stepN}><Text style={s.stepNT}>{n}</Text></View>
      <Text style={s.stepT}>{t}</Text>
    </View>
  );
}

const s = sheet(() => ({
  root: { flex: 1, backgroundColor: C.ink },

  card: { marginHorizontal: S.xl, marginTop: 14, padding: 16, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  eyebrow: { ...EYEBROW, color: C.accent },
  title: { ...TITLE.section, color: C.text, marginTop: 6, textTransform: 'uppercase' },
  facts: { flexDirection: 'row', marginTop: 14, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 },
  fact: { flex: 1, paddingHorizontal: 6 },
  factLine: { borderRightWidth: 1, borderRightColor: C.line },
  factK: { fontFamily: BODY, color: C.dim2, fontSize: 11 },
  factV: { fontFamily: DISP, color: C.text, fontSize: 16, letterSpacing: -0.3, marginTop: 3 },
  factS: { fontFamily: BODY, color: C.dim2, fontSize: 11, marginTop: 1 },

  section: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 22 },
  field: { marginHorizontal: S.xl, marginTop: 12 },
  label: { fontFamily: DISP_MED, color: C.text, fontSize: 13, marginBottom: 7 },
  input: { borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface,
    paddingVertical: 13, paddingHorizontal: 14, minHeight: 50, borderRadius: R.md,
    color: C.text, fontFamily: BODY, fontSize: 16 },
  hint: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 16, marginTop: 6 },

  how: { marginHorizontal: S.xl, marginTop: 22, padding: 14, gap: 10, borderRadius: R.xl,
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentBorder },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepN: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  stepNT: { fontFamily: DISP, color: C.onLime, fontSize: 11 },
  stepT: { flex: 1, fontFamily: BODY, color: C.text, fontSize: 13.5, lineHeight: 19, paddingTop: 1 },

  bar: { paddingHorizontal: S.xl, paddingTop: 12, backgroundColor: C.ink2,
    borderTopWidth: 1, borderTopColor: C.lineSoft },
  problem: { fontFamily: BODY, color: C.dangerText, fontSize: 13, lineHeight: 18,
    marginBottom: 10, textAlign: 'center' },
  cta: { backgroundColor: C.lime, borderRadius: R.lg, minHeight: 54,
    alignItems: 'center', justifyContent: 'center' },
  ctaOff: { backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6, textTransform: 'uppercase' },
  need: { fontFamily: BODY, color: C.dim2, fontSize: 12, textAlign: 'center', marginTop: 8 },
}));
