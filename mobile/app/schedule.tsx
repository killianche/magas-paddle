// Запись на корт — по образцу, который выбрал заказчик.
//
// Порядок как у человека в голове: сначала «сколько играем», потом «когда».
// Время — плитками по каждому корту, разложенными на утро, день и вечер;
// плитка сразу говорит, можно ли начать в этот час на выбранную длительность.
// Выбрал — снизу панель со сводкой и кнопкой «Забронировать в WhatsApp»:
// она открывает чат клуба с готовым сообщением. Так клуб и работает — бронь
// подтверждает менеджер после предоплаты.
//
// Если человек уже заходил в аккаунт, заявка заодно заводится и в приложении:
// время держится за ним, менеджер видит её в админке, человек — в «Моих
// записях». Без аккаунта уходит только сообщение в WhatsApp.
//
// Шаг — один час: сервер и цены клуба почасовые. Получасовых слотов и
// брони на полтора часа, как в образце, нет — это решение клуба (Q55).
import { useMemo, useState } from 'react';
import {
  Alert, Image, Linking, Modal, Platform, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY } from '../src/theme';
import { api, rub, mediaUrl, ApiError, type ApiGrid, type ApiHour } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { IMG } from '../src/images';
import { IconChevron, IconCheck, IconWhatsApp } from '../src/components/icons';
import { today, addDays, weekdayShort, dayNumber, dayMonth, hh, plural } from '../src/dates';
import { useClub } from '../src/club';
import { useProfile, fullName } from '../src/profile';

const DAYS_AHEAD = 14;   // две недели: на прошлых пяти днях нельзя было занять следующие выходные
/** Плиток в ряду, как в образце. */
const COLS = 4;
const GAP = 7;
const CARD_PAD = 12;

type Court = ApiGrid['courts'][number];

export default function Schedule() {
  const club = useClub();
  const { profile } = useProfile();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState(1);
  const [sel, setSel] = useState<{ courtId: string; hour: number } | null>(null);
  const [peek, setPeek] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const q = useApi(() => api.grid(date), [date], `grid.${date}`);
  const days = useMemo(
    () => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(today(), i)), []);

  // Ширина плитки считается от экрана: четыре в ряд без дыр справа
  // Минус 2 — рамка карточки: без неё четвёртая плитка не влезала и уезжала вниз
  const pillW = Math.floor(
    (Math.min(width, 520) - S.xl * 2 - CARD_PAD * 2 - 2 - GAP * (COLS - 1)) / COLS);

  const grid = q.data;
  // Только падел-корты: поле бронируется на своём экране
  const shown = (grid?.courts ?? []).filter(c => !c.isFootball);
  const court = grid?.courts.find(c => c.courtId === sel?.courtId) ?? null;

  /** Можно ли начать в этот час на выбранную длительность. */
  const canStart = (h: ApiHour) => h.status === 'free' && h.maxRun >= hours;

  // Цена складывается по часам: утро и вечер стоят по-разному
  const total = useMemo(() => {
    if (!court || !sel) return 0;
    let sum = 0;
    for (let h = sel.hour; h < sel.hour + hours; h++) {
      sum += court.hours.find(x => x.hour === h)?.price ?? 0;
    }
    return sum;
  }, [court, sel, hours]);

  const pickDate = (d: string) => {
    Haptics.selectionAsync();
    setDate(d); setSel(null); setProblem(null);
  };

  // Сменили длительность — выбранное время может перестать подходить
  const pickHours = (n: number) => {
    Haptics.selectionAsync();
    setHours(n); setProblem(null);
    if (sel && court) {
      const h = court.hours.find(x => x.hour === sel.hour);
      if (!h || !(h.status === 'free' && h.maxRun >= n)) setSel(null);
    }
  };

  const pickSlot = (courtId: string, h: ApiHour) => {
    if (!canStart(h)) return;
    Haptics.selectionAsync();
    setProblem(null);
    // Нажатие по выбранной плитке снимает выбор
    if (sel && sel.courtId === courtId && sel.hour === h.hour) { setSel(null); return }
    setSel({ courtId, hour: h.hour });
  };

  /** Текст для WhatsApp — такой, чтобы менеджеру не пришлось переспрашивать.
   *  Сразу к делу, без приветствия — так попросил заказчик. Клуб может
   *  поменять формулировку в админке; подстановки: {корт} {дата} {время}
   *  {часы} {цена}. Имя и номер заявки добавляются сами. */
  const message = (bookingId?: number) => {
    if (!sel || !court) return '';
    const tpl = club.waTemplate?.trim()
      || 'Хочу забронировать {корт} на {дата}, {время} ({часы}), {цена}.';
    const lines = [tpl
      .replace(/\{корт\}/g, court.name)
      .replace(/\{дата\}/g, dayMonth(date))
      .replace(/\{время\}/g, `${hh(sel.hour)} → ${hh(sel.hour + hours)}`)
      .replace(/\{часы\}/g, `${hours} ${plural(hours, 'час', 'часа', 'часов')}`)
      .replace(/\{цена\}/g, rub(total))];
    if (profile) lines.push(`Меня зовут ${fullName(profile)}.`);
    if (bookingId) lines.push(`Заявка №${bookingId} в приложении.`);
    return lines.join('\n');
  };

  const openWhatsApp = async (text: string) => {
    const digits = (club.whatsapp ?? '').replace(/\D/g, '');
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
    try { await Linking.openURL(url) }
    catch {
      const msg = 'Не получилось открыть WhatsApp. Напишите менеджеру вручную.';
      Platform.OS === 'web' ? alert(msg) : Alert.alert('WhatsApp', msg);
    }
  };

  const bookInWhatsApp = async () => {
    if (!sel || !court || sending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setProblem(null);

    // Без аккаунта — только сообщение: имени и телефона для заявки у нас нет
    if (!profile) { await openWhatsApp(message()); return }

    setSending(true);
    try {
      const b = await api.book({
        courtId: sel.courtId, date, hour: sel.hour, hours,
        name: profile.name, surname: profile.surname, phone: profile.phone,
        whatsapp: profile.whatsapp,
      });
      await openWhatsApp(message(b.id));
      // Вернётся из WhatsApp — увидит, что заявка принята и что дальше
      router.replace({ pathname: '/sent', params: {
        id: String(b.id), name: b.courtName, date,
        hour: String(sel.hour), hours: String(hours), price: String(b.price),
        holdUntil: b.holdUntil ?? '' } });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'slot_taken') {
        setProblem('Это время только что заняли. Выберите другое.');
        setSel(null); q.refresh();
      } else {
        setProblem(e instanceof ApiError ? e.message : 'Не получилось отправить заявку.');
      }
    } finally {
      setSending(false);
    }
  };

  // ЗАГЛУШКА: номер WhatsApp клуб ещё не дал (задаётся в админке, раздел
  // «Контакты»). Кнопка уже выглядит как надо, а нажатие объясняет, что
  // WhatsApp скоро подключат, и предлагает отправить заявку в приложении.
  const whatsappStub = () => {
    const title = 'WhatsApp клуба скоро подключим';
    const text = 'Пока можно отправить заявку через приложение — менеджер увидит её и свяжется с вами.';
    if (Platform.OS === 'web') { if (confirm(`${title}\n\n${text}`)) toForm(); return }
    Alert.alert(title, text, [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Отправить заявку', onPress: toForm },
    ]);
  };

  const toForm = () => {
    if (!sel || !court) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/book', params: {
      courtId: sel.courtId, name: court.name, date,
      hour: String(sel.hour), hours: String(hours), price: String(total) } });
  };

  if (q.loading) return (<><Stack.Screen options={{ title: 'Бронирование' }} /><Loading note="Смотрю, что свободно" /></>);
  if (q.error || !grid) return (<><Stack.Screen options={{ title: 'Бронирование' }} />
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);

  // Прошедшие часы не показываем: занять их нельзя
  const live = (c: Court) => c.hours.filter(h => h.status !== 'past');
  const nothingLeft = shown.every(c => live(c).length === 0);


  /** Подряд идущие часы с одной ценой — одна группа с заголовком
   *  «2 000 ₽ · 09:00 – 13:00». */
  const bands = (hs: ApiHour[]) => {
    const out: { price: number; hours: ApiHour[] }[] = [];
    for (const h of hs) {
      const last = out[out.length - 1];
      if (last && last.price === h.price
          && last.hours[last.hours.length - 1].hour === h.hour - 1) last.hours.push(h);
      else out.push({ price: h.price, hours: [h] });
    }
    return out;
  };

  const peeked = grid.courts.find(c => c.courtId === peek) ?? null;
  const hasWa = !!club.whatsapp;
  const prepay = Math.ceil(total * club.prepayPercent / 100 / 100) * 100;

  return (
    <View style={st.root}>
      <Stack.Screen options={{ title: 'Бронирование' }} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.refreshing} onRefresh={q.refresh} tintColor={C.dim} />}>

        {/* flexGrow: 0 — иначе вложенная горизонтальная прокрутка растягивается по высоте */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0 }} contentContainerStyle={st.days}>
          {days.map(d => {
            const on = date === d;
            return (
              <Pressable key={d} onPress={() => pickDate(d)}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                style={[st.day, on && st.dayOn]}>
                <Text style={[st.dayW, on && { color: '#647068' }]}>{weekdayShort(d)}</Text>
                <Text style={[st.dayD, on && { color: C.ink }]}>{dayNumber(d)}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Шаг 1: длительность ─────────────────────────────────────── */}
        <Step n={1} title="Сколько играем" />
        <View style={st.card}>
          <View style={st.durRow}>
            {Array.from({ length: grid.maxHours }, (_, i) => i + 1).map(n => {
              const on = hours === n;
              return (
                <Pressable key={n} onPress={() => pickHours(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} ${plural(n, 'час', 'часа', 'часов')}`}
                  accessibilityState={{ selected: on }}
                  style={({ pressed }) => [st.dur, on && st.durOn, pressed && !on && { opacity: 0.8 }]}>
                  <Text style={[st.durT, on && { color: C.onLime }]}>{n} ч</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={st.durHint}>Минимальная бронь — 1 час</Text>
        </View>

        {/* ── Шаг 2: время по кортам ──────────────────────────────────── */}
        <Step n={2} title="Выбери время" note="нажми на свободный час" />

        {nothingLeft && (
          <Text style={st.allPassed}>
            На сегодня время закончилось. Выберите другой день выше.
          </Text>
        )}

        {!nothingLeft && shown.map(c => {
          const hs = live(c);
          return (
            <View key={c.courtId} style={st.card}>
              {/* Шапка корта: нажатие показывает фотографию площадки */}
              <Pressable onPress={() => { Haptics.selectionAsync(); setPeek(c.courtId) }}
                accessibilityRole="button" accessibilityLabel={`${c.name}: фотография площадки`}
                style={({ pressed }) => [st.courtHead, pressed && { opacity: 0.7 }]}>
                <View style={st.courtNum}>
                  <Text style={st.courtNumT}>{c.name.replace(/\D/g, '') || '·'}</Text>
                </View>
                <Text style={st.courtName}>{c.name}</Text>
                <Text style={st.photoT}>фото</Text>
                <IconChevron size={14} color={C.dim2} />
              </Pressable>

              {c.closed ? (
                <Text style={st.closed}>Корт закрыт — записаться нельзя</Text>
              ) : bands(hs).map(b => {
                const free = b.hours.filter(canStart).length;
                const from = b.hours[0].hour, to = b.hours[b.hours.length - 1].hour + 1;
                return (
                  <View key={from} style={st.part}>
                    <View style={st.partHead}>
                      <Text style={st.partT}>{rub(b.price)}</Text>
                      <Text style={st.partTime}>{hh(from)} – {hh(to)}</Text>
                      <View style={{ flex: 1 }} />
                      <Text style={[st.partFree, free === 0 && { color: C.dim2 }]}>
                        {free === 0 ? 'всё занято' : `свободно ${free} из ${b.hours.length}`}
                      </Text>
                    </View>
                    <View style={st.pills}>
                      {b.hours.map(h => {
                        const ok = canStart(h);
                        const on = !!sel && sel.courtId === c.courtId && sel.hour === h.hour;
                        const covered = !!sel && sel.courtId === c.courtId
                          && h.hour > sel.hour && h.hour < sel.hour + hours;
                        const busy = h.status !== 'free';
                        return (
                          <Pressable key={h.hour} disabled={!ok} onPress={() => pickSlot(c.courtId, h)}
                            accessibilityRole="button"
                            accessibilityLabel={`${c.name}, ${hh(h.hour)}, ${
                              on ? 'выбрано' : ok ? 'свободно' : busy ? 'занято' : 'не хватает времени'}`}
                            accessibilityState={{ selected: on, disabled: !ok }}
                            style={({ pressed }) => [st.pill, { width: pillW },
                              busy ? st.pillBusy : ok ? st.pillFree : st.pillShort,
                              covered && st.pillCovered,
                              on && st.pillOn,
                              pressed && ok && !on && { opacity: 0.8 }]}>
                            <Text style={[st.pillT,
                              busy ? st.pillTBusy : ok ? null : st.pillTShort,
                              on && { color: C.onLime }]}>
                              {hh(h.hour)}
                            </Text>
                            {on && <View style={st.tick}><IconCheck size={10} color={C.onLime} active /></View>}
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          );
        })}

      </ScrollView>

      {/* ── Выбранное время: сводка и кнопка ────────────────────────── */}
      {sel && court && (
        <View style={[st.sheet, { paddingBottom: insets.bottom + 12 }]}>
          {/* Сводка — всё, что нужно знать перед нажатием: где, когда,
              сколько и сколько внести сейчас. Цена здесь, а не на кнопке:
              на кнопке она повторялась. */}
          <View style={st.sumRow}>
            <Text style={st.sumL}>{court.name} · {dayMonth(date)}</Text>
            <Text style={st.sumR}>
              {hh(sel.hour)} → {hh(sel.hour + hours)} · <Text style={{ color: C.lime }}>{rub(total)}</Text>
            </Text>
          </View>
          <View style={[st.sumRow, st.sumRow2]}>
            <Text style={st.prepayL}>Предоплата {club.prepayPercent} %</Text>
            <Text style={st.prepayR}>{rub(prepay)}</Text>
          </View>

          {!!problem && <Text style={st.problem}>{problem}</Text>}

          <Pressable onPress={hasWa ? bookInWhatsApp : whatsappStub} disabled={sending}
            accessibilityRole="button" accessibilityLabel="Забронировать в WhatsApp"
            style={({ pressed }) => [st.wa, (pressed || sending) && { opacity: 0.85 }]}>
            <IconWhatsApp size={20} color="#04240F" />
            <Text style={st.waT}>{sending ? 'Минуту…' : 'Забронировать в WhatsApp'}</Text>
          </Pressable>

          <Pressable onPress={() => { Haptics.selectionAsync(); setSel(null); setProblem(null) }}
            accessibilityRole="button" hitSlop={8}
            style={({ pressed }) => [st.clear, pressed && { opacity: 0.6 }]}>
            <Text style={st.clearT}>сбросить выбор</Text>
          </Pressable>
        </View>
      )}

      <CourtPeek court={peeked} onClose={() => setPeek(null)}
        onPick={() => { const id = peeked!.courtId; setPeek(null);
          router.push({ pathname: '/court', params: { id, date } }) }} />
    </View>
  );
}

/** Номер шага и подпись — как в образце: «1 Сколько играем». */
function Step({ n, title, note }: { n: number; title: string; note?: string }) {
  return (
    <View style={st.step}>
      <View style={st.stepN}><Text style={st.stepNT}>{n}</Text></View>
      <Text style={st.stepT}>{title}</Text>
      {!!note && <Text style={st.stepNote}>— {note}</Text>}
    </View>
  );
}

/** Фотография площадки поверх экрана. Корты отличаются покрытием и цветом
    пола, а по названию этого не видно. */
function CourtPeek({ court, onClose, onPick }: {
  court: Court | null; onClose: () => void; onPick: () => void;
}) {
  return (
    <Modal visible={!!court} transparent animationType="fade" onRequestClose={onClose}
      statusBarTranslucent>
      <Pressable style={st.peekBack} onPress={onClose} accessibilityLabel="Закрыть фотографию">
        {court && (
          <Pressable style={st.peek} onPress={() => {}}>
            <Image source={court.photo ? { uri: mediaUrl(court.photo) } : (IMG[court.courtId] ?? IMG.c1)}
              style={st.peekImg} resizeMode="cover" />
            <View style={st.peekIn}>
              <Text style={st.peekN}>{court.name}</Text>
              <Text style={st.peekS}>
                {court.closed ? 'Закрыта' :
                  `${court.hours.filter(h => h.status === 'free').length} свободных часов в этот день`}
              </Text>
              {/* ЗАГЛУШКА: пока это не снимки клуба — см. docs/PHOTO-CREDITS.md */}
              <Text style={st.peekNote}>
                Фотография временная. Настоящие снимки площадок клуб пришлёт позже.
              </Text>
              <View style={st.peekRow}>
                <Pressable onPress={onClose} accessibilityRole="button"
                  style={({ pressed }) => [st.peekBtn, pressed && { opacity: 0.8 }]}>
                  <Text style={st.peekBtnT}>Закрыть</Text>
                </Pressable>
                <Pressable onPress={onPick} accessibilityRole="button"
                  style={({ pressed }) => [st.peekBtn, st.peekBtnAcc, pressed && { opacity: 0.85 }]}>
                  <Text style={[st.peekBtnT, { color: C.onLime }]}>О площадке</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        )}
      </Pressable>
    </Modal>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },

  days: { flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingHorizontal: S.xl, paddingTop: 12 },
  day: { width: 52, height: 52, borderWidth: 1, borderColor: C.line,
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

  card: { marginHorizontal: S.xl, marginBottom: 10, padding: CARD_PAD,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },

  durRow: { flexDirection: 'row', gap: GAP },
  dur: { flex: 1, minHeight: HIT, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.ink2 },
  durOn: { backgroundColor: C.lime, borderColor: C.lime },
  durT: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.3 },
  durHint: { fontFamily: BODY, color: C.dim, fontSize: 12.5, lineHeight: 18,
    marginTop: 10, textAlign: 'center' },

  allPassed: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20,
    textAlign: 'center', paddingHorizontal: 30, paddingVertical: 24 },

  courtHead: { flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingBottom: 11, marginBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  courtNum: { width: 32, height: 32, backgroundColor: C.surface3,
    alignItems: 'center', justifyContent: 'center' },
  courtNumT: { color: C.text, fontFamily: DISP, fontSize: 16 },
  courtName: { flex: 1, color: C.text, fontFamily: DISP, fontSize: 18, letterSpacing: -0.5,
    textTransform: 'uppercase' },
  photoT: { ...EYEBROW, color: C.dim2, fontSize: 11, letterSpacing: 1 },
  closed: { fontFamily: BODY, color: C.dim, fontSize: 13, paddingVertical: 12 },

  part: { marginTop: 10 },
  partHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  partT: { color: C.text, fontFamily: DISP, fontSize: 16, letterSpacing: -0.4,
    fontVariant: ['tabular-nums'] },
  partTime: { fontFamily: DISP_MED, color: C.dim, fontSize: 12.5, fontVariant: ['tabular-nums'] },
  partFree: { fontFamily: DISP_MED, color: C.limeDim, fontSize: 11.5 },

  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  pill: { height: HIT, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pillFree: { backgroundColor: 'rgba(201,242,61,0.07)', borderColor: 'rgba(201,242,61,0.45)' },
  pillBusy: { backgroundColor: 'rgba(255,85,56,0.07)', borderColor: 'rgba(255,85,56,0.32)' },
  pillShort: { backgroundColor: 'transparent', borderColor: C.line, borderStyle: 'dashed' },
  pillCovered: { backgroundColor: 'rgba(201,242,61,0.22)', borderColor: C.lime },
  pillOn: { backgroundColor: C.lime, borderColor: C.lime },
  pillT: { color: C.text, fontFamily: DISP, fontSize: 14, letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] },
  pillTBusy: { color: '#D98B7C' },
  pillTShort: { color: C.dim2 },
  tick: { position: 'absolute', top: -6, right: -6, width: 17, height: 17, borderRadius: 9,
    backgroundColor: C.lime, borderWidth: 2, borderColor: C.ink,
    alignItems: 'center', justifyContent: 'center' },


  sheet: { paddingHorizontal: S.xl, paddingTop: 14, backgroundColor: 'rgba(6,18,13,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  sumRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 8 },
  sumRow2: { marginBottom: 14, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  prepayL: { fontFamily: DISP_MED, color: C.text, fontSize: 14 },
  prepayR: { fontFamily: DISP, color: C.lime, fontSize: 16, letterSpacing: -0.4,
    fontVariant: ['tabular-nums'] },
  sumL: { ...EYEBROW, color: C.dim, fontSize: 11, letterSpacing: 1, flexShrink: 1 },
  sumR: { color: C.text, fontFamily: DISP, fontSize: 15, letterSpacing: -0.3,
    fontVariant: ['tabular-nums'] },
  problem: { fontFamily: BODY, color: '#F0B6A8', fontSize: 13, lineHeight: 18, marginBottom: 10 },
  wa: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: '#25D366', minHeight: 52 },
  waT: { color: '#04240F', fontFamily: DISP, fontSize: 14, letterSpacing: 0.4,
    textTransform: 'uppercase' },
  cta: { backgroundColor: C.lime, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  ctaT: { color: C.onLime, fontFamily: DISP, fontSize: 14, letterSpacing: 0.6,
    textTransform: 'uppercase' },
  clear: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 14, marginTop: 2,
    minHeight: HIT, justifyContent: 'center' },
  clearT: { fontFamily: BODY, color: C.dim, fontSize: 13.5, textDecorationLine: 'underline' },

  peekBack: { flex: 1, backgroundColor: 'rgba(6,9,7,.88)',
    alignItems: 'center', justifyContent: 'center', padding: 22 },
  peek: { width: '100%', maxWidth: 420, overflow: 'hidden',
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  peekImg: { width: '100%', height: 230 },
  peekIn: { padding: 16 },
  peekN: { ...TITLE.card, color: C.text, textTransform: 'uppercase' },
  peekS: { fontFamily: BODY, color: C.lime, fontSize: 13, marginTop: 3 },
  peekNote: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 17, marginTop: 9 },
  peekRow: { flexDirection: 'row', gap: 9, marginTop: 14 },
  peekBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 },
  peekBtnAcc: { backgroundColor: C.lime, borderColor: C.lime },
  peekBtnT: { color: C.text, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.4,
    textTransform: 'uppercase' },
});
