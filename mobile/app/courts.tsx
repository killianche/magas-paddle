// «Выбери корт» — сюда ведёт «Забронировать падел-корт» на главной.
//
// Корты карточками: большая фотография, название, цвет покрытия и
// особенности, когда сегодня ближайшее свободное время и цена. Нажал на
// карточку — открылась страница корта с его временем (app/court.tsx).
import { useCallback } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { C, S, DISP, TITLE, BODY, sheet, useTheme } from '../src/theme';
import { api, rub } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { Eyebrow } from '../src/components/velocity';
import { Look } from '../src/components/courtlook';
import { photosOf } from '../src/components/booking';
import { today, hh } from '../src/dates';
import { upcomingGrid } from '../src/upcoming';

export default function Courts() {
  useTheme();
  const { width } = useWindowDimensions();
  const cardW = Math.min(width, 520) - S.xl * 2;

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

  return (
    <View style={s.root}>
      {screen}
      <ScrollView contentContainerStyle={{ paddingBottom: 36 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={q.pulling} onRefresh={q.pull} tintColor={C.dim} />}>

        <View style={s.head}>
          <Eyebrow>Падел-корты</Eyebrow>
          <Text style={s.h1} allowFontScaling={false}>ВЫБЕРИ КОРТ</Text>
        </View>

        {padel.map(c => {
          const row = grid.courts.find(r => r.courtId === c.id);
          const live = (row?.hours ?? []).filter(h => h.status !== 'past');
          const free = live.find(h => h.status === 'free');
          // «от» — самая низкая цена из оставшихся сегодня часов
          const prices = live.map(h => h.price).filter(p => p > 0);
          const from = prices.length ? Math.min(...prices) : Math.min(c.priceMorning, c.priceStandard);
          const closed = !!row?.closed;
          const status = closed ? (c.closedReason || 'Закрыт на ремонт')
            : free ? `${Day} свободно с ${hh(free.hour)}`
            : `${Day} мест нет — есть другие дни`;

          return (
            <Pressable key={c.id}
              onPress={() => { Haptics.selectionAsync();
                router.push({ pathname: '/court', params: { id: c.id } }) }}
              accessibilityRole="button"
              accessibilityLabel={`${c.name}. ${status}. От ${rub(from)} за час. Выбрать время`}
              style={({ pressed }) => [s.card, pressed && { opacity: 0.88 }]}>
              <View style={{ height: Math.round(cardW * 0.56) }}>
                <Image source={photosOf(c, c.id)[0]} style={s.img} resizeMode="cover" />
                <LinearGradient colors={['rgba(2,7,5,0)', 'rgba(2,7,5,.88)']}
                  locations={[0.4, 1]} style={s.fill} />
                <Text style={s.name}>{c.name}</Text>
                {/* Полоса цвета покрытия по низу фото — синий корт видно сразу */}
                {c.color && <View style={[s.bar, { backgroundColor: c.color.hex }]} />}
              </View>

              <View style={s.body}>
                <Look color={c.color} tags={c.tags} />
                <View style={s.meta}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.status, (!free || closed) && { color: C.dim2 }]}>{status}</Text>
                    <Text style={s.price}>от {rub(from)} <Text style={s.unit}>за час</Text></Text>
                  </View>
                  <View style={s.go}><Text style={s.goT}>→</Text></View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = sheet(() => ({
  root: { flex: 1, backgroundColor: C.ink },
  head: { paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 18 },
  h1: { ...TITLE.page, color: C.text, marginTop: 8 },

  card: { marginHorizontal: S.xl, marginBottom: 16, borderWidth: 1, borderColor: C.line,
    overflow: 'hidden' },
  img: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Поверх фото — светлым в любой теме
  name: { ...TITLE.card, color: '#F5F8F2', textTransform: 'uppercase',
    position: 'absolute', left: 14, bottom: 14 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 4 },

  body: { padding: 14, gap: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  status: { fontFamily: BODY, color: C.limeDim, fontSize: 13, fontWeight: '600' },
  price: { color: C.text, fontFamily: DISP, fontSize: 18, letterSpacing: -0.5, marginTop: 4,
    fontVariant: ['tabular-nums'] },
  unit: { fontFamily: BODY, color: C.dim2, fontSize: 12, letterSpacing: 0 },
  go: { width: 48, height: 48, backgroundColor: C.lime, alignItems: 'center', justifyContent: 'center' },
  goT: { color: C.onLime, fontFamily: DISP, fontSize: 20 },
}));
