// «Выбери корт» — сюда ведёт «Забронировать падел-корт» на главной.
//
// Заказчик хотел, чтобы сразу было видно, какой корт какой: синий или
// зелёный, одиночный, ультраширокий. Поэтому у каждого корта план сверху
// в цвете покрытия: одиночный нарисован узким, ультраширокий — широким.
// Все шесть помещаются сеткой в два столбца. Мелкого текста нет — заказчик
// попросил убрать подсказки, отбор по цвету и «свободно с …»: кортов всего
// шесть. Фотографии и расписание — на странице корта.
import { useCallback } from 'react';
import {
  Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, DISP, DISP_MED, TITLE, BODY, MEDIUM, sheet, useTheme, R } from '../src/theme';
import { api, rub } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { Eyebrow } from '../src/components/velocity';
import { CourtPlan, isSingle, isWide } from '../src/components/courtlook';
import { today } from '../src/dates';
import { upcomingGrid } from '../src/upcoming';

const GAP = 10;

export default function Courts() {
  useTheme();
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 520) - S.xl * 2;
  const tileW = Math.floor((inner - GAP) / 2);
  const narrow = width < 360;

  const q = useApi(async () => {
    const [courts, next] = await Promise.all([api.courts(), upcomingGrid()]);
    return { courts, grid: next.grid };
  }, [], `courts.list.${today()}`);
  useFocusEffect(useCallback(() => { q.refresh() }, []));

  const screen = <Stack.Screen options={{ title: 'Бронирование' }} />;
  if (q.loading && !q.data) return (<>{screen}<Loading note="Смотрю корты" /></>);
  if (!q.data) return (<>{screen}
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);

  const { courts, grid } = q.data;
  const padel = courts.filter(c => !c.isFootball);

  return (
    <View style={s.root}>
      {screen}
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

        <View style={s.head}>
          <Eyebrow>Падел-корты</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>ВЫБЕРИ КОРТ</Text>
        </View>

        <View style={s.grid}>
          {padel.map(c => {
            const row = grid.courts.find(r => r.courtId === c.id);
            const live = (row?.hours ?? []).filter(h => h.status !== 'past');
            // «от» — самая низкая цена из оставшихся часов
            const prices = live.map(h => h.price).filter(p => p > 0);
            const from = prices.length ? Math.min(...prices) : Math.min(c.priceMorning, c.priceStandard);
            const closed = !!row?.closed;
            const tags = c.tags ?? [];

            return (
              <Pressable key={c.id}
                onPress={() => { Haptics.selectionAsync();
                  router.push({ pathname: '/court', params: { id: c.id } }) }}
                accessibilityRole="button"
                accessibilityLabel={[c.name, c.color?.name, ...tags,
                  closed ? (c.closedReason || 'Закрыт') : `от ${rub(from)} за час`].filter(Boolean).join('. ')}
                style={({ pressed }) => [s.tile, { width: tileW },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>

                <View style={s.plan}>
                  <CourtPlan width={tileW - 2} color={c.color}
                    single={isSingle(tags)} wide={isWide(tags)} dim={closed} />
                </View>

                <View style={s.body}>
                  <Text style={[s.name, narrow && { fontSize: 14 }]} numberOfLines={1}>{c.name}</Text>

                  <View style={s.look}>
                    {c.color && (
                      <View style={s.lookItem}>
                        <View style={[s.sw, { backgroundColor: c.color.hex }]} />
                        <Text style={s.lookT}>{c.color.name}</Text>
                      </View>
                    )}
                    {tags.map(t => (
                      <View key={t} style={s.tag}>
                        <Text style={[s.tagT, narrow && { fontSize: 9 }]} numberOfLines={1}>{t}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Низ прижат вниз: соседние плитки в ряду одной высоты */}
                  <View style={{ flex: 1, minHeight: 8 }} />
                  {closed
                    ? <Text style={s.closed} numberOfLines={1}>{c.closedReason || 'Закрыт'}</Text>
                    : <Text style={s.price}>от {rub(from)}</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const s = sheet(() => ({
  root: { flex: 1, backgroundColor: C.ink },
  head: { paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 16 },
  h1: { ...TITLE.page, color: C.text, marginTop: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: S.xl },
  tile: { borderWidth: 1, borderColor: C.line, backgroundColor: C.surface,
    borderRadius: R.xl, overflow: 'hidden' },
  plan: { backgroundColor: C.ink, borderBottomWidth: 1, borderBottomColor: C.line },

  body: { flex: 1, paddingHorizontal: 11, paddingTop: 9, paddingBottom: 11 },
  name: { fontFamily: DISP, fontSize: 16, letterSpacing: -0.4, color: C.text,
    textTransform: 'uppercase' },
  look: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginTop: 6,
    minHeight: 20 },
  lookItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginRight: 2 },
  sw: { width: 10, height: 10, borderRadius: 3 },
  lookT: { fontFamily: BODY, color: C.dim, fontSize: 12 },
  tag: { paddingHorizontal: 6, height: 20, justifyContent: 'center', borderRadius: 6,
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentBorder, maxWidth: '100%' },
  tagT: { fontFamily: MEDIUM, color: C.accent, fontSize: 10, letterSpacing: 0.4,
    textTransform: 'uppercase' },

  price: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2,
    fontVariant: ['tabular-nums'] },
  closed: { fontFamily: BODY, color: C.dangerText, fontSize: 13 },
}));
