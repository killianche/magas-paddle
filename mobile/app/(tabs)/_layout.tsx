// Нижнее меню — плавающей панелью, как в свежей iOS.
//
// Раньше это была полоса во всю ширину, приклеенная к низу экрана. В iOS 26
// панель вкладок отделена от краёв, скруглена и сделана из «стекла»: сквозь
// неё видно содержимое, размытое и притемнённое. Так и сделано: панель лежит
// поверх экрана, снизу и по бокам поля, фон — размытие.
//
// Панель не тянется во всю ширину: она ровно по своим пунктам и стоит по
// центру, поэтому читается как отдельный плавающий элемент, а не как полоса.
// На узком экране упирается в минимальные поля от краёв.
//
// Раз панель поверх содержимого, каждый экран внутри вкладок оставляет снизу
// запас (TAB_SPACE), иначе последняя карточка уезжает под неё.
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, DISP, DISP_MED, sheet, useTheme } from '../../src/theme';
import { useClub } from '../../src/club';
import { IconHome, IconTrophy, IconRacket } from '../../src/components/icons';

/** Высота самой панели без отступа снизу.
 *
 *  Библиотека прижимает значок с подписью к ВЕРХУ пункта (flex-start) и даёт
 *  им собственные поля по 5 pt, поэтому одинаковые отступы панели сверху и
 *  снизу на глаз выходили неравными: над значком пусто, под подписью тесно.
 *  Отступы подобраны так, чтобы видимые поля совпали: у значка в коробке
 *  28 pt ещё свои ~5 pt пустоты сверху, у прописной подписи — ~3 pt снизу. */
const BAR = 62;
const PAD_TOP = 3;
const PAD_BOTTOM = 7;
/** Ширина одного пункта. По самой длинной подписи — «МОИ ЗАПИСИ». */
const TAB_W = 99;
/** Поля от краёв — доля ширины экрана. Фиксированный минимум не годится:
 *  на узком экране панель упиралась в него и снова выглядела полосой во всю
 *  ширину. Пусть лучше сжимаются сами пункты. */
const SIDE_PART = 0.1;

export default function TabsLayout() {
  useTheme();
  const club = useClub();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  // Панель ровно по своим пунктам и по центру экрана, но всегда с полями
  const count = club.showTournaments ? 3 : 2;
  const room = width - Math.round(width * SIDE_PART) * 2;
  const barW = Math.min(room, count * TAB_W + 10);
  const side = Math.round((width - barW) / 2);

  // На iPhone с полосой жеста висим прямо над ней, не отступая на всю
  // безопасную зону, — иначе панель уезжает слишком высоко.
  const bottom = insets.bottom > 0 ? Math.max(insets.bottom - 14, 8) : 12;

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.ink },
        headerTintColor: C.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: DISP, fontSize: 18 },

        tabBarStyle: {
          position: 'absolute',
          left: side, right: side, bottom,
          height: BAR,
          borderRadius: BAR / 2,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          overflow: 'hidden',
          paddingTop: PAD_TOP,
          paddingBottom: PAD_BOTTOM,
          paddingHorizontal: 5,
          // Тень отделяет панель от фотографии под ней
          shadowColor: '#000', shadowOpacity: C.shadow,
          shadowRadius: 22, shadowOffset: { width: 0, height: 10 },
          elevation: 14,
        },
        tabBarItemStyle: { paddingHorizontal: 0, borderRadius: BAR / 2 },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            {Platform.OS === 'web'
              ? <View style={[StyleSheet.absoluteFill, s.webGlass]} />
              : <BlurView intensity={58} tint={C.blur} style={StyleSheet.absoluteFill} />}
            {/* Притемнение поверх размытия: без него светлая фотография
                под панелью съедает подписи */}
            <View style={[StyleSheet.absoluteFill, s.tint]} />
          </View>
        ),

        // Выбранная вкладка — акцентом клуба, как принято в iOS
        tabBarActiveTintColor: C.accent,
        // Светлее макета: на #68766D подпись давала контраст 4.1 при норме 4.5
        tabBarInactiveTintColor: C.tabInactive,
        tabBarLabelStyle: {
          fontFamily: DISP_MED, fontSize: width < 360 ? 9.5 : 10.5,
          lineHeight: 13, letterSpacing: 0.2,
          textTransform: 'uppercase', marginTop: 2,
        },
        sceneStyle: { backgroundColor: C.ink },
      }}>
      {/* Расписание больше не отдельная вкладка: сетка стоит на главной */}
      <Tabs.Screen name="index" options={{
        title: 'Главная', headerShown: false,
        tabBarIcon: ({ color, focused }) => <IconHome color={color as string} active={focused} /> }} />
      <Tabs.Screen name="bookings" options={{
        title: 'Мои записи',
        tabBarIcon: ({ color, focused }) => <IconRacket color={color as string} active={focused} /> }} />
      {/* Клуб может выключить турниры в админке — тогда вкладки нет совсем */}
      <Tabs.Screen name="tournaments" options={{
        title: 'Турниры',
        href: club.showTournaments ? undefined : null,
        tabBarIcon: ({ color, focused }) => <IconTrophy color={color as string} active={focused} /> }} />
    </Tabs>
  );
}

const s = sheet(() => ({
  tint: { backgroundColor: C.glass,
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.glassLine,
    borderRadius: BAR / 2 },
  // На вебе BlurView даёт лишний слой; backdrop-filter делает то же дешевле
  webGlass: { backgroundColor: C.glassWeb, backdropFilter: 'blur(20px)' } as any,
}));
