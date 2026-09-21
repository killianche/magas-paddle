// Тренеры клуба: кто тренирует, с каким опытом, почём и когда работает.
// Отсюда человек выбирает тренера и попадает в его расписание.
import { useCallback } from 'react';
import { ScrollView, Text, View, Pressable, RefreshControl } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, type ApiCoach } from '../src/api';
import { useApi } from '../src/useApi';
import { useClub } from '../src/club';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { CoachFace, weekText } from '../src/components/coach';
import { IconChevron } from '../src/components/icons';

export default function Coaches() {
  useTheme();
  const club = useClub();
  const q = useApi(() => api.coaches(), [], 'coaches');
  useFocusEffect(useCallback(() => { q.refresh() }, []));

  const screen = <Stack.Screen options={{ title: 'Тренеры' }} />;
  if (q.loading) return <>{screen}<Loading note="Загружаю тренеров" /></>;
  if (q.error) return <>{screen}<Failed message={q.error} onRetry={q.reload} /></>;

  const list = q.data ?? [];
  if (!club.coachesOn || !list.length) return (<>{screen}
    <NotFound title="Тренеров пока нет"
      note="Клуб ещё не добавил тренеров. Забронируйте корт — играть можно и без тренировки." />
  </>);

  return (
    <>
      {screen}
      <ScrollView style={{ flex: 1, backgroundColor: C.ink }}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>
        <Text style={s.lead}>
          Выберите тренера — покажем, когда он свободен, и запишем вас вместе с кортом.
        </Text>
        {list.map(c => <CoachCard key={c.id} c={c} />)}
      </ScrollView>
    </>
  );
}

function CoachCard({ c }: { c: ApiCoach }) {
  const open = () => {
    Haptics.selectionAsync();
    router.push({ pathname: '/coach', params: { id: String(c.id) } });
  };
  return (
    <Pressable onPress={open} accessibilityRole="button"
      accessibilityLabel={`Тренер ${[c.name, c.surname].filter(Boolean).join(' ')}`}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.88 }]}>
      <CoachFace c={c} size={62} />
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={s.name} numberOfLines={1}>{[c.name, c.surname].filter(Boolean).join(' ')}</Text>
        {!!c.experience && <Text style={s.exp} numberOfLines={1}>{c.experience}</Text>}
        <Text style={s.price}>
          {rub(c.price)} за час{c.courtExtra ? ' + корт' : ' · корт включён'}
        </Text>
        <Text style={s.week} numberOfLines={1}>{weekText(c.week)}</Text>
      </View>
      <IconChevron size={16} color={C.dim2} />
    </Pressable>
  );
}

const s = sheet(() => ({
  lead: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 20,
    marginHorizontal: S.xl, marginBottom: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14,
    marginHorizontal: S.xl, marginBottom: 10, padding: 14,
    borderRadius: R.xl, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  name: { fontFamily: DISP_MED, color: C.text, fontSize: 16.5 },
  exp: { fontFamily: BODY, color: C.dim, fontSize: 13 },
  price: { fontFamily: BODY, color: C.accent, fontSize: 13.5 },
  week: { fontFamily: BODY, color: C.dim2, fontSize: 12.5 },
}));
