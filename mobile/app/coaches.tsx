// Тренировки: тренеры клуба и групповые тренировки.
//
// Как в приложениях клубов с академией (Playtomic и подобных): человек
// выбирает тренера и записывается на индивидуальную тренировку или идёт
// в группу. Цены и расписание тренеров задаёт клуб в админке.
import { useCallback } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api } from '../src/api';
import { CoachFace, coachPriceText, ClassRow } from '../src/components/coach';
import { useApi } from '../src/useApi';
import { useProfile } from '../src/profile';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { IconChevron } from '../src/components/icons';

export default function Coaches() {
  useTheme();
  const { profile } = useProfile();
  const phone = profile?.phone;
  const q = useApi(async () => {
    const [coaches, classes] = await Promise.all([api.coaches(), api.tournaments(phone, 'class')]);
    const now = Date.now();
    return { coaches, classes: classes.filter(t => new Date(t.startsAt).getTime() > now) };
  }, [phone], `coaches.${phone ?? 'гость'}`);
  useFocusEffect(useCallback(() => { q.refresh() }, [phone]));

  const screen = <Stack.Screen options={{ title: 'Тренировки' }} />;
  if (q.loading) return (<>{screen}<Loading /></>);
  if (q.error) return (<>{screen}<Failed message={q.error} onRetry={q.reload} /></>);
  const { coaches, classes } = q.data!;
  if (!coaches.length && !classes.length) return (<>{screen}
    <NotFound title="Тренировок пока нет" note="Клуб скоро добавит тренеров." /></>);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: C.ink }} contentContainerStyle={{ paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>
      {screen}
      {coaches.length > 0 && <Text style={s.sec}>Тренеры</Text>}
      {coaches.map(c => (
        <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={`Тренер ${c.name}`}
          onPress={() => { Haptics.selectionAsync(); router.push({ pathname: '/coach', params: { id: String(c.id) } }) }}
          style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}>
          <CoachFace c={c} />
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{c.name}</Text>
            <Text style={s.meta}>{coachPriceText(c)}</Text>
            {!!c.bio && <Text style={s.bio} numberOfLines={2}>{c.bio}</Text>}
          </View>
          <IconChevron size={16} color={C.dim2} />
        </Pressable>
      ))}

      {classes.length > 0 && <Text style={s.sec}>Групповые тренировки</Text>}
      {classes.map(t => <ClassRow key={t.id} t={t} />)}
    </ScrollView>
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
