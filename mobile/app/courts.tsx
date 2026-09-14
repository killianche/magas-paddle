// «Выбери корт» — сюда ведёт «Забронировать падел-корт» на главной.
//
// Заказчик хотел, чтобы сразу было видно, какой корт какой: синий или
// зелёный, одиночный, ультраширокий. Поэтому вместо общих фотографий клуба
// у каждого корта план сверху в цвете покрытия, а все шесть помещаются
// на экран сеткой в два столбца. Над сеткой — отбор по цвету и особенностям,
// под планом — полоска часов: зелёным свободные, серым занятые.
// Фотографии остаются на странице корта.
import { useCallback, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { C, S, DISP, DISP_MED, TITLE, BODY, MEDIUM, sheet, useTheme, R } from '../src/theme';
import { api, rub, type ApiCourt } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { Eyebrow } from '../src/components/velocity';
import { CourtPlan, isSingle } from '../src/components/courtlook';
import { today, hh } from '../src/dates';
import { upcomingGrid } from '../src/upcoming';

const GAP = 10;

/** Во множественном числе для отбора: «Синие · 4». */
const PLURAL: Record<string, string> = { blue: 'Синие', green: 'Зелёные' };

type Filter = { key: string; label: string; test: (c: ApiCourt) => boolean };

function filtersOf(courts: ApiCourt[]): Filter[] {
  const out: Filter[] = [{ key: 'all', label: 'Все', test: () => true }];
  const colors = new Map<string, string>();
  courts.forEach(c => { if (c.color) colors.set(c.color.key, PLURAL[c.color.key] ?? c.color.name) });
  // Отбор по цвету имеет смысл, только когда цветов больше одного
  if (colors.size > 1) colors.forEach((label, key) =>
    out.push({ key: `color:${key}`, label, test: c => c.color?.key === key }));
  const tags = [...new Set(courts.flatMap(c => c.tags ?? []))];
  tags.forEach(t => out.push({ key: `tag:${t}`, label: t, test: c => (c.tags ?? []).includes(t) }));
  return out;
}

export default function Courts() {
  useTheme();
  const { width } = useWindowDimensions();
  const [filter, setFilter] = useState('all');
  const inner = Math.min(width, 520) - S.xl * 2;
  const tileW = Math.floor((inner - GAP) / 2);
  const narrow = width < 360;

  const q = useApi(async () => {
    const [courts, next] = await Promise.all([api.courts(), upcomingGrid()]);
    return { courts, grid: next.grid, tomorrow: next.tomorrow };
  }, [], `courts.list.${today()}`);
  useFocusEffect(useCallback(() => { q.refresh() }, []));

  const screen = <Stack.Screen options={{ title: 'Бронирование' }} />;
  if (q.loading && !q.data) return (<>{screen}<Loading note="Смотрю корты" /></>);
  if (!q.data) return (<>{screen}
    <Failed message={q.error ?? 'Пустой ответ сервера'} onRetry={q.reload} /></>);

  const { courts, grid, tomorrow } = q.data;
  // Поздно вечером сегодня уже всё прошло — говорим про завтра
  const Day = tomorrow ? 'Завтра' : 'Сегодня';
  const padel = courts.filter(c => !c.isFootball);
  const filters = filtersOf(padel);
  const active = filters.find(f => f.key === filter) ?? filters[0];
  const shown = padel.filter(active.test);

  return (
    <View style={s.root}>
      {screen}
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

        <View style={s.head}>
          <Eyebrow>{`Падел-корты · ${padel.length}`}</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>ВЫБЕРИ КОРТ</Text>
          <Text style={s.lead}>
            {grid.dayOff ? `${Day} клуб не работает — другие дни внутри корта`
              : `Полоска — часы на ${tomorrow ? 'завтра' : 'сегодня'}, зелёные свободны`}
          </Text>
        </View>

        {filters.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}
            contentContainerStyle={s.filters}>
            {filters.map(f => {
              const on = f.key === active.key;
              const n = padel.filter(f.test).length;
              const sw = f.key.startsWith('color:') ? padel.find(f.test)?.color?.hex : undefined;
              return (
                <Pressable key={f.key} onPress={() => { Haptics.selectionAsync(); setFilter(f.key) }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={`${f.label}: ${n}`}
                  style={[s.chip, on && s.chipOn]}>
                  {sw && <View style={[s.sw, { backgroundColor: sw }]} />}
                  <Text style={[s.chipT, on && s.chipTOn]}>{f.label}</Text>
                  <Text style={[s.chipN, on && s.chipTOn]}>{n}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={s.grid}>
          {shown.map(c => {
            const row = grid.courts.find(r => r.courtId === c.id);
            const live = (row?.hours ?? []).filter(h => h.status !== 'past');
            const free = live.find(h => h.status === 'free');
            // «от» — самая низкая цена из оставшихся часов
            const prices = live.map(h => h.price).filter(p => p > 0);
            const from = prices.length ? Math.min(...prices) : Math.min(c.priceMorning, c.priceStandard);
            const closed = !!row?.closed;
            const status = closed ? (c.closedReason || 'Закрыт на ремонт')
              : grid.dayOff ? 'Не работаем'
              : free ? `Свободно с ${hh(free.hour)}` : 'Мест нет';
            const tags = c.tags ?? [];

            return (
              <Pressable key={c.id}
                onPress={() => { Haptics.selectionAsync();
                  router.push({ pathname: '/court', params: { id: c.id } }) }}
                accessibilityRole="button"
                accessibilityLabel={[c.name, c.color?.name, ...tags, status,
                  `от ${rub(from)} за час`].filter(Boolean).join('. ')}
                style={({ pressed }) => [s.tile, { width: tileW },
                  pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}>

                <View style={s.plan}>
                  <CourtPlan width={tileW - 2} color={c.color} single={isSingle(tags)} dim={closed} />
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

                  {/* Низ карточки прижат вниз: в ряду соседние плитки одной высоты,
                      а ярлык «Ультраширокий» есть не у всех */}
                  <View style={{ flex: 1, minHeight: 10 }} />
                  {live.length > 0 && !closed && (
                    <View style={s.strip}>
                      {live.map(h => (
                        <View key={h.hour}
                          style={[s.seg, h.status === 'free' ? s.segFree : s.segBusy]} />
                      ))}
                    </View>
                  )}

                  <Text style={[s.status, (!free || closed) && { color: C.dim2 }]} numberOfLines={1}>
                    {status}
                  </Text>
                  <View style={s.foot}>
                    <Text style={s.price}>от {rub(from)}</Text>
                  </View>
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
  head: { paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 14 },
  h1: { ...TITLE.page, color: C.text, marginTop: 8 },
  lead: { fontFamily: BODY, color: C.dim, fontSize: 13, lineHeight: 18, marginTop: 8 },

  filters: { paddingHorizontal: S.xl, gap: 8, paddingBottom: 14 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 7, height: 36, paddingHorizontal: 14,
    borderRadius: R.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.surface },
  chipOn: { backgroundColor: C.text, borderColor: C.text },
  chipT: { fontFamily: MEDIUM, color: C.text, fontSize: 13 },
  chipN: { fontFamily: MEDIUM, color: C.dim2, fontSize: 12, fontVariant: ['tabular-nums'] },
  chipTOn: { color: C.ink },
  sw: { width: 10, height: 10, borderRadius: 3 },

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
  lookT: { fontFamily: BODY, color: C.dim, fontSize: 12 },
  tag: { paddingHorizontal: 6, height: 20, justifyContent: 'center', borderRadius: 6,
    backgroundColor: C.accentSoft, borderWidth: 1, borderColor: C.accentBorder, maxWidth: '100%' },
  tagT: { fontFamily: MEDIUM, color: C.accent, fontSize: 10, letterSpacing: 0.4,
    textTransform: 'uppercase' },

  strip: { flexDirection: 'row', gap: 2, height: 5 },
  seg: { flex: 1, borderRadius: 2 },
  segFree: { backgroundColor: C.accent },
  segBusy: { backgroundColor: C.line },

  status: { fontFamily: BODY, color: C.limeDim, fontSize: 12, fontWeight: '600', marginTop: 7 },
  foot: { marginTop: 3 },
  price: { color: C.text, fontFamily: DISP_MED, fontSize: 14, letterSpacing: -0.2,
    fontVariant: ['tabular-nums'] },
}));
