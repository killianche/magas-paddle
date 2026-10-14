// Живая фотография на главной — вторая попытка.
//
// Первая (смена суток цветными слоями, 14.10.2026) провалилась по двум
// причинам, и обе здесь учтены:
// 1. Была слишком медленной: круг в две минуты, начинался с рассвета, а
//    рассвет поверх и так закатного фото почти неотличим от исходника.
//    Человек открывал приложение и видел статичную картинку — «не работает».
// 2. Цветные слои, нарисованное солнце и штрихи дождя поверх настоящей
//    фотографии читались как дешёвый фильтр.
//
// Поэтому теперь движение — у самой фотографии, и видно его с первой
// секунды. Цвета фото не трогаются вообще. Три приёма, как в дорогих
// приложениях:
//   • въезд — при открытии фото «наезжает» и садится на место, следом
//     по очереди всплывают марка и кнопки;
//   • Кен Бёрнс — непрерывное медленное приближение и проплыв камеры;
//   • параллакс — при прокрутке фото уходит медленнее страницы, а если
//     потянуть главную вниз, растягивается.
//
// «Уменьшить движение» в настройках iPhone выключает приближение и параллакс:
// это именно то движение, от которого людям с этой настройкой становится
// плохо. Тогда фото просто проявляется.
//
// ОТКАТ: HERO_MOTION = false — неподвижная фотография, как было.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, StyleSheet, type ImageSourcePropType,
} from 'react-native';

/** Выключатель всего движения на главной. */
export const HERO_MOTION = true;

/** Въезд: фото садится на место, марка и кнопки всплывают следом, мс. */
const INTRO_MS = 1600;
/** Полкруга «камеры»: приближение туда или обратно, мс. */
const DRIFT_MS = 11_000;

/** Въезд показываем один раз за запуск. Каждое возвращение на главную
 *  с повторным «наездом» быстро надоело бы. */
let played = false;

/** Просьба «уменьшить движение» из настроек телефона. */
function useCalm() {
  const [calm, setCalm] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => { if (alive) setCalm(!!v) });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', v => setCalm(!!v));
    return () => { alive = false; sub?.remove?.() };
  }, []);
  return calm;
}

/** Общий ход въезда для фото, марки и кнопок — чтобы они шли одним дыханием.
 *
 *  visible — главная действительно на экране. При первом запуске она
 *  монтируется ЗА экраном входа, и без этого флага въезд проигрывался бы
 *  невидимым: проверено замером — марка была видна сразу, без всплытия.
 *
 *  Главное правило: марка и кнопки не могут остаться невидимыми. Что бы
 *  ни случилось с сигналами, через три секунды они на экране. Лучше без
 *  въезда, чем без кнопки записи. */
export function useHeroMotion(visible: boolean) {
  const on = HERO_MOTION && !played;
  const intro = useRef(new Animated.Value(on ? 0 : 1)).current;
  const calm = useCalm();
  const calmRef = useRef(false);
  calmRef.current = !!calm;
  const ready = useRef(false);
  const vis = useRef(visible);
  vis.current = visible;
  // wait — ждём; forced — показали без въезда по страховке; done — проиграли
  const state = useRef<'wait' | 'forced' | 'done'>(on ? 'wait' : 'done');

  const play = useCallback(() => {
    if (state.current === 'done' || !ready.current || !vis.current) return;
    state.current = 'done';
    played = true;
    // «Уменьшить движение» — без всплытия, сразу на месте
    if (calmRef.current) { intro.setValue(1); return }
    intro.setValue(0);
    Animated.timing(intro, {
      toValue: 1, duration: INTRO_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, []);

  /** Фото загрузилось — можно въезжать. Раньше нельзя: человек увидел бы,
   *  как «наезжает» пустой фон, а фото выскакивает посреди движения. */
  const start = useCallback(() => { ready.current = true; play() }, []);

  // Главная появилась на экране — въезжаем, если ещё не въехали
  useEffect(() => { play() }, [visible]);

  // Фото долго грузится — не ждём его дольше секунды с небольшим
  useEffect(() => {
    const t = setTimeout(() => { ready.current = true; play() }, 1200);
    return () => clearTimeout(t);
  }, []);

  // Страховка: марка и кнопки на экране через три секунды в любом случае
  useEffect(() => {
    const t = setTimeout(() => {
      if (state.current === 'wait') { state.current = 'forced'; intro.setValue(1) }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  /** Всплытие элемента в своём окне въезда: from/to — доли от INTRO_MS. */
  const rise = (from: number, to: number) => ({
    opacity: intro.interpolate({
      inputRange: [0, from, to, 1], outputRange: [0, 0, 1, 1], extrapolate: 'clamp' }),
    transform: [{ translateY: intro.interpolate({
      inputRange: [0, from, to, 1], outputRange: [16, 16, 0, 0], extrapolate: 'clamp' }) }],
  });

  return {
    intro, start, calm: !!calm,
    // Марка всплывает раньше кнопок: сначала «где я», потом «что делать»
    brandStyle: rise(0.28, 0.62),
    actionsStyle: rise(0.42, 0.82),
  };
}

export function HeroPhoto({ source, height, scrollY, intro, calm, onReady }: {
  source: ImageSourcePropType;
  height: number;
  /** Прокрутка главной — для параллакса. */
  scrollY: Animated.Value;
  intro: Animated.Value;
  calm: boolean;
  onReady: () => void;
}) {
  const drift = useRef(new Animated.Value(0)).current;
  const live = HERO_MOTION && !calm;

  // Камера ходит туда-обратно. Ход через sequence: он сам возвращается
  // к нулю, поэтому повтор не прыгает. В фоне iOS сам останавливает
  // нативные анимации, отдельно следить за этим не нужно
  useEffect(() => {
    if (!live) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: DRIFT_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: DRIFT_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [live]);

  if (!HERO_MOTION) {
    return <Animated.Image source={source} style={st.img} resizeMode="cover" onLoad={onReady} />;
  }

  // ── Внешний слой: прокрутка ──────────────────────────────────────────
  // Вверх — фото уходит вдвое медленнее страницы. Вниз (потянули) — фото
  // растягивается, а его верхний край стоит на месте: сдвиг на половину
  // оттяжки гасит то, что масштаб от центра тянет край вверх.
  const pullScale = scrollY.interpolate({
    inputRange: [-height, 0, 1], outputRange: [2, 1, 1], extrapolate: 'clamp' });
  const pullY = scrollY.interpolate({
    inputRange: [-height, 0, height], outputRange: [-height / 2, 0, height * 0.45], extrapolate: 'clamp' });

  // ── Внутренний слой: въезд и «камера» ────────────────────────────────
  // Масштаб «камеры» не опускается ниже 1.04: запас по краям нужен, чтобы
  // проплыв вбок никогда не показал край фотографии
  const introScale = intro.interpolate({ inputRange: [0, 1], outputRange: [1.18, 1] });
  const driftScale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.12] });
  const scale = live ? Animated.multiply(introScale, driftScale) : 1;
  const panX = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const panY = drift.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const opacity = intro.interpolate({ inputRange: [0, 0.35, 1], outputRange: [0, 1, 1] });

  return (
    <Animated.View style={[st.fill, live && {
      transform: [{ translateY: pullY }, { scale: pullScale }] }]}>
      <Animated.Image source={source} resizeMode="cover" onLoad={onReady}
        style={[st.img, { opacity }, live && {
          transform: [{ translateX: panX }, { translateY: panY }, { scale: scale as any }] }]} />
    </Animated.View>
  );
}

const st = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // У картинки размеры обязательны. Без них она встаёт в собственный размер
  // файла — в несколько раз больше экрана: фото раздувало до одного забора
  // в углу. Так было у исходной фотографии главной, так и здесь
  img: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    width: '100%', height: '100%' },
});
