// Общее для экранов тренировок: лицо тренера, строка групповой тренировки.
import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, DISP, DISP_MED, EYEBROW, BODY, sheet } from '../theme';
import { mediaUrl, rub, type ApiCoach, type ApiTournament } from '../api';
import { IconChevron } from './icons';
import { hh, dayMonth, dateOfIso, hourOfIso, plural, weekdayShort } from '../dates';

export function CoachFace({ c, size = 56 }: { c: { name: string; photoUrl: string | null; color?: string | null }; size?: number }) {
  return c.photoUrl
    ? <Image source={{ uri: mediaUrl(c.photoUrl) }} style={{ width: size, height: size, borderRadius: size / 2 }} />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.color || C.surface3,
        alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: DISP, color: '#fff', fontSize: size * 0.38 }}>{c.name.trim().slice(0, 1).toUpperCase()}</Text>
      </View>;
}

export const coachPriceText = (c: ApiCoach) => `${rub(c.price)} за час${c.courtExtra ? ' + корт' : ', корт включён'}`;

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
