// Тренеры клуба: кто тренирует, с каким опытом, почём и когда работает.
// Отсюда человек выбирает тренера и попадает в его расписание.
import { useCallback } from 'react';
import { ScrollView, Text, View, Pressable, Image, RefreshControl } from 'react-native';
import { Stack, router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, R, S, HIT, DISP, DISP_MED, TITLE, EYEBROW, BODY, sheet, useTheme } from '../src/theme';
import { api, rub, mediaUrl, type ApiCoach } from '../src/api';
import { useApi } from '../src/useApi';
import { useClub } from '../src/club';
import { Loading, Failed } from '../src/components/status';
import { NotFound } from '../src/components/state';
import { CoachFace, weekText } from '../src/components/coach';
import { IconArrowRight } from '../src/components/icons';

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

/** Карточка тренера: крупный снимок слева, дальше — только то, по чему
 *  человек и выбирает: имя, опыт, цена и когда работает. */
function CoachCard({ c }: { c: ApiCoach }) {
  const open = () => {
    Haptics.selectionAsync();
    router.push({ pathname: '/coach', params: { id: String(c.id) } });
  };
  const full = [c.name, c.surname].filter(Boolean).join(' ');
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`Тренер ${full}`}
      style={({ pressed }) => [s.card, pressed && { transform: [{ scale: 0.99 }], opacity: 0.92 }]}>
      <View style={s.photoWrap}>
        {c.photoUrl
          ? <Image source={{ uri: mediaUrl(c.photoUrl) }} style={s.photo} resizeMode="cover" />
          : <View style={[s.photo, s.photoNo]}><CoachFace c={c} size={72} /></View>}
        {!c.courtExtra && (
          <View style={s.flag}><Text style={s.flagT}>корт включён</Text></View>
        )}
      </View>

      <View style={s.body}>
        <Text style={s.name} numberOfLines={1}>{full}</Text>
        {!!c.experience && <Text style={s.exp} numberOfLines={2}>{c.experience}</Text>}

        <View style={s.priceRow}>
          <Text style={s.price}>{rub(c.price)}</Text>
          <Text style={s.priceSub}>за час{c.courtExtra ? ' + корт' : ''}</Text>
        </View>

        <View style={s.weekRow}>
          <Text style={s.week} numberOfLines={2}>{weekText(c.week)}</Text>
        </View>

        <View style={s.cta}>
          <Text style={s.ctaT}>Свободное время</Text>
          <IconArrowRight size={15} color={C.accent} />
        </View>
      </View>
    </Pressable>
  );
}

const s = sheet(() => ({
  lead: { fontFamily: BODY, color: C.dim, fontSize: 13.5, lineHeight: 20,
    marginHorizontal: S.xl, marginBottom: 14 },

  card: { flexDirection: 'row', gap: 14, marginHorizontal: S.xl, marginBottom: 12, padding: 12,
    borderRadius: R.xl, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },

  photoWrap: { width: 108 },
  photo: { width: 108, height: 132, borderRadius: R.lg, backgroundColor: C.surface2 },
  photoNo: { alignItems: 'center', justifyContent: 'center' },
  flag: { position: 'absolute', left: 6, bottom: 6, right: 6, paddingVertical: 4,
    borderRadius: 999, backgroundColor: C.accent, alignItems: 'center' },
  flagT: { fontFamily: DISP_MED, color: C.onLime, fontSize: 9.5, letterSpacing: 0.3,
    textTransform: 'uppercase' },

  body: { flex: 1, paddingVertical: 2, gap: 4 },
  name: { fontFamily: DISP, color: C.text, fontSize: 19, letterSpacing: -0.5 },
  exp: { fontFamily: BODY, color: C.dim, fontSize: 12.5, lineHeight: 17 },

  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  price: { fontFamily: DISP, color: C.accent, fontSize: 19, letterSpacing: -0.5 },
  priceSub: { fontFamily: BODY, color: C.dim2, fontSize: 12 },

  weekRow: { borderTopWidth: 1, borderTopColor: C.lineSoft, paddingTop: 7, marginTop: 2 },
  week: { fontFamily: BODY, color: C.dim2, fontSize: 12, lineHeight: 16 },

  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 'auto', paddingTop: 6 },
  ctaT: { fontFamily: DISP_MED, color: C.accent, fontSize: 11.5, letterSpacing: 0.8,
    textTransform: 'uppercase' },
}));
