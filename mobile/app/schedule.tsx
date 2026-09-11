// Запись на корт — по образцу, который выбрал заказчик.
//
// Порядок как у человека в голове: сначала «сколько играем», потом «когда».
// Время — плитками по каждому корту под заголовками-ценами; плитка сразу
// говорит, можно ли начать в этот час на выбранную длительность. Выбрал —
// снизу панель со сводкой и кнопкой «Забронировать в WhatsApp».
//
// Все детали записи общие с футбольным полем: src/components/booking.tsx.
//
// Шаг — один час: сервер и цены клуба почасовые. Получасовых слотов и
// брони на полтора часа, как в образце, нет — это решение клуба (Q58).
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, DISP, DISP_MED, BODY } from '../src/theme';
import { api, type ApiHour } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { IconChevron } from '../src/components/icons';
import { today } from '../src/dates';
import {
  BookingSheet, Card, DateStrip, Durations, GalleryModal, Slots, Step,
  canStart, useBooking, useCourtPhotos, usePillWidth, type Sel,
} from '../src/components/booking';

export default function Schedule() {
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState(1);
  const [sel, setSel] = useState<Sel>(null);
  const [gallery, setGallery] = useState<string | null>(null);
  const pillW = usePillWidth();
  const photosFor = useCourtPhotos();

  const q = useApi(() => api.grid(date), [date], `grid.${date}`);
  const grid = q.data;
  // Только падел-корты: поле бронируется на своём экране
  const shown = (grid?.courts ?? []).filter(c => !c.isFootball);
  const court = grid?.courts.find(c => c.courtId === sel?.courtId) ?? null;
  const booking = useBooking({ date, hours, sel, court,
    onTaken: () => { setSel(null); q.refresh() } });

  const pickDate = (d: string) => {
    Haptics.selectionAsync();
    setDate(d); setSel(null); booking.setProblem(null);
  };
  // Сменили длительность — выбранное время может перестать подходить
  const pickHours = (n: number) => {
    Haptics.selectionAsync();
    setHours(n); booking.setProblem(null);
    if (sel && court) {
      const h = court.hours.find(x => x.hour === sel.hour);
      if (!h || !canStart(h, n)) setSel(null);
    }
  };
  const pickSlot = (courtId: string, h: ApiHour) => {
    if (!canStart(h, hours)) return;
    Haptics.selectionAsync();
    booking.setProblem(null);
    // Нажатие по выбранной плитке снимает выбор
    if (sel && sel.courtId === courtId && sel.hour === h.hour) { setSel(null); return }
    setSel({ courtId, hour: h.hour });
  };

  if (q.loading) return (<><Stack.Screen options={{ title: 'Бронирование' }} /><Loading note="Смотрю, что свободно" /></>);
  if (q.error || !grid) return (<><Stack.Screen options={{ title: 'Бронирование' }} />
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);

  const nothingLeft = shown.every(c => c.hours.every(h => h.status === 'past'));
  const galleryCourt = grid.courts.find(c => c.courtId === gallery) ?? null;

  return (
    <View style={st.root}>
      <Stack.Screen options={{ title: 'Бронирование' }} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

        <DateStrip date={date} onPick={pickDate} />

        <Step n={1} title="Сколько играем" />
        <Card><Durations max={grid.maxHours} hours={hours} onPick={pickHours} /></Card>

        <Step n={2} title="Выбери время" note="нажми на свободный час" />

        {nothingLeft && (
          <Text style={st.allPassed}>
            На сегодня время закончилось. Выберите другой день выше.
          </Text>
        )}

        {/* Корты разделены чертой и воздухом, без цветных подложек и без
            цифр рядом с названием — «Корт 1» и так написано. */}
        {!nothingLeft && shown.map((c, i) => (
          <View key={c.courtId} style={[st.court, i > 0 && st.courtSep]}>
            <View style={st.courtHead}>
              <Text style={st.courtName}>{c.name}</Text>
              <Pressable onPress={() => { Haptics.selectionAsync(); setGallery(c.courtId) }}
                accessibilityRole="button" accessibilityLabel={`${c.name}: фотографии площадки`}
                hitSlop={8} style={({ pressed }) => [st.photoBtn, pressed && { opacity: 0.7 }]}>
                <Text style={st.photoT}>Фото</Text>
                <IconChevron size={13} color={C.text} />
              </Pressable>
            </View>
            <Slots court={c} hours={hours} sel={sel} pillW={pillW} onPick={pickSlot} />
          </View>
        ))}
      </ScrollView>

      {sel && court && (
        <BookingSheet court={court} date={date} sel={sel} hours={hours} booking={booking}
          onReset={() => { setSel(null); booking.setProblem(null) }} />
      )}

      <GalleryModal title={galleryCourt?.name ?? null}
        photos={gallery ? photosFor(gallery) : []} onClose={() => setGallery(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.ink },
  allPassed: { fontFamily: BODY, color: C.dim, fontSize: 14, lineHeight: 20,
    textAlign: 'center', paddingHorizontal: 30, paddingVertical: 24 },

  court: { marginHorizontal: S.xl, paddingTop: 18, paddingBottom: 20 },
  courtSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.lineStrong },
  courtHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  courtName: { flex: 1, color: C.text, fontFamily: DISP, fontSize: 24, letterSpacing: -0.8,
    textTransform: 'uppercase' },
  photoBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11,
    minHeight: 34, borderWidth: 1, borderColor: C.lineStrong },
  photoT: { color: C.text, fontFamily: DISP_MED, fontSize: 11, letterSpacing: 1.2,
    textTransform: 'uppercase' },
});
