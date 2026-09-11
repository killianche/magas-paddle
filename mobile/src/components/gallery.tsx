// Галерея фотографий площадки: листается пальцем, снизу — точки и счётчик.
//
// На экране корта это главное: человек выбирает площадку глазами, а не по
// названию. Поэтому кадр занимает почти половину экрана.
import { useState } from 'react';
import { Dimensions, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { C, EYEBROW, sheet } from '../theme';

const W = Dimensions.get('window').width;

export function Gallery({ photos, height = Math.round(W * 0.86) }: {
  photos: any[]; height?: number;
}) {
  const [i, setI] = useState(0);
  if (photos.length === 0) return null;

  return (
    <View style={{ height }}>
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={e => {
          const n = Math.round(e.nativeEvent.contentOffset.x / W);
          if (n !== i) setI(n);
        }}>
        {photos.map((src, n) => (
          <Image key={n} source={src} style={{ width: W, height }} resizeMode="cover"
            accessibilityLabel={`Фотография ${n + 1} из ${photos.length}`} />
        ))}
      </ScrollView>

      {photos.length > 1 && (
        <>
          <View style={s.dots} pointerEvents="none">
            {photos.map((_, n) => (
              <View key={n} style={[s.dot, n === i && s.dotOn]} />
            ))}
          </View>
          <View style={s.count} pointerEvents="none">
            <Text style={s.countT}>{i + 1} / {photos.length}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const s = sheet(() => ({
  dots: { position: 'absolute', left: 0, right: 0, bottom: 14, flexDirection: 'row',
    justifyContent: 'center', gap: 6 },
  dot: { width: 16, height: 3, backgroundColor: 'rgba(255,255,255,.38)' },
  dotOn: { backgroundColor: C.lime },
  count: { position: 'absolute', top: 14, right: 14, backgroundColor: 'rgba(2,7,5,.66)',
    paddingHorizontal: 8, paddingVertical: 4 },
  countT: { ...EYEBROW, color: '#F5F8F2' },   // поверх фото
}));
