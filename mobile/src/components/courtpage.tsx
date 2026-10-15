// Страница одного корта: большая фотография, название, цвет и особенности,
// короткое описание — и сразу время именно этого корта.
//
// Заказчик: «нажимаю на корт — внутри показывается конкретно его время».
// Раньше запись шла через общую сетку всех кортов сразу. Она не удалена:
// экран app/schedule.tsx и метка git before-court-cards — на случай отката.
//
// Футбольное поле открывается этой же страницей: запись на него устроена так же.
import { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, TITLE, BODY, sheet, useTheme } from '../theme';
import { api, type ApiHour } from '../api';
import { useApi } from '../useApi';
import { Loading, Failed } from './status';
import { NotFound } from './state';
import { Eyebrow } from './velocity';
import { Gallery } from './gallery';
import { Look } from './courtlook';
import { CoachPick } from './coach';
import { useClub } from '../club';
import { GoodsPick, RentalsSection } from './extras';
import { addDays, today } from '../dates';
import {
  BookingSheet, Card, DateStrip, Durations, FamilyPick, Slots, Step,
  canStart, photosOf, useBooking, usePillWidth, type Sel,
} from './booking';

/** courtId — какой корт; football — найти футбольное поле, какой бы у него ни был id. */
export function CourtPage({ courtId, football }: { courtId?: string; football?: boolean }) {
  useTheme();
  const club = useClub();
  const { width } = useWindowDimensions();
  // Что человек выбрал до ухода на вход: экран возвращает его обратно
  // с тем же днём, часом, длительностью и корзиной — иначе после регистрации
  // всё приходилось выбирать заново
  const back = useLocalSearchParams<{ d?: string; h?: string; hrs?: string; it?: string }>();
  const [date, setDate] = useState(() => (back.d && /^\d{4}-\d{2}-\d{2}$/.test(String(back.d))
    ? String(back.d) : today()));
  const [hours, setHours] = useState(() => {
    const n = Number(back.hrs);
    return Number.isFinite(n) && n >= 1 && n <= 6 ? n : 1;
  });
  const [sel, setSel] = useState<Sel>(() => {
    const h = Number(back.h);
    return courtId && Number.isFinite(h) ? { courtId, hour: h } : null;
  });
  const picked0 = useMemo(() => {
    const m = new Map<number, number>();
    for (const part of String(back.it ?? '').split(',')) {
      const [id, n] = part.split(':').map(Number);
      if (Number.isFinite(id) && Number.isFinite(n) && n > 0) m.set(id, n);
    }
    return m;
  }, [back.it]);
  const pillW = usePillWidth();

  // Описание, цвет и фото меняются редко — отдельный запрос с общим кэшем
  const info = useApi(() => api.courts(), [], 'courts.photos');
  // Тот же запрос, что внутри GoodsPick: общий кэш, второй раз не ходит
  const hasGoods = ((useApi(() => api.goods(), [], 'goods').data) ?? []).length > 0;
  const q = useApi(() => api.grid(date), [date], `grid.${date}`);
  const grid = q.data;
  const row = grid?.courts.find(c => football ? c.isFootball : c.courtId === courtId) ?? null;
  const about = info.data?.find(c => c.id === row?.courtId);

  const booking = useBooking({ date, hours, sel, court: sel ? row : null,
    onTaken: () => { setSel(null); q.refresh() }, picked0 });

  const title = row?.name ?? (football ? 'Мини-футбольное поле' : 'Корт');

  // Сняли выбор часа или сменили день — тренер снимается вместе с ним.
  // Иначе галочка «Играть с тренером» сбрасывалась, а тренер оставался
  // в панели и в сумме и уходил в заявку (аудит 15.10.2026)
  useEffect(() => { if (!sel) booking.setCoach(null) }, [sel]);

  // У футбольного поля id заранее неизвестен — выбранный до входа час
  // возвращаем, когда сетка приехала и поле нашлось
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !football || !row || sel) return;
    restored.current = true;
    const h = Number(back.h);
    if (back.h != null && Number.isFinite(h)) setSel({ courtId: row.courtId, hour: h });
  }, [row]);

  // Сегодня у корта всё прошло (поздний вечер) — сразу открываем завтра,
  // а не «время закончилось». Один раз: если человек сам вернётся на
  // сегодня, не перебрасываем его обратно.
  const advanced = useRef(false);
  useEffect(() => {
    if (advanced.current || !row || date !== today()) return;
    advanced.current = true;
    // …или клуб сегодня не работает по расписанию
    if (grid?.dayOff || (!row.closed && row.hours.length > 0 && row.hours.every(h => h.status === 'past'))) {
      setDate(addDays(today(), 1));
    }
  }, [row, date]);

  const pickDate = (d: string) => {
    Haptics.selectionAsync();
    setDate(d); setSel(null); booking.setProblem(null);
  };
  // Сменили длительность — выбранное время может перестать подходить
  const pickHours = (n: number) => {
    Haptics.selectionAsync();
    setHours(n); booking.setProblem(null);
    if (sel && row) {
      const h = row.hours.find(x => x.hour === sel.hour);
      if (!h || !canStart(h, n)) setSel(null);
    }
  };
  const pickSlot = (id: string, h: ApiHour) => {
    if (!canStart(h, hours)) return;
    Haptics.selectionAsync();
    booking.setProblem(null);
    // Нажатие по выбранной плитке снимает выбор
    if (sel && sel.hour === h.hour) { setSel(null); return }
    setSel({ courtId: id, hour: h.hour });
  };

  if (q.loading) return (<><Stack.Screen options={{ title }} /><Loading note="Смотрю, что свободно" /></>);
  if (q.error || !grid) return (<><Stack.Screen options={{ title }} />
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);
  if (!row) return (<><Stack.Screen options={{ title }} />
    <NotFound title={football ? 'Поля нет в расписании' : 'Корт не найден'}
      note="Возможно, клуб убрал его из расписания. Остальные корты — на главной." /></>);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title }} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

        {/* Большая фотография — корты выбирают глазами. Листается пальцем. */}
        <Gallery photos={photosOf(about, row.courtId)}
          height={Math.round(Math.min(width, 520) * 0.72)} />

        <View style={s.head}>
          <Eyebrow>{row.isFootball ? 'Поле целиком' : 'Падел-корт'}</Eyebrow>
          <Text style={s.name} allowFontScaling={false}>{row.name.toUpperCase()}</Text>
          {(about?.color || !!about?.tags?.length) && (
            <View style={{ marginTop: 12 }}><Look color={about?.color} tags={about?.tags} /></View>
          )}
          {!!about?.description && <Text style={s.about}>{about.description}</Text>}
        </View>

        <DateStrip date={date} onPick={pickDate} />

        <Step n={1} title="Сколько играем" />
        <Card><Durations max={grid.maxHours} hours={hours} onPick={pickHours} /></Card>

        <Step n={2} title="Выберите время" />
        {/* «Время заняли» — здесь, а не в нижней панели: панель в этот
            момент закрывается вместе со снятым выбором, и сообщение
            пропадало, не показавшись (аудит 15.10.2026) */}
        {!sel && !!booking.problem && <Text style={s.problem}>{booking.problem}</Text>}
        <Card>
          <Slots court={row} hours={hours} sel={sel} pillW={pillW} onPick={pickSlot}
            dayOff={grid.dayOff} />
        </Card>

        {/* Тренер — сразу под выбранным временем: решение о тренере человек
            принимает здесь же, а не в нижней панели (заказчик, 04.10.2026) */}
        {sel && club.coachesOn && !row.isFootball && (
          <View style={{ marginTop: 10 }}>
            <CoachPick date={date} hour={sel.hour} hours={hours} courtId={sel.courtId}
              coach={booking.coach} onPick={booking.setCoach} compact />
          </View>
        )}

        {sel && club.familyOn && !!row.isFamily && (
          <View style={{ marginTop: 10 }}>
            <FamilyPick on={booking.family} onToggle={booking.setFamily} />
          </View>
        )}

        {/* Прокат и мячи. Если клуб ведёт каталог — показываем настоящие
            позиции с кнопкой «Добавить», и прайс-лист из настроек тогда не
            нужен: два блока про ракетки подряд только путали. Каталога нет —
            остаётся прежний прайс-лист. */}
        {!row.isFootball && (
          <View style={{ marginTop: hasGoods ? 10 : 18 }}>
            {hasGoods
              ? <GoodsPick picked={booking.picked}
                  onChange={m => booking.setPicked(m)} />
              : <RentalsSection />}
          </View>
        )}
      </ScrollView>

      {sel && (
        <BookingSheet court={row} date={date} sel={sel} hours={hours} booking={booking} />
      )}
    </View>
  );
}

const s = sheet(() => ({
  root: { flex: 1, backgroundColor: C.ink },
  problem: { fontFamily: BODY, color: C.dangerText, fontSize: 13.5, lineHeight: 19,
    marginBottom: 10, paddingHorizontal: 2 },
  head: { paddingHorizontal: S.xl, paddingTop: 16 },
  name: { ...TITLE.card, color: C.text, marginTop: 6 },
  about: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 12 },
}));
