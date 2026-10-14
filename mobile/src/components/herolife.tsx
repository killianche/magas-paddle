// Живая фотография на главной: медленная смена времени суток и погоды.
//
// Сама фотография клуба не меняется — меняется свет над ней. У круга есть
// сюжет, а не просто перебор оттенков:
//
//   рассвет и утренний туман → ясный день, солнце в зените →
//   закат и вечерний дождь → звёздная ночь → снова рассвет
//
// Солнце идёт по небу дугой: встаёт слева, в полдень стоит высоко, садится
// справа и пропадает на ночь. Ночью проступают звёзды. Слои перетекают
// друг в друга, круг замыкается без шва.
//
// Почему так медленно. Фон не должен спорить с маркой и кнопками поверх него:
// это ambient-слой, его замечают боковым зрением. Полный круг — две минуты.
// Затемнение, которое держит марку и кнопки читаемыми, лежит ПОВЕРХ этого
// слоя, поэтому ночь только помогает тексту, а день ему не мешает.
//
// Движение замирает само, когда ему незачем идти: человек ушёл с главной,
// свернул приложение или попросил в настройках телефона «уменьшить движение».
//
// ОТКАТ: HERO_LIFE = false возвращает прежнюю неподвижную фотографию,
// ничего не удаляя.
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, AppState, Easing, StyleSheet, View, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

/** Выключатель всего эффекта. */
export const HERO_LIFE = true;

/** Полный круг суток, мс. Две минуты: заметно, но не мельтешит. */
const DAY_MS = 120_000;
/** Облачная тень и туман проходят кадр за это время. */
const DRIFT_MS = 40_000;

/** Свет четырёх времён суток — сверху, из середины и снизу кадра.
 *  Фото само по себе закатное, поэтому день нарочно холодный и светлый:
 *  иначе он не отличался бы от рассвета (проверено замером яркости неба). */
const PHASES: { key: string; colors: [string, string, string] }[] = [
  // Рассвет: розово-персиковое небо, сиреневая тень снизу
  { key: 'dawn', colors: ['rgba(255,150,170,0.40)', 'rgba(255,200,180,0.14)', 'rgba(90,80,150,0.30)'] },
  // День: холодная ясная синева гасит закатное золото фотографии
  { key: 'day', colors: ['rgba(100,178,255,0.50)', 'rgba(205,232,255,0.20)', 'rgba(30,80,70,0.10)'] },
  // Закат: густой оранжевый с малиновым, тень плотнее
  { key: 'dusk', colors: ['rgba(255,105,35,0.46)', 'rgba(225,70,110,0.22)', 'rgba(40,20,64,0.42)'] },
  // Ночь: глубокий синий, фото уходит в сумрак
  { key: 'night', colors: ['rgba(6,16,46,0.72)', 'rgba(10,22,58,0.52)', 'rgba(2,6,20,0.64)'] },
];

/** Треугольная кривая: слой разгорается к своему часу и гаснет к соседним.
 *  У первого слоя есть края с обеих сторон — иначе круг замыкался бы рывком. */
function fade(t: Animated.Value, i: number) {
  const n = PHASES.length, step = 1 / n, at = i * step;
  if (i === 0) {
    return t.interpolate({
      inputRange: [0, step, 1 - step, 1], outputRange: [1, 0, 0, 1], extrapolate: 'clamp' });
  }
  return t.interpolate({
    inputRange: [at - step, at, at + step], outputRange: [0, 1, 0], extrapolate: 'clamp' });
}

/** Круг, который продолжается с того места, где его остановили.
 *
 *  Встроенный Animated.loop для этого не годится: после паузы он сбрасывает
 *  значение к точке, где его запустили, а не к нулю, — и круг дальше крутится
 *  только от середины. А пауза здесь частая: человек прокрутил главную вниз,
 *  и солнце не должно идти, пока его не видно. */
function resume(v: Animated.Value, ms: number) {
  let alive = true;
  const step = (from: number) => {
    v.setValue(from);
    Animated.timing(v, {
      toValue: 1, duration: Math.max(1, ms * (1 - from)),
      easing: Easing.linear, useNativeDriver: true,
    }).start(({ finished }) => { if (finished && alive) step(0) });
  };
  // Текущее значение берём у самой анимации: с нативным драйвером оно живёт
  // на стороне телефона, и только так его можно узнать точно
  v.stopAnimation(at => step(at >= 1 ? 0 : at));
  return () => { alive = false; v.stopAnimation() };
}

/** Звёзды: где стоят и насколько ярки. Только в верхней половине — там небо. */
const STARS = Array.from({ length: 18 }, (_, i) => ({
  x: ((i * 37 + 11) % 97) / 100,
  y: ((i * 23 + 7) % 44) / 100,
  r: i % 5 === 0 ? 1.8 : i % 3 === 0 ? 1.3 : 1,
  twinkle: i % 2 === 0,
}));

export function HeroLife({ height, active = true }: { height: number; active?: boolean }) {
  const { width } = useWindowDimensions();
  const day = useRef(new Animated.Value(0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;
  const [calm, setCalm] = useState(false);
  const [awake, setAwake] = useState(true);

  // «Уменьшить движение» в настройках телефона — просьба, а не пожелание
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setCalm(!!v) });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setCalm(!!v));
    return () => { alive = false; sub?.remove?.() };
  }, []);

  // Свернули приложение — анимации незачем крутиться в фоне
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setAwake(s === 'active'));
    return () => sub.remove();
  }, []);

  const run = HERO_LIFE && active && awake && !calm;

  useEffect(() => {
    if (!run) return;
    const stopDay = resume(day, DAY_MS);
    const stopDrift = resume(drift, DRIFT_MS);
    // Мерцание звёзд: туда-обратно, мягко. Сбрасывать нечего — оно
    // само возвращается к нулю каждой второй половиной
    const blink = Animated.loop(Animated.sequence([
      Animated.timing(twinkle, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(twinkle, { toValue: 0, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    blink.start();
    return () => { stopDay(); stopDrift(); blink.stop() };
  }, [run]);

  if (!HERO_LIFE) return null;

  // Две разные остановки, и путать их нельзя:
  // — пауза (прокрутили главную, свернули приложение): кадр замирает как есть.
  //   Прокрутка на 60 точек ещё оставляет фото на экране, и исчезни оттенок
  //   в этот миг — человек увидел бы скачок;
  // — «уменьшить движение»: исходная фотография без всякого оттенка, как была
  //   до оживления. Постоянный цветной слой таким людям ни к чему.
  const still = calm;

  // ── Солнце: дуга по небу ───────────────────────────────────────────────
  // Встаёт слева на рассвете (0), в зените днём (0.25), садится справа
  // к закату (0.5–0.62), ночью невидимо возвращается налево (0.62–0.9)
  const sunSize = width * 0.95;
  const T_SUN = [0, 0.25, 0.5, 0.62, 0.9, 1];
  const sunX = day.interpolate({ inputRange: T_SUN,
    outputRange: [0.12, 0.5, 0.84, 0.96, 0.04, 0.12].map(v => v * width - sunSize / 2) });
  const sunY = day.interpolate({ inputRange: T_SUN,
    outputRange: [0.40, 0.06, 0.34, 0.52, 0.56, 0.40].map(v => v * height - sunSize / 2) });
  const sunOn = day.interpolate({
    inputRange: [0, 0.25, 0.5, 0.6, 0.66, 0.9, 0.96, 1],
    outputRange: [0.75, 0.95, 0.85, 0.35, 0, 0, 0.35, 0.75], extrapolate: 'clamp' });

  // ── Погода по сюжету ───────────────────────────────────────────────────
  // Утренний туман: стоит на рассвете, рассеивается к полудню
  const mistOn = day.interpolate({
    inputRange: [0, 0.14, 0.86, 0.94, 1], outputRange: [0.9, 0, 0, 0.5, 0.9], extrapolate: 'clamp' });
  // Вечерний дождь: в закат и в начале ночи
  const rainOn = day.interpolate({
    inputRange: [0, 0.46, 0.54, 0.74, 0.82, 1], outputRange: [0, 0, 1, 1, 0, 0], extrapolate: 'clamp' });
  // Звёзды: только ночью
  const starsOn = day.interpolate({
    inputRange: [0, 0.62, 0.72, 0.86, 0.94, 1], outputRange: [0, 0, 1, 1, 0, 0], extrapolate: 'clamp' });

  const driftX = drift.interpolate({ inputRange: [0, 1], outputRange: [-width, width] });
  const mistX = drift.interpolate({ inputRange: [0, 0.5, 1], outputRange: [-24, 24, -24] });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { height }]}>
      {/* Свет времени суток */}
      {PHASES.map((p, i) => (
        <Animated.View key={p.key} style={[StyleSheet.absoluteFill,
          { opacity: still ? 0 : fade(day, i) }]}>
          <LinearGradient colors={p.colors} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ))}

      {!still && (
        <>
          {/* Солнце: мягкое тёплое свечение, а не диск — так оно ложится
              на фотографию светом, а не наклейкой */}
          <Animated.View style={{
            position: 'absolute', width: sunSize, height: sunSize, opacity: sunOn,
            transform: [{ translateX: sunX }, { translateY: sunY }] }}>
            <Svg width={sunSize} height={sunSize}>
              <Defs>
                <RadialGradient id="sun" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFF4D6" stopOpacity="0.62" />
                  <Stop offset="0.18" stopColor="#FFD98A" stopOpacity="0.34" />
                  <Stop offset="0.5" stopColor="#FFB45C" stopOpacity="0.10" />
                  <Stop offset="1" stopColor="#FF9A40" stopOpacity="0" />
                </RadialGradient>
              </Defs>
              <Circle cx={sunSize / 2} cy={sunSize / 2} r={sunSize / 2} fill="url(#sun)" />
            </Svg>
          </Animated.View>

          {/* Звёзды: половина мерцает, половина горит ровно — так живее */}
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: starsOn }]}>
            {STARS.map((st, i) => (
              <Animated.View key={i} style={[s.star, {
                left: st.x * width, top: st.y * height,
                width: st.r * 2, height: st.r * 2, borderRadius: st.r,
                opacity: st.twinkle
                  ? twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] })
                  : 0.8,
              }]} />
            ))}
          </Animated.View>

          {/* Облачная тень: широкое мягкое пятно поперёк кадра */}
          <Animated.View style={[s.band, { width: width * 1.4, transform: [{ translateX: driftX }] }]}>
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.16)', 'rgba(0,0,0,0)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
          </Animated.View>

          {/* Утренний туман: белая дымка у земли, чуть колышется */}
          <Animated.View style={[s.mist, { height: height * 0.55, opacity: mistOn,
            transform: [{ translateX: mistX }] }]}>
            <LinearGradient
              colors={['rgba(240,244,255,0)', 'rgba(240,244,255,0.34)', 'rgba(240,244,255,0.50)']}
              locations={[0, 0.6, 1]} style={StyleSheet.absoluteFill} />
          </Animated.View>

          <Rain on={rainOn} height={height} />
        </>
      )}
    </View>
  );
}

/** Дождь: тонкие косые штрихи. Их немного — важен намёк, а не ливень. */
function Rain({ on, height }: { on: Animated.AnimatedInterpolation<number>; height: number }) {
  const drops = useRef(
    Array.from({ length: 18 }, (_, i) => ({
      v: new Animated.Value(0),
      left: `${(i * 5.7 + 2) % 98}%`,
      len: 30 + (i % 4) * 12,
      ms: 850 + (i % 5) * 230,
      delay: i * 110,
    })),
  ).current;

  useEffect(() => {
    const loops = drops.map(d => Animated.loop(Animated.sequence([
      Animated.delay(d.delay),
      Animated.timing(d.v, { toValue: 1, duration: d.ms, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(d.v, { toValue: 0, duration: 0, useNativeDriver: true }),
    ])));
    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: on }]}>
      {drops.map((d, i) => (
        <Animated.View key={i} style={[s.drop, {
          left: d.left as any, height: d.len,
          transform: [
            { translateY: d.v.interpolate({ inputRange: [0, 1], outputRange: [-d.len, height] }) },
            { translateX: d.v.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }) },
            { rotate: '14deg' },
          ],
        }]} />
      ))}
    </Animated.View>
  );
}

const s = StyleSheet.create({
  band: { position: 'absolute', top: 0, bottom: 0 },
  mist: { position: 'absolute', left: -30, right: -30, bottom: 0 },
  star: { position: 'absolute', backgroundColor: '#F4F7FF' },
  drop: {
    position: 'absolute', top: 0, width: 1.6, borderRadius: 1,
    backgroundColor: 'rgba(214,232,255,0.5)',
  },
});
