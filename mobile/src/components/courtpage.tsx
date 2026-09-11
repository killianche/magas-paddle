// Страница одного корта: большая фотография, название, цвет и особенности,
// короткое описание — и сразу время именно этого корта.
//
// Заказчик: «нажимаю на корт — внутри показывается конкретно его время».
// Раньше запись шла через общую сетку всех кортов сразу. Она не удалена:
// экран app/schedule.tsx и метка git before-court-cards — на случай отката.
//
// Футбольное поле открывается этой же страницей: запись на него устроена так же.
import { useEffect, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, TITLE, BODY, sheet, useTheme } from '../theme';
import { api, type ApiHour } from '../api';
import { useApi } from '../useApi';
import { Loading, Failed } from './status';
import { NotFound } from './state';
import { Eyebrow } from './velocity';
import { Gallery } from './gallery';
import { Look } from './courtlook';
import { RentalsSection } from './extras';
import { addDays, today } from '../dates';
import {
  BookingSheet, Card, DateStrip, Durations, Slots, Step,
  canStart, photosOf, useBooking, usePillWidth, type Sel,
} from './booking';

/** courtId — какой корт; football — найти футбольное поле, какой бы у него ни был id. */
export function CourtPage({ courtId, football }: { courtId?: string; football?: boolean }) {
  useTheme();
  const { width } = useWindowDimensions();
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState(1);
  const [sel, setSel] = useState<Sel>(null);
  const pillW = usePillWidth();

  // Описание, цвет и фото меняются редко — отдельный запрос с общим кэшем
  const info = useApi(() => api.courts(), [], 'courts.photos');
  const q = useApi(() => api.grid(date), [date], `grid.${date}`);
  const grid = q.data;
  const row = grid?.courts.find(c => football ? c.isFootball : c.courtId === courtId) ?? null;
  const about = info.data?.find(c => c.id === row?.courtId);

  const booking = useBooking({ date, hours, sel, court: sel ? row : null,
    onTaken: () => { setSel(null); q.refresh() } });

  const title = row?.name ?? (football ? 'Мини-футбольное поле' : 'Корт');

  // Сегодня у корта всё прошло (поздний вечер) — сразу открываем завтра,
  // а не «время закончилось». Один раз: если человек сам вернётся на
  // сегодня, не перебрасываем его обратно.
  const advanced = useRef(false);
  useEffect(() => {
    if (advanced.current || !row || date !== today()) return;
    advanced.current = true;
    if (!row.closed && row.hours.length > 0 && row.hours.every(h => h.status === 'past')) {
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

        <Step n={2} title="Выбери время" note="нажми на свободный час" />
        <Card>
          <Slots court={row} hours={hours} sel={sel} pillW={pillW} onPick={pickSlot} />
        </Card>

        {/* Ракетки и мячи — в бронь не входят; свёрнуто, чтобы не отвлекать */}
        {!row.isFootball && <View style={{ marginTop: 18 }}><RentalsSection /></View>}
      </ScrollView>

      {sel && (
        <BookingSheet court={row} date={date} sel={sel} hours={hours} booking={booking}
          onReset={() => { setSel(null); booking.setProblem(null) }} />
      )}
    </View>
  );
}

const s = sheet(() => ({
  root: { flex: 1, backgroundColor: C.ink },
  head: { paddingHorizontal: S.xl, paddingTop: 16 },
  name: { ...TITLE.card, color: C.text, marginTop: 6 },
  about: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20, marginTop: 12 },
}));
