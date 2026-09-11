// Общие части записи: корты и футбольное поле собираются из одних деталей.
//
// Раньше у поля был свой экран со своей логикой, и каждая правка записи
// кортов до него не доходила. Теперь выбор даты, длительности, плитки времени,
// нижняя панель с кнопкой WhatsApp и галерея — здесь, в одном месте.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions, type ImageSourcePropType,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, HIT, DISP, DISP_MED, EYEBROW, BODY } from '../theme';
import { api, rub, mediaUrl, ApiError, type ApiGrid, type ApiHour } from '../api';
import { useApi } from '../useApi';
import { IMG, COURT_PHOTOS } from '../images';
import { IconWhatsApp } from './icons';
import { Gallery } from './gallery';
import { today, addDays, weekdayShort, dayNumber, dayMonth, hh, plural } from '../dates';
import { useClub } from '../club';
import {
  useProfile, fullName, normalizePhone, prettyPhone, saveToken, type Profile,
} from '../profile';

export const DAYS_AHEAD = 14;   // две недели: на прошлых пяти днях нельзя было занять следующие выходные
const COLS = 4;                 // плиток в ряду, как в образце
const GAP = 7;
export const CARD_PAD = 12;

export type Court = ApiGrid['courts'][number];
export type Sel = { courtId: string; hour: number } | null;

/** Ширина плитки: четыре в ряд ровно по полям страницы. Карточек с
 *  внутренними полями больше нет — плитки стоят прямо на фоне экрана. */
export function usePillWidth() {
  const { width } = useWindowDimensions();
  return Math.floor((Math.min(width, 520) - S.xl * 2 - GAP * (COLS - 1)) / COLS);
}

/** Можно ли начать в этот час на выбранную длительность. */
export const canStart = (h: ApiHour, hours: number) => h.status === 'free' && h.maxRun >= hours;

/** Фото площадки: загруженные клубом в админке, иначе временные. */
export function useCourtPhotos() {
  const q = useApi(() => api.courts(), [], 'courts.photos');
  return (courtId: string): ImageSourcePropType[] => {
    const c = q.data?.find(x => x.id === courtId);
    if (c?.photos?.length) return c.photos.map(u => ({ uri: mediaUrl(u) }));
    return COURT_PHOTOS[courtId] ?? [IMG[courtId] ?? IMG.c1];
  };
}

/* ── Дата ──────────────────────────────────────────────────────────────── */

export function DateStrip({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today(), i)), []);
  return (
    // flexGrow: 0 — иначе вложенная горизонтальная прокрутка растягивается по высоте
    <ScrollView horizontal showsHorizontalScrollIndicator={false}
      style={{ flexGrow: 0 }} contentContainerStyle={b.days}>
      {days.map(d => {
        const on = date === d;
        return (
          <Pressable key={d} onPress={() => onPick(d)}
            accessibilityRole="button" accessibilityState={{ selected: on }}
            style={[b.day, on && b.dayOn]}>
            <Text style={[b.dayW, on && { color: '#647068' }]}>{weekdayShort(d)}</Text>
            <Text style={[b.dayD, on && { color: C.ink }]}>{dayNumber(d)}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ── Шаги ──────────────────────────────────────────────────────────────── */

/** Номер шага и подпись — как в образце: «1 Сколько играем». */
export function Step({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <View style={b.step}>
      <View style={b.stepN}><Text style={b.stepNT}>{n}</Text></View>
      <Text style={b.stepT}>{title}</Text>
      {!!note && <Text style={b.stepNote}>— {note}</Text>}
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={b.card}>{children}</View>;
}

export function Durations({ max, hours, onPick }: {
  max: number; hours: number; onPick: (n: number) => void;
}) {
  return (
    <>
      <View style={b.durRow}>
        {Array.from({ length: max }, (_, i) => i + 1).map(n => {
          const on = hours === n;
          return (
            <Pressable key={n} onPress={() => onPick(n)}
              accessibilityRole="button"
              accessibilityLabel={`${n} ${plural(n, 'час', 'часа', 'часов')}`}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [b.dur, on && b.durOn, pressed && !on && { opacity: 0.8 }]}>
              <Text style={[b.durT, on && { color: C.onLime }]}>{n} ч</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={b.durHint}>Минимальная бронь — 1 час</Text>
    </>
  );
}

/* ── Плитки времени ────────────────────────────────────────────────────── */

/** Подряд идущие часы с одной ценой — одна группа под заголовком «2 000 ₽».
 *  Особая цена (скажем, дороже в выходные) сама встанет отдельной группой. */
function bands(hs: ApiHour[]) {
  const out: { price: number; hours: ApiHour[] }[] = [];
  for (const h of hs) {
    const last = out[out.length - 1];
    if (last && last.price === h.price
        && last.hours[last.hours.length - 1].hour === h.hour - 1) last.hours.push(h);
    else out.push({ price: h.price, hours: [h] });
  }
  return out;
}

export function Slots({ court, hours, sel, pillW, onPick }: {
  court: Court; hours: number; sel: Sel; pillW: number;
  onPick: (courtId: string, h: ApiHour) => void;
}) {
  // Прошедшие часы не показываем: занять их нельзя
  const live = court.hours.filter(h => h.status !== 'past');
  if (court.closed) return <Text style={b.note}>Закрыто — записаться нельзя</Text>;
  if (live.length === 0) return <Text style={b.note}>На этот день время закончилось</Text>;

  return (
    <>
      {bands(live).map(band => (
        <View key={band.hours[0].hour} style={b.part}>
          <Text style={b.partT}>{rub(band.price)}</Text>
          <View style={b.pills}>
            {band.hours.map(h => {
              const ok = canStart(h, hours);
              const on = !!sel && sel.courtId === court.courtId && sel.hour === h.hour;
              const covered = !!sel && sel.courtId === court.courtId
                && h.hour > sel.hour && h.hour < sel.hour + hours;
              const busy = h.status !== 'free';
              // Все часы брони подсвечены одинаково — одним блоком, а не
              // «первый залит, остальные обведены»: так видно, что взято
              // именно три часа подряд.
              const picked = on || covered;
              return (
                <Pressable key={h.hour} disabled={!ok} onPress={() => onPick(court.courtId, h)}
                  accessibilityRole="button"
                  accessibilityLabel={`${court.name}, ${hh(h.hour)}, ${
                    picked ? 'входит в бронь' : ok ? 'свободно' : busy ? 'занято' : 'не хватает времени'}`}
                  accessibilityState={{ selected: picked, disabled: !ok }}
                  style={({ pressed }) => [b.pill, { width: pillW },
                    busy ? b.pillBusy : ok ? b.pillFree : b.pillShort,
                    picked && b.pillOn,
                    pressed && ok && !picked && { opacity: 0.8 }]}>
                  <Text style={[b.pillT, busy ? b.pillTBusy : ok ? null : b.pillTShort,
                    picked && { color: C.onLime }]}>
                    {hh(h.hour)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}

/* ── Бронь: текст, WhatsApp, заявка ────────────────────────────────────── */

export type Booking = ReturnType<typeof useBooking>;

/** Всё про отправку брони: сумма, предоплата, сообщение в WhatsApp, заявка.
 *
 *  Заявка всегда заводится в приложении на конкретного человека: иначе её не
 *  к кому привязать — ни истории, ни «Моих записей», ни уведомления, когда
 *  менеджер подтвердит. У кого аккаунта нет, сначала спрашиваем телефон и
 *  имя (окно «Кто бронирует»), пароль не нужен. */
export function useBooking({ date, hours, sel, court, onTaken }: {
  date: string; hours: number; sel: Sel; court: Court | null; onTaken: () => void;
}) {
  const club = useClub();
  const { profile, save } = useProfile();
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  // Цена складывается по часам: утро и вечер стоят по-разному
  const total = useMemo(() => {
    if (!court || !sel) return 0;
    let sum = 0;
    for (let h = sel.hour; h < sel.hour + hours; h++) {
      sum += court.hours.find(x => x.hour === h)?.price ?? 0;
    }
    return sum;
  }, [court, sel, hours]);
  // Округляем до рубля вверх — так менеджеру называть сумму проще
  const prepay = Math.ceil(total * club.prepayPercent / 100 / 100) * 100;

  /** Сразу к делу, без приветствия — так попросил заказчик. Клуб может
   *  поменять формулировку в админке; подстановки: {корт} {дата} {время}
   *  {часы} {цена}. Имя и номер заявки добавляются сами. */
  const message = (who: Profile | null, bookingId?: number, clientId?: number) => {
    if (!sel || !court) return '';
    const tpl = club.waTemplate?.trim()
      || 'Хочу забронировать {корт} на {дата}, {время} ({часы}), {цена}.';
    const lines = [tpl
      .replace(/\{корт\}/g, court.name)
      .replace(/\{дата\}/g, dayMonth(date))
      .replace(/\{время\}/g, `${hh(sel.hour)} → ${hh(sel.hour + hours)}`)
      .replace(/\{часы\}/g, `${hours} ${plural(hours, 'час', 'часа', 'часов')}`)
      .replace(/\{цена\}/g, rub(total))];
    // Кто и с какого аккаунта: если две заявки придут одновременно, менеджер
    // различит их по номеру аккаунта и найдёт в админке по номеру заявки
    if (who) {
      lines.push(`Меня зовут ${fullName(who)}.`);
      lines.push(`Аккаунт${clientId ? ` №${clientId}` : ''}: ${prettyPhone(who.phone)}.`);
    }
    if (bookingId) lines.push(`Заявка №${bookingId} в приложении.`);
    return lines.join('\n');
  };

  const openWhatsApp = async (text: string) => {
    const digits = (club.whatsapp ?? '').replace(/\D/g, '');
    try { await Linking.openURL(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`) }
    catch {
      const msg = 'Не получилось открыть WhatsApp. Напишите менеджеру вручную.';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('WhatsApp', msg);
    }
  };

  const toForm = () => {
    if (!sel || !court) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/book', params: {
      courtId: sel.courtId, name: court.name, date,
      hour: String(sel.hour), hours: String(hours), price: String(total) } });
  };

  // На случай, если номер WhatsApp в админке сотрут: кнопка не мёртвая, а
  // предлагает отправить заявку через приложение.
  const stub = () => {
    const title = 'WhatsApp клуба скоро подключим';
    const text = 'Пока можно отправить заявку через приложение — менеджер увидит её и свяжется с вами.';
    if (Platform.OS === 'web') { if (confirm(`${title}\n\n${text}`)) toForm(); return }
    Alert.alert(title, text, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отправить заявку', onPress: toForm },
    ]);
  };

  const bookInWhatsApp = async (who: Profile | null = profile) => {
    if (!sel || !court || sending) return;
    if (!who) { setAsking(true); return }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setProblem(null);
    setSending(true);
    try {
      const res = await api.book({
        courtId: sel.courtId, date, hour: sel.hour, hours,
        name: who.name, surname: who.surname, phone: who.phone, whatsapp: who.whatsapp,
      });
      await openWhatsApp(message(who, res.id, res.clientId));
      // Вернётся из WhatsApp — увидит, что заявка принята и что дальше
      router.replace({ pathname: '/sent', params: {
        id: String(res.id), name: res.courtName, date,
        hour: String(sel.hour), hours: String(hours), price: String(res.price),
        holdUntil: res.holdUntil ?? '' } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slot_taken') {
        setProblem('Это время только что заняли. Выберите другое.');
        onTaken();
      } else {
        setProblem(e instanceof ApiError ? e.message : 'Не получилось отправить заявку.');
      }
    } finally {
      setSending(false);
    }
  };

  /** Ответ из окна «Кто бронирует»: запоминаем человека и сразу бронируем. */
  const withWho = async (p: Profile, token?: string) => {
    if (token) await saveToken(token);
    await save(p);
    setAsking(false);
    await bookInWhatsApp(p);
  };

  return {
    total, prepay, sending, problem, setProblem, asking, withWho,
    cancelAsk: () => setAsking(false),
    submit: () => { club.whatsapp ? bookInWhatsApp() : stub() },
    prepayPercent: club.prepayPercent,
  };
}

/** Панель выбранного времени: где, когда, сколько, сколько внести сейчас. */
export function BookingSheet({ court, date, sel, hours, booking, onReset }: {
  court: Court; date: string; sel: NonNullable<Sel>; hours: number;
  booking: Booking; onReset: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[b.sheet, { paddingBottom: insets.bottom + 12 }]}>
      <View style={b.sumRow}>
        <Text style={b.sumL}>{court.name} · {dayMonth(date)}</Text>
        <Text style={b.sumR}>
          {hh(sel.hour)} → {hh(sel.hour + hours)} · <Text style={{ color: C.lime }}>{rub(booking.total)}</Text>
        </Text>
      </View>
      <View style={[b.sumRow, b.sumRow2]}>
        <Text style={b.prepayL}>Предоплата {booking.prepayPercent} %</Text>
        <Text style={b.prepayR}>{rub(booking.prepay)}</Text>
      </View>

      {!!booking.problem && <Text style={b.problem}>{booking.problem}</Text>}

      <Pressable onPress={booking.submit} disabled={booking.sending}
        accessibilityRole="button" accessibilityLabel="Забронировать в WhatsApp"
        style={({ pressed }) => [b.wa, (pressed || booking.sending) && { opacity: 0.85 }]}>
        <IconWhatsApp size={20} color="#04240F" />
        <Text style={b.waT}>{booking.sending ? 'Минуту…' : 'Забронировать в WhatsApp'}</Text>
      </Pressable>

      <Pressable onPress={() => { Haptics.selectionAsync(); onReset() }}
        accessibilityRole="button" hitSlop={8}
        style={({ pressed }) => [b.clear, pressed && { opacity: 0.6 }]}>
        <Text style={b.clearT}>сбросить выбор</Text>
      </Pressable>

      <WhoSheet visible={booking.asking} onCancel={booking.cancelAsk} onDone={booking.withWho} />
    </View>
  );
}

/** «Кто бронирует» — для тех, у кого ещё нет аккаунта.
 *
 *  Два поля: телефон и имя. Пароль не нужен — его можно задать позже в
 *  аккаунте. Если номер уже защищён паролем, окно просит пароль, иначе бронь
 *  привязалась бы к чужому аккаунту без его ведома. */
function WhoSheet({ visible, onCancel, onDone }: {
  visible: boolean; onCancel: () => void; onDone: (p: Profile, token?: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'unknown' | 'new' | 'known' | 'protected'>('unknown');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clean = normalizePhone(phone);
  // Ключ уже спрошенного номера — в ref: состояние перезапускало бы эффект
  const asked = useRef<string | null>(null);

  useEffect(() => {
    if (!clean || clean === asked.current) return;
    asked.current = clean;
    api.checkPhone(clean).then(r => {
      setState(!r.known ? 'new' : r.hasPassword ? 'protected' : 'known');
      const p = r.profile;
      if (p) setName(n => n.trim() ? n : p.name);
    }).catch(() => setState('new'));
  }, [clean]);

  const login = state === 'protected';
  const ok = !!clean && (login ? password.length >= 6 : name.trim().length >= 2);

  const submit = async () => {
    if (!ok || !clean || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true); setProblem(null);
    try {
      if (login) {
        const res = await api.login(clean, password);
        onDone({
          name: res.profile.name, surname: res.profile.surname ?? undefined,
          phone: res.profile.phone, whatsapp: res.profile.whatsapp ?? undefined,
          hasPassword: true,
        }, res.token);
      } else {
        onDone({ name: name.trim(), phone: clean, hasPassword: false });
      }
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'Не получилось. Попробуйте ещё раз.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}
      statusBarTranslucent>
      <KeyboardAvoidingView style={b.whoBack} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={{ flex: 1 }} onPress={onCancel} accessibilityLabel="Закрыть" />
        <View style={[b.who, { paddingBottom: insets.bottom + 14 }]}>
          <Text style={b.whoT}>Кто бронирует</Text>
          <Text style={b.whoP}>
            Номер нужен, чтобы клуб подтвердил бронь, а вы видели её в «Моих записях».
          </Text>

          <Text style={b.whoL}>Телефон</Text>
          <TextInput style={b.whoIn} value={phone} onChangeText={setPhone}
            placeholder="+7 928 000-00-00" placeholderTextColor={C.busy}
            keyboardType="phone-pad" textContentType="telephoneNumber" autoFocus
            accessibilityLabel="Номер телефона" />

          {login ? (
            <>
              <Text style={b.whoL}>Пароль</Text>
              <TextInput style={b.whoIn} value={password} onChangeText={setPassword}
                placeholder="Номер защищён паролем" placeholderTextColor={C.busy}
                secureTextEntry autoCapitalize="none" autoCorrect={false}
                textContentType="password" accessibilityLabel="Пароль" />
            </>
          ) : (
            <>
              <Text style={b.whoL}>Имя</Text>
              <TextInput style={b.whoIn} value={name} onChangeText={setName}
                placeholder="Как к вам обращаться" placeholderTextColor={C.busy}
                autoCapitalize="words" textContentType="givenName"
                accessibilityLabel="Имя" />
            </>
          )}

          {!!problem && <Text style={b.problem}>{problem}</Text>}

          <Pressable onPress={submit} disabled={!ok || busy} accessibilityRole="button"
            accessibilityLabel="Продолжить в WhatsApp"
            style={({ pressed }) => [b.wa, { marginTop: 16 }, (!ok || busy) && b.waOff,
              pressed && ok && { opacity: 0.85 }]}>
            <IconWhatsApp size={20} color={ok ? '#04240F' : C.dim2} />
            <Text style={[b.waT, !ok && { color: C.dim2 }]}>
              {busy ? 'Минуту…' : 'Продолжить в WhatsApp'}
            </Text>
          </Pressable>
          <Pressable onPress={onCancel} accessibilityRole="button"
            style={({ pressed }) => [b.clear, pressed && { opacity: 0.6 }]}>
            <Text style={b.clearT}>отмена</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ── Галерея на весь экран ─────────────────────────────────────────────── */

/** Фото площадки поверх экрана: листаются пальцем, одна кнопка — «Закрыть». */
export function GalleryModal({ title, photos, onClose }: {
  title: string | null; photos: ImageSourcePropType[]; onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <Modal visible={!!title} transparent animationType="fade" onRequestClose={onClose}
      statusBarTranslucent>
      <View style={[b.galBack, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 16 }]}>
        <Text style={b.galT}>{title}</Text>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          {!!title && <Gallery photos={photos} height={Math.round(width * 0.8)} />}
        </View>
        <Pressable onPress={onClose} accessibilityRole="button"
          style={({ pressed }) => [b.galClose, pressed && { opacity: 0.8 }]}>
          <Text style={b.galCloseT}>Закрыть</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const b = StyleSheet.create({
  days: { flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: S.xl, paddingTop: 12 },
  // 58, а не 52: «СЕГОДНЯ» не влезало и обрезалось — заметно было на белой
  // плашке выбранного дня
  day: { width: 58, height: 52, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: C.text, borderColor: C.text },
  dayW: { ...EYEBROW, fontSize: 11, letterSpacing: 0.2, color: C.dim2 },
  dayD: { color: C.text, fontFamily: DISP, fontSize: 18, letterSpacing: -0.8, marginTop: 2 },

  step: { flexDirection: 'row', alignItems: 'center', gap: 9, flexWrap: 'wrap',
    paddingHorizontal: S.xl, marginTop: 22, marginBottom: 10 },
  stepN: { width: 22, height: 22, backgroundColor: C.lime,
    alignItems: 'center', justifyContent: 'center' },
  stepNT: { color: C.onLime, fontFamily: DISP, fontSize: 12 },
  stepT: { ...EYEBROW, color: C.text, fontSize: 12, letterSpacing: 1.4 },
  stepNote: { fontFamily: BODY, color: C.dim2, fontSize: 12 },

  // Без фона и рамки: заказчик просил убрать лишние заливки
  card: { marginHorizontal: S.xl, marginBottom: 10 },

  durRow: { flexDirection: 'row', gap: GAP },
  dur: { flex: 1, minHeight: HIT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.ink2 },
  durOn: { backgroundColor: C.lime, borderColor: C.lime },
  durT: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.3 },
  durHint: { fontFamily: BODY, color: C.dim, fontSize: 12.5, lineHeight: 18,
    marginTop: 10, textAlign: 'center' },

  note: { fontFamily: BODY, color: C.dim, fontSize: 13.5, paddingVertical: 12 },
  part: { marginTop: 8 },
  partT: { color: C.text, fontFamily: DISP, fontSize: 16, letterSpacing: -0.4,
    fontVariant: ['tabular-nums'], marginBottom: 8 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  pill: { height: HIT, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  // Плитки без заливки: свободную выделяет рамка, занятую — цвет цифр
  pillFree: { backgroundColor: 'transparent', borderColor: 'rgba(201,242,61,0.5)' },
  pillBusy: { backgroundColor: 'transparent', borderColor: 'rgba(255,85,56,0.3)' },
  pillShort: { backgroundColor: 'transparent', borderColor: C.line, borderStyle: 'dashed' },
  pillOn: { backgroundColor: C.lime, borderColor: C.lime, borderStyle: 'solid' },
  pillT: { color: C.text, fontFamily: DISP, fontSize: 14, letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] },
  pillTBusy: { color: '#D98B7C' },
  pillTShort: { color: C.dim2 },

  sheet: { paddingHorizontal: S.xl, paddingTop: 14, backgroundColor: 'rgba(6,18,13,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 8 },
  sumRow2: { marginBottom: 14, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  sumL: { ...EYEBROW, color: C.dim, fontSize: 11, letterSpacing: 1, flexShrink: 1 },
  sumR: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] },
  prepayL: { fontFamily: DISP_MED, color: C.text, fontSize: 14 },
  prepayR: { fontFamily: DISP, color: C.lime, fontSize: 16, letterSpacing: -0.4,
    fontVariant: ['tabular-nums'] },
  problem: { fontFamily: BODY, color: '#F0B6A8', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  wa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', minHeight: 52 },
  waT: { color: '#04240F', fontFamily: DISP, fontSize: 14, letterSpacing: 0.4,
    textTransform: 'uppercase' },
  clear: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14, marginTop: 2,
    minHeight: HIT, justifyContent: 'center' },
  clearT: { fontFamily: BODY, color: C.dim, fontSize: 13.5, textDecorationLine: 'underline' },

  // Сплошной фон: сквозь полупрозрачный просвечивали плитки записи
  galBack: { flex: 1, backgroundColor: C.ink },

  whoBack: { flex: 1, backgroundColor: 'rgba(2,7,5,0.72)' },
  who: { backgroundColor: C.ink2, paddingHorizontal: S.xl, paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  whoT: { color: C.text, fontFamily: DISP, fontSize: 22, letterSpacing: -0.6,
    textTransform: 'uppercase' },
  whoP: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 6 },
  whoL: { ...EYEBROW, color: C.dim2, marginTop: 16, marginBottom: 8 },
  whoIn: { borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.ink,
    paddingVertical: 14, paddingHorizontal: 14, minHeight: 52,
    color: C.text, fontFamily: BODY, fontSize: 16 },
  waOff: { backgroundColor: '#15251B' },
  galT: { color: C.text, fontFamily: DISP, fontSize: 20, letterSpacing: -0.5,
    textTransform: 'uppercase', paddingHorizontal: S.xl },
  galClose: { marginHorizontal: S.xl, minHeight: 50, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface },
  galCloseT: { color: C.text, fontFamily: DISP_MED, fontSize: 12, letterSpacing: 1.4,
    textTransform: 'uppercase' },
});
