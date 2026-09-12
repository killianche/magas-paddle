// «Выбери корт» — сюда ведёт «Забронировать падел-корт» на главной.
//
// Карточка держится компактной: заказчик сказал, что прежние были слишком
// большими и на экран помещалось полтора корта. Фотография ниже, цвет и
// особенности — одной строкой, снизу ближайшее время и цена. Вся карточка
// нажимается, поэтому отдельной большой кнопки со стрелкой нет.
import { useCallback } from 'react';
import {
  Image, Pressable, RefreshControl, ScrollView, Text, View, useWindowDimensions,
} from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { C, S, DISP, DISP_MED, TITLE, BODY, sheet, useTheme } from '../src/theme';
import { api, rub } from '../src/api';
import { useApi } from '../src/useApi';
import { Loading, Failed } from '../src/components/status';
import { Eyebrow } from '../src/components/velocity';
import { LookLine } from '../src/components/courtlook';
import { IconChevron } from '../src/components/icons';
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
          // «от» — самая низкая цена из оставшихся часов
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
              <View style={{ height: Math.round(cardW * 0.42) }}>
                <Image source={photosOf(c, c.id)[0]} style={s.img} resizeMode="cover" />
                <LinearGradient colors={['rgba(2,7,5,0)', 'rgba(2,7,5,.85)']}
                  locations={[0.35, 1]} style={s.fill} />
                <Text style={s.name}>{c.name}</Text>
                {/* Полоса цвета покрытия по низу фото — синий корт видно сразу */}
                {c.color && <View style={[s.bar, { backgroundColor: c.color.hex }]} />}
              </View>

              <View style={s.body}>
                <LookLine color={c.color} tags={c.tags} />
                <View style={s.meta}>
                  <Text style={[s.status, (!free || closed) && { color: C.dim2 }]} numberOfLines={1}>
                    {status}
                  </Text>
                  <Text style={s.price}>от {rub(from)}</Text>
                  <IconChevron size={15} color={C.dim2} />
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
  head: { paddingHorizontal: S.xl, paddingTop: 12, paddingBottom: 16 },
  h1: { ...TITLE.page, color: C.text, marginTop: 8 },

  card: { marginHorizontal: S.xl, marginBottom: 12, borderWidth: 1, borderColor: C.line,
    backgroundColor: C.surface, overflow: 'hidden' },
  img: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // Поверх фото — светлым в любой теме
  name: { color: '#F5F8F2', fontFamily: DISP, fontSize: 22, letterSpacing: -0.6,
    textTransform: 'uppercase', position: 'absolute', left: 13, bottom: 12 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },

  body: { paddingHorizontal: 13, paddingVertical: 11, gap: 7 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  status: { flex: 1, fontFamily: BODY, color: C.limeDim, fontSize: 13, fontWeight: '600' },
  price: { color: C.text, fontFamily: DISP_MED, fontSize: 14.5, letterSpacing: -0.2,
    fontVariant: ['tabular-nums'] },
}));
