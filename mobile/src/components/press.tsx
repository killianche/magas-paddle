// Кнопка, которая отвечает на палец.
//
// Раньше нажатие меняло только прозрачность — это читается как «экран
// подвис», а не как «кнопка сработала». Здесь кнопка проседает под пальцем
// и возвращается с лёгким перелётом: так движение получает вес.
//
// Числа не на глаз, а по правилам движения: микровзаимодействие — 100–200 мс;
// нажатие замедляется к концу (ease-out), возврат идёт пружиной с небольшим
// перелётом — это и есть «живое», а не «дёрганое».
//
// Поверх главной кнопки раз в несколько секунд проходит блик — ambient-слой:
// его замечают боковым зрением и не отвлекаются на него.
//
// ОТКАТ: PRESS_LIFE = false возвращает прежнее поведение (только прозрачность).
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View,
  type StyleProp, type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Выключатель оживления кнопок. */
export const PRESS_LIFE = true;

/** Насколько кнопка проседает под пальцем. Больше — уже кукольно. */
const DOWN = 0.965;

/** Просьба «уменьшить движение» из настроек телефона. */
function useCalm() {
  const [calm, setCalm] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setCalm(!!v) });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setCalm(!!v));
    return () => { alive = false; sub?.remove?.() };
  }, []);
  return calm;
}

export function Lift({
  onPress, children, style, sheen, radius = 0, disabled,
  accessibilityLabel, accessibilityRole = 'button', accessibilityState, hitSlop,
}: {
  onPress?: () => void;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle> | ((s: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Блик по кнопке — только для главной, иначе рябит в глазах. */
  sheen?: boolean;
  /** Скругление кнопки: по нему обрезается блик. */
  radius?: number;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityRole?: 'button' | 'link';
  accessibilityState?: { disabled?: boolean; selected?: boolean };
  hitSlop?: number;
}) {
  const a = useRef(new Animated.Value(0)).current;
  const calm = useCalm();
  const live = PRESS_LIFE && !calm;

  const down = () => {
    if (!live) return;
    Animated.timing(a, {
      toValue: 1, duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();
  };
  const up = () => {
    if (!live) return;
    // Пружина, а не обратный timing: возврат с перелётом читается как вес
    Animated.spring(a, {
      toValue: 0, friction: 5, tension: 180, useNativeDriver: true,
    }).start();
  };

  const scale = a.interpolate({ inputRange: [0, 1], outputRange: [1, DOWN] });

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={onPress} onPressIn={down} onPressOut={up}
        disabled={disabled} hitSlop={hitSlop}
        accessibilityRole={accessibilityRole}
        accessibilityLabel={accessibilityLabel}
        accessibilityState={accessibilityState}
        style={style as any}>
        {children}
        {!!sheen && live && <Sheen radius={radius} />}
      </Pressable>
    </Animated.View>
  );
}

/** Блик: узкая светлая полоса, раз в несколько секунд проходящая по кнопке. */
function Sheen({ radius }: { radius: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const [w, setW] = useState(0);

  useEffect(() => {
    if (!w) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(4200),
      Animated.timing(v, {
        toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [w]);

  // Ширину меряем сами: проценты в сдвиге ведут себя по-разному на платформах
  const x = v.interpolate({ inputRange: [0, 1], outputRange: [-w * 0.9, w * 1.3] });

  return (
    <View pointerEvents="none" onLayout={e => setW(e.nativeEvent.layout.width)}
      style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      {w > 0 && (
        <Animated.View style={[s.band, { width: w * 0.45, transform: [{ translateX: x }] }]}>
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.30)', 'rgba(255,255,255,0)']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill} />
        </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  band: { position: 'absolute', top: -20, bottom: -20 },
});
