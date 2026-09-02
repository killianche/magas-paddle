import { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet, Modal, Image } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT } from '../src/theme';
import {
  fmt, hh, CLUB, slotWasTaken, alternativesAt, nextFitting,
  priceRange, courtById, type Court,
} from '../src/data';
import { Card, Row, Btn } from '../src/components/ui';
import { IMG } from '../src/images';
import { IconChevron } from '../src/components/icons';
import { addBooking } from '../src/store';

export default function Book() {
  const p = useLocalSearchParams<{ courtId: string; name: string; hour: string; hours: string; price: string }>();
  const courtId = String(p.courtId ?? 'c1');
  const hour = Number(p.hour ?? 19);
  const hours = Number(p.hours ?? 1);
  const total = Number(p.price ?? 4500);

  // Слот могли занять, пока человек заполнял заявку. Экран должен это пережить.
  const [taken, setTaken] = useState(false);

  const go = (cId: string, cName: string, h: number, sum: number) => {
    addBooking({ courtId: cId, courtName: cName, hour: h, hours, price: sum });
    router.replace({ pathname: '/sent', params: { name: cName, hour: String(h),
      hours: String(hours), price: String(sum) } });
  };

  const submit = () => {
    if (slotWasTaken(courtId, hour)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setTaken(true);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    go(courtId, String(p.name), hour, total);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 190 }}>
        <Card>
          <Row k="Площадка" v={String(p.name)} />
          <Row k="Дата" v="Вторник, 2 сентября" />
          <Row k="Время" v={`${hh(hour)} – ${hh(hour + hours)}`} mono />
          <Row k="Длительность" v={`${hours} ${hours === 1 ? 'час' : 'часа'}`} />
          <Row k="Тариф" v={hour >= 18 ? 'Вечерний, после 18:00' : 'Дневной'} />
          <Row k="К оплате на месте" v={fmt(total)} total />
        </Card>

        <Text style={s.label}>Ваше имя</Text>
        <View style={s.input}><Text style={s.inputT}>Ислам</Text>
          <Text style={s.saved}>сохранено</Text></View>

        <Text style={s.label}>Телефон</Text>
        <View style={s.input}><Text style={[s.inputT, { fontVariant: ['tabular-nums'] }]}>+7 928 ••• 12-34</Text>
          <Text style={s.saved}>сохранено</Text></View>

        <View style={s.note}>
          <Text style={s.noteT}>
            Если планы изменятся — отмените в приложении, слот освободится для других.
            Опоздание больше <Text style={{ fontWeight: '700' }}>{CLUB.lateMinutes} минут</Text> — корт может быть отдан.
          </Text>
        </View>
      </ScrollView>

      <View style={s.bar}>
        <Btn title="Отправить заявку" onPress={submit} />
        <Text style={s.barSub}>Заявка сохранится в приложении и откроется WhatsApp</Text>
      </View>

      <TakenSheet
        visible={taken}
        courtId={courtId}
        courtName={String(p.name)}
        hour={hour}
        hours={hours}
        onPick={go}
        onClose={() => { setTaken(false); router.back() }}
      />
    </View>
  );
}

/* Время увели, пока человек заполнял заявку.
   Правило: не оставлять его с одной кнопкой «ок», а сразу дать замену. */
function TakenSheet({ visible, courtId, courtName, hour, hours, onPick, onClose }: {
  visible: boolean; courtId: string; courtName: string; hour: number; hours: number;
  onPick: (cId: string, cName: string, h: number, sum: number) => void;
  onClose: () => void;
}) {
  const others: Court[] = alternativesAt(hour, hours, courtId).slice(0, 3);
  const later = nextFitting(courtId, hour, hours);
  const sameCourt = courtById(courtId);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim} />
      <View style={s.sheetWrap}>
        <View style={s.sheet}>
          <View style={s.grab} />

          <Text style={s.sheetT}>Это время только что заняли</Text>
          <Text style={s.sheetS}>
            Пока вы заполняли заявку, {courtName} на {hh(hour)} забронировал другой игрок.
            Деньги не списывались. Вот что свободно прямо сейчас.
          </Text>

          {others.length > 0 && (
            <>
              <Text style={s.group}>В то же время, {hh(hour)}</Text>
              {others.map(c => {
                const sum = priceRange(c, hour, hours);
                return (
                  <Pressable key={c.id}
                    onPress={() => { Haptics.selectionAsync(); onPick(c.id, c.name, hour, sum) }}
                    style={({ pressed }) => [s.alt, pressed && { opacity: 0.8 }]}>
                    <Image source={IMG[c.id]} style={s.altPh} resizeMode="cover" />
                    <View style={{ flex: 1 }}>
                      <Text style={s.altN}>{c.name}</Text>
                      <Text style={s.altS}>{hh(hour)} – {hh(hour + hours)} · {fmt(sum)}</Text>
                    </View>
                    <IconChevron size={16} color={C.dim2} />
                  </Pressable>
                );
              })}
            </>
          )}

          {later != null && sameCourt && (
            <>
              <Text style={s.group}>На той же площадке</Text>
              <Pressable
                onPress={() => { Haptics.selectionAsync();
                  onPick(courtId, courtName, later, priceRange(sameCourt, later, hours)) }}
                style={({ pressed }) => [s.alt, pressed && { opacity: 0.8 }]}>
                <Image source={IMG[courtId]} style={s.altPh} resizeMode="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={s.altN}>{courtName}</Text>
                  <Text style={s.altS}>
                    {hh(later)} – {hh(later + hours)} · {fmt(priceRange(sameCourt, later, hours))}
                  </Text>
                </View>
                <IconChevron size={16} color={C.dim2} />
              </Pressable>
            </>
          )}

          {others.length === 0 && later == null && (
            <View style={s.none}>
              <Text style={s.noneT}>
                На это время замены нет. Посмотрите расписание — на других днях места есть.
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

const s = StyleSheet.create({
  label: { color: C.dim, fontSize: 13.5, fontWeight: '600', paddingHorizontal: S.xl, marginBottom: 8, marginTop: 6 },
  input: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginHorizontal: S.xl, marginBottom: 8, backgroundColor: C.surface, borderWidth: 1,
    borderColor: C.lineStrong, borderRadius: R.md, paddingVertical: 13, paddingHorizontal: 14, minHeight: 50 },
  inputT: { color: C.text, fontSize: 15 },
  saved: { color: C.limeDim, fontSize: 10, fontWeight: '600', letterSpacing: 0.4 },
  note: { marginHorizontal: S.xl, marginTop: 8, padding: 12, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  noteT: { color: '#DFCCA8', fontSize: 12.5, lineHeight: 18 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: S.xl,
    paddingTop: 14, paddingBottom: 34, backgroundColor: C.ink, borderTopWidth: 1, borderTopColor: C.lineSoft },
  barSub: { color: C.dim2, fontSize: 11.5, textAlign: 'center', marginTop: 9 },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(4,7,5,.7)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.ink2, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderTopWidth: 1, borderColor: C.line, paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 30 },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: C.lineStrong,
    alignSelf: 'center', marginBottom: 16, opacity: 0.6 },
  sheetT: { color: C.text, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  sheetS: { color: C.dim, fontSize: 13.5, lineHeight: 20, marginTop: 7 },
  group: { color: C.dim2, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5,
    marginTop: 18, marginBottom: 8 },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 7,
    borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, minHeight: 62 },
  altPh: { width: 44, height: 44, borderRadius: 12 },
  altN: { color: C.text, fontSize: 15.5, fontWeight: '600' },
  altS: { color: C.dim2, fontSize: 12.5, marginTop: 2, fontVariant: ['tabular-nums'] },
  none: { marginTop: 16, padding: 13, borderRadius: R.md,
    backgroundColor: 'rgba(240,169,59,.08)', borderWidth: 1, borderColor: 'rgba(240,169,59,.26)' },
  noneT: { color: '#DFCCA8', fontSize: 13, lineHeight: 19 },
  ghost: { marginTop: 14, paddingVertical: 15, borderRadius: R.lg, alignItems: 'center',
    borderWidth: 1, borderColor: C.lineStrong, minHeight: HIT },
  ghostT: { color: C.text, fontSize: 15, fontWeight: '600' },
});
