// Полоса под часами, вай-фаем и зарядкой.
//
// Экран идёт от края до края, и уезжающий вверх текст наползает на строку
// состояния — читать невозможно. iOS 26 решает это стеклом: пока страница
// не прокручена, полоса прозрачная, а как только контент заходит под неё —
// плавно появляется размытие с затемнением. Здесь то же самое.
import { useRef } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { C, sheet } from '../theme';
/** На какой прокрутке стекло становится полностью непрозрачным. */
const FADE_OVER = 60;

/** Готовый Animated.Value и обработчик прокрутки для экрана со шторкой. */
export function useTopScrim() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: true },
  );
  return { scrollY, onScroll, scrollEventThrottle: 16 };
}

export function TopScrim({ scrollY }: { scrollY: Animated.Value }) {
  const insets = useSafeAreaInsets();
  if (insets.top === 0) return null;   // нет выреза — нечего прикрывать

  const opacity = scrollY.interpolate({
    inputRange: [0, FADE_OVER],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View pointerEvents="none"
      style={[s.wrap, { height: insets.top, opacity }]}>
      {Platform.OS === 'web'
        ? <View style={[StyleSheet.absoluteFill, s.webGlass]} />
        : <BlurView intensity={38} tint={C.blur} style={StyleSheet.absoluteFill} />}
      {/* Плотнее у самого края и мягко сходит на нет — чтобы не было видно границы */}
      <LinearGradient colors={[C.topGlassA, C.topGlassB]}
        style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const s = sheet(() => ({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  // На вебе BlurView даёт лишний слой; backdrop-filter делает то же самое дешевле
  webGlass: { backgroundColor: C.topGlassB, backdropFilter: 'blur(14px)' } as any,
}));
