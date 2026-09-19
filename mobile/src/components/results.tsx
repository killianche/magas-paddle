// Итоги турнира: баннер на главной и пьедестал на странице турнира.
//
// Заказчик: после турнира клуб сам включает в админке баннер — фото с турнира,
// победитель, второе и третье место, призы. Нужен он иногда, поэтому без
// включённого баннера на главной ничего не появляется.
//
// Баннер всегда тёмный, как карточки на фото: текст лежит поверх снимков.
import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { C, R, DISP, DISP_MED, BODY, EYEBROW, sheet, TITLE } from '../theme';
import { mediaUrl, type ApiPlace, type ApiTournament } from '../api';
import { TOURN_IMG } from '../images';
import { dayMonth, dateOfIso } from '../dates';
import { IconChevron, IconTrophy } from './icons';

const ON_PHOTO = '#F5F8F2';
/** Золото, серебро, бронза — кружок с номером места. */
const MEDAL = [
  { bg: '#E9C45A', fg: '#3A2A00' },
  { bg: '#C9D1D6', fg: '#20282C' },
  { bg: '#D29A6A', fg: '#35200C' },
];

/** Обложка турнира: своё фото клуба (/uploads/covers/…) или готовая картинка t1…t4. */
export const coverOf = (url?: string | null) =>
  url?.startsWith('/uploads/') ? { uri: mediaUrl(url) } : (TOURN_IMG[url ?? 't1'] ?? TOURN_IMG.t1);

export const photosOfTournament = (t: ApiTournament) =>
  (t.photos ?? []).length
    ? t.photos!.map(u => ({ uri: mediaUrl(u) }))
    : [coverOf(t.coverUrl)];

/** Места с медалями. dark — поверх тёмного баннера. */
export function Podium({ results, dark, max = 10 }: {
  results: ApiPlace[]; dark?: boolean; max?: number;
}) {
  const list = results.filter(r => r.names?.trim()).slice(0, max);
  return (
    <View style={{ gap: 8 }}>
      {list.map((r, i) => {
        const m = MEDAL[i];
        const top = i === 0;
        return (
          <View key={i} style={[ps.row, top && ps.rowTop, dark ? ps.rowDark : ps.rowLight]}>
            <View style={[ps.medal, top && ps.medalTop,
              m ? { backgroundColor: m.bg } : { backgroundColor: dark ? 'rgba(255,255,255,.12)' : C.surface2 }]}>
              <Text style={[ps.medalT, top && { fontSize: 17 },
                { color: m ? m.fg : dark ? ON_PHOTO : C.text }]}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[ps.names, top && ps.namesTop, { color: dark ? ON_PHOTO : C.text }]}
                numberOfLines={2}>{r.names}</Text>
              {top && <Text style={[ps.label, { color: dark ? '#C9F23D' : C.accent }]}>Победитель</Text>}
            </View>
            {!!r.prize && (
              <Text style={[ps.prize, { color: dark ? '#E9C45A' : C.amber }]} numberOfLines={1}>{r.prize}</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Баннер на главной: листаемые фото, название, пьедестал. */
export function ResultsBanner({ t, width, onPress }: {
  t: ApiTournament; width: number; onPress: () => void;
}) {
  const photos = photosOfTournament(t);
  const [i, setI] = useState(0);
  const photoH = Math.round(width * 0.66);
  const places = (t.results ?? []).filter(r => r.names?.trim());
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`Итоги турнира «${t.name}». Победитель: ${places[0]?.names ?? 'не указан'}`}
      style={({ pressed }) => [p.card, { width }, pressed && { opacity: 0.94 }]}>
      <View style={{ height: photoH }}>
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={e => {
            const n = Math.round(e.nativeEvent.contentOffset.x / width);
            if (n !== i) setI(n);
          }}>
          {photos.map((src, n) => (
            <Image key={n} source={src} style={{ width, height: photoH }} resizeMode="cover" />
          ))}
        </ScrollView>
        <LinearGradient pointerEvents="none"
          colors={['rgba(6,10,8,.35)', 'rgba(6,10,8,0)', 'rgba(6,10,8,0)', 'rgba(6,10,8,.92)']}
          locations={[0, 0.25, 0.5, 1]} style={p.fill} />
        <View style={p.badge} pointerEvents="none">
          <IconTrophy size={14} color="#1A1300" />
          <Text style={p.badgeT}>Итоги турнира</Text>
        </View>
        {photos.length > 1 && (
          <View style={p.dots} pointerEvents="none">
            {photos.map((_, n) => <View key={n} style={[p.dot, n === i && p.dotOn]} />)}
          </View>
        )}
        <View style={p.titleBox} pointerEvents="none">
          <Text style={p.title} numberOfLines={2}>{t.name}</Text>
          <Text style={p.date}>{dayMonth(dateOfIso(t.startsAt))} · {t.format}</Text>
        </View>
      </View>

      <View style={p.body}>
        {places.length > 0 && <Podium results={places} dark max={3} />}
        {!!t.result && <Text style={p.note} numberOfLines={3}>{t.result}</Text>}
        <View style={p.more}>
          <Text style={p.moreT}>
            {places.length > 3 ? `Все ${places.length} мест и фото` : 'Фото и подробности'}
          </Text>
          <IconChevron size={15} color="#C9F23D" />
        </View>
      </View>
    </Pressable>
  );
}

const p = sheet(() => ({
  card: { alignSelf: 'center', borderRadius: R.xl + 4, overflow: 'hidden', backgroundColor: '#0B1410' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  badge: { position: 'absolute', top: 14, left: 14, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#E9C45A', paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  badgeT: { ...EYEBROW, color: '#1A1300', fontSize: 11, letterSpacing: 1.2 },
  dots: { position: 'absolute', top: 22, right: 14, flexDirection: 'row', gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,.45)' },
  dotOn: { backgroundColor: '#FFFFFF', width: 16 },
  titleBox: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  title: { ...TITLE.section, fontSize: 26, lineHeight: 28, color: ON_PHOTO, textTransform: 'uppercase' },
  date: { fontFamily: BODY, color: '#CBD5C2', fontSize: 13, marginTop: 4, fontWeight: '600' },

  body: { paddingHorizontal: 14, paddingTop: 4, paddingBottom: 14, gap: 12 },
  note: { fontFamily: BODY, color: '#C3CCC5', fontSize: 13.5, lineHeight: 19 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  moreT: { fontFamily: DISP_MED, color: '#C9F23D', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' },
}));

const ps = sheet(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 9, paddingHorizontal: 11, borderRadius: R.lg },
  rowTop: { paddingVertical: 12 },
  rowDark: { backgroundColor: 'rgba(255,255,255,.06)' },
  rowLight: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line },
  medal: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  medalTop: { width: 38, height: 38, borderRadius: 19 },
  medalT: { fontFamily: DISP, fontSize: 14 },
  names: { fontFamily: DISP_MED, fontSize: 14.5, letterSpacing: -0.2 },
  namesTop: { fontFamily: DISP, fontSize: 17, letterSpacing: -0.4 },
  label: { ...EYEBROW, fontSize: 10, letterSpacing: 1.2, marginTop: 2 },
  prize: { fontFamily: DISP_MED, fontSize: 13, maxWidth: 110, textAlign: 'right' },
}));
