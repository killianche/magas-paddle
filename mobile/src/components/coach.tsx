// Общее для тренировок: лицо тренера, строка групповой тренировки
// и выбор тренера при записи на корт.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, EYEBROW, BODY, sheet } from '../theme';
import { api, mediaUrl, rub, type ApiFreeCoach, type ApiTournament } from '../api';
import { IconChevron, IconCheck } from './icons';
import { hh, dayMonth, dateOfIso, hourOfIso, plural, weekdayShort } from '../dates';

export function CoachFace({ c, size = 56 }: { c: { name: string; photoUrl: string | null; color?: string | null }; size?: number }) {
  return c.photoUrl
    ? <Image source={{ uri: mediaUrl(c.photoUrl) }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.color || C.surface3,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: DISP, color: '#fff', fontSize: size * 0.38 }}>{c.name.trim().slice(0, 1).toUpperCase()}</Text>
      </View>;
}

export function ClassRow({ t }: { t: ApiTournament }) {
  const left = Math.max(0, t.seats - t.taken);
  const d = dateOfIso(t.startsAt);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`Групповая тренировка ${t.name}`}
      onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/tournament', params: { id: String(t.id), kind: 'class' } }) }}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
      <View style={s.date}>
        <Text style={s.dateW}>{weekdayShort(d)}</Text>
        <Text style={s.dateD}>{dayMonth(d).split(' ')[0]}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.name}>{t.name}</Text>
        <Text style={s.meta}>{hh(hourOfIso(t.startsAt))} · {t.coach?.name ?? 'тренер'}{t.level ? ` · ${t.level}` : ''}</Text>
        <Text style={[s.meta, { color: t.entry?.status === 'confirmed' ? C.limeDim : left ? C.dim : C.amber }]}>
          {t.entry?.status === 'confirmed' ? 'Вы записаны' : t.entry?.status === 'pending' ? 'Заявка ждёт подтверждения'
            : `${rub(t.fee)} · ${left ? `осталось ${left} ${plural(left, 'место', 'места', 'мест')}` : 'мест нет'}`}
        </Text>
      </View>
      <IconChevron size={16} color={C.dim2} />
    </Pressable>
  );
}

const s = sheet(() => ({
  sec: { ...EYEBROW, color: C.dim2, marginHorizontal: S.xl, marginTop: 22, marginBottom: 8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, marginHorizontal: S.xl, marginBottom: 10,
    padding: 14, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  name: { fontFamily: DISP_MED, color: C.text, fontSize: 16 },
  meta: { fontFamily: BODY, color: C.dim, fontSize: 13, marginTop: 3 },
  bio: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, lineHeight: 17, marginTop: 5 },
  date: { width: 52, height: 56, borderRadius: R.md, backgroundColor: C.surface2, alignItems: 'center', justifyContent: 'center' },
  dateW: { fontFamily: BODY, color: C.dim, fontSize: 11 },
  dateD: { fontFamily: DISP, color: C.text, fontSize: 20 },
}));


/** Галочка «играть с тренером» и выбор свободного тренера.
 *
 *  Человек уже выбрал корт, день и время — показываем только тех, кто в эти
 *  часы работает и свободен. Выбранный тренер идёт в заявку; окончательно
 *  подтверждает менеджер и, если тренер не сможет, предложит другого. */
export function CoachPick({ date, hour, hours, courtId, coach, onPick }: {
  date: string; hour: number; hours: number; courtId: string;
  coach: ApiFreeCoach | null;
  onPick: (c: ApiFreeCoach | null) => void;
}) {
  const [on, setOn] = useState(false);
  const [list, setList] = useState<ApiFreeCoach[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!on) return;
    let alive = true;
    setFailed(false);
    api.freeCoaches(date, hour, hours, courtId)
      .then(r => { if (alive) setList(r.coaches) })
      .catch(() => { if (alive) { setList([]); setFailed(true) } });
    return () => { alive = false };
  }, [on, date, hour, hours, courtId]);

  const toggle = () => {
    Haptics.selectionAsync();
    const next = !on;
    setOn(next);
    if (!next) onPick(null);
  };

  return (
    <View style={p.wrap}>
      <Pressable onPress={toggle} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
        style={({ pressed }) => [p.head, pressed && { opacity: 0.85 }]}>
        <View style={[p.box, on && p.boxOn]}>{on && <IconCheck size={13} color={C.onLime} />}</View>
        <View style={{ flex: 1 }}>
          <Text style={p.headT}>Играть с тренером</Text>
          <Text style={p.headS}>Покажем тех, кто свободен в это время</Text>
        </View>
      </Pressable>

      {on && (
        <View style={p.body}>
          {list == null && <ActivityIndicator color={C.dim} style={{ marginVertical: 14 }} />}

          {!!list && list.length === 0 && (
            <Text style={p.empty}>
              {failed
                ? 'Не получилось загрузить тренеров. Отправьте заявку — менеджер подберёт тренера.'
                : 'В это время свободных тренеров нет. Отправьте заявку без тренера — менеджер предложит вариант.'}
            </Text>
          )}

          {list?.map(c => {
            const picked = coach?.id === c.id;
            return (
              <Pressable key={c.id} accessibilityRole="button"
                accessibilityState={{ selected: picked }}
                onPress={() => { Haptics.selectionAsync(); onPick(picked ? null : c) }}
                style={({ pressed }) => [p.item, picked && p.itemOn, pressed && { opacity: 0.85 }]}>
                <CoachFace c={c} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={p.name}>{[c.name, c.surname].filter(Boolean).join(' ')}</Text>
                  {!!c.experience && <Text style={p.meta}>{c.experience}</Text>}
                  <Text style={[p.meta, picked && { color: C.accent }]}>
                    {rub(c.price)} за час{c.courtExtra ? '' : ' · корт включён'}
                  </Text>
                </View>
                <View style={[p.mark, picked && p.markOn]}>{picked && <IconCheck size={12} color={C.onLime} />}</View>
              </Pressable>
            );
          })}

          {!!coach && (
            <Text style={p.note}>
              Менеджер подтвердит тренера. Если {coach.name} не сможет — предложит другого.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const p = sheet(() => ({
  wrap: { marginHorizontal: S.xl, marginTop: 6, marginBottom: 4, borderRadius: R.xl,
    borderWidth: 1, borderColor: C.line, backgroundColor: C.surface, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: HIT + 6 },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: C.lineStrong,
    alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: C.lime, borderColor: C.lime },
  headT: { fontFamily: DISP_MED, color: C.text, fontSize: 15.5 },
  headS: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, marginTop: 2 },

  body: { paddingHorizontal: 10, paddingBottom: 12, borderTopWidth: 1, borderTopColor: C.lineSoft },
  empty: { fontFamily: BODY, color: C.dim, fontSize: 13, lineHeight: 19, padding: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginTop: 8,
    borderRadius: R.lg, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface2 },
  itemOn: { borderColor: C.accentBorder, backgroundColor: C.accentSoft },
  name: { fontFamily: DISP_MED, color: C.text, fontSize: 15 },
  meta: { fontFamily: BODY, color: C.dim2, fontSize: 12.5, marginTop: 2 },
  mark: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.lineStrong,
    alignItems: 'center', justifyContent: 'center' },
  markOn: { backgroundColor: C.lime, borderColor: C.lime },
  note: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 17, paddingHorizontal: 12, paddingTop: 10 },
}));
