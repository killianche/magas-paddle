// Запись на футбольное поле — так же, как на корт.
//
// Сверху фотографии поля, они листаются; под ними заголовок. Дальше те же
// шаги, что у кортов: длительность, время плитками под заголовком-ценой,
// нижняя панель со сводкой, предоплатой и кнопкой «Забронировать в WhatsApp».
// Детали общие с кортами — src/components/booking.tsx, поэтому любая правка
// записи кортов сразу доходит и сюда.
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, TITLE } from '../src/theme';
import { api, type ApiHour } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { Eyebrow } from '../src/components/velocity';
import { Gallery } from '../src/components/gallery';
import { today } from '../src/dates';
import {
  BookingSheet, Card, DateStrip, Durations, Slots, Step,
  canStart, useBooking, useCourtPhotos, usePillWidth, type Sel,
} from '../src/components/booking';

export default function Football() {
  const { width } = useWindowDimensions();
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState(1);
  const [sel, setSel] = useState<Sel>(null);
  const pillW = usePillWidth();
  const photosFor = useCourtPhotos();

  const q = useApi(() => api.grid(date), [date], `grid.${date}`);
  const grid = q.data;
  const pitch = grid?.courts.find(c => c.isFootball) ?? null;
  const booking = useBooking({ date, hours, sel, court: sel ? pitch : null,
    onTaken: () => { setSel(null); q.refresh() } });

  const pickDate = (d: string) => {
    Haptics.selectionAsync();
    setDate(d); setSel(null); booking.setProblem(null);
  };
  const pickHours = (n: number) => {
    Haptics.selectionAsync();
    setHours(n); booking.setProblem(null);
    if (sel && pitch) {
      const h = pitch.hours.find(x => x.hour === sel.hour);
      if (!h || !canStart(h, n)) setSel(null);
    }
  };
  const pickSlot = (courtId: string, h: ApiHour) => {
    if (!canStart(h, hours)) return;
    Haptics.selectionAsync();
    booking.setProblem(null);
    if (sel && sel.hour === h.hour) { setSel(null); return }
    setSel({ courtId, hour: h.hour });
  };

  if (q.loading) return (<><Stack.Screen options={{ title: 'Футбольное поле' }} /><Loading note="Смотрю, что свободно" /></>);
  if (q.error || !grid) return (<><Stack.Screen options={{ title: 'Футбольное поле' }} />
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);
  if (!pitch) return (
    <NotFound title="Поля нет в расписании"
      note="Возможно, клуб убрал его. Падел-корты — на главной." />
  );

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: 'Футбольное поле' }} />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

        {/* Фото поля — листаются; снимки загружает клуб в админке */}
        <Gallery photos={photosFor(pitch.courtId)} height={Math.round(Math.min(width, 520) * 0.62)} />

        <View style={s.head}>
          <Eyebrow>Поле целиком</Eyebrow>
          <Text style={s.name} allowFontScaling={false}>ФУТБОЛЬНОЕ ПОЛЕ</Text>
        </View>

        <DateStrip date={date} onPick={pickDate} />

        <Step n={1} title="Сколько играем" />
        <Card><Durations max={grid.maxHours} hours={hours} onPick={pickHours} /></Card>

        <Step n={2} title="Выбери время" note="нажми на свободный час" />
        <Card>
          <Slots court={pitch} hours={hours} sel={sel} pillW={pillW} onPick={pickSlot} />
        </Card>
      </ScrollView>

      {sel && (
        <BookingSheet court={pitch} date={date} sel={sel} hours={hours} booking={booking}
          onReset={() => { setSel(null); booking.setProblem(null) }} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  head: { paddingHorizontal: S.xl, paddingTop: 16 },
  name: { ...TITLE.card, color: C.text, marginTop: 6 },
});
