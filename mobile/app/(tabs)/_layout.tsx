// Нижнее меню — плавающей панелью, как в свежей iOS.
//
// Раньше это была полоса во всю ширину, приклеенная к низу экрана. В iOS 26
// панель вкладок отделена от краёв, скруглена и сделана из «стекла»: сквозь
// неё видно содержимое, размытое и притемнённое. Так и сделано: панель лежит
// поверх экрана, снизу и по бокам поля, фон — размытие.
//
// Раз панель поверх содержимого, каждый экран внутри вкладок оставляет снизу
// запас (TAB_SPACE), иначе последняя карточка уезжает под неё.
import { Platform, StyleSheet, View } from 'react-native';
import { Tabs } from 'expo-router';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, DISP, DISP_MED } from '../../src/theme';
import { useClub } from '../../src/club';
import { IconHome, IconTrophy, IconRacket } from '../../src/components/icons';

/** Высота самой панели без отступа снизу.
 *
 *  Библиотека прижимает значок с подписью к ВЕРХУ пункта (flex-start) и даёт
 *  им собственные поля по 5 pt, поэтому одинаковые отступы панели сверху и
 *  снизу на глаз выходили неравными: над значком пусто, под подписью тесно.
 *  Отступы подобраны так, чтобы видимые поля совпали: у значка в коробке
 *  28 pt ещё свои ~5 pt пустоты сверху, у прописной подписи — ~3 pt снизу. */
const BAR = 63;
const PAD_TOP = 3;
const PAD_BOTTOM = 7;
/** Поля панели от краёв экрана. */
const SIDE = 14;

export default function TabsLayout() {
  const club = useClub();
  const insets = useSafeAreaInsets();
  // На iPhone с вырезом снизу уже есть полоса жеста — над ней и висим.
  // На старых и на вебе своего отступа нет, добавляем сами.
  const bottom = Math.max(insets.bottom, 12);

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.ink },
        headerTintColor: C.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: DISP, fontSize: 18 },

        tabBarStyle: {
          position: 'absolute',
          left: SIDE, right: SIDE, bottom,
          height: BAR,
          borderRadius: BAR / 2,
          borderTopWidth: 0,
          backgroundColor: 'transparent',
          overflow: 'hidden',
          paddingTop: PAD_TOP,
          paddingBottom: PAD_BOTTOM,
          // Тень отделяет панель от фотографии под ней
          shadowColor: '#000', shadowOpacity: 0.45,
          shadowRadius: 18, shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        },
        tabBarBackground: () => (
          <View style={StyleSheet.absoluteFill}>
            {Platform.OS === 'web'
              ? <View style={[StyleSheet.absoluteFill, s.webGlass]} />
              : <BlurView intensity={44} tint="dark" style={StyleSheet.absoluteFill} />}
            {/* Притемнение поверх размытия: без него светлая фотография
                под панелью съедает подписи */}
            <View style={[StyleSheet.absoluteFill, s.tint]} />
          </View>
        ),

        tabBarActiveTintColor: C.text,
        // Светлее макета: на #68766D подпись давала контраст 4.1 при норме 4.5
        tabBarInactiveTintColor: '#8D9A91',
        tabBarLabelStyle: {
          fontFamily: DISP_MED, fontSize: 11, lineHeight: 13, letterSpacing: 0.3,
          textTransform: 'uppercase', marginTop: 2,
        },
        sceneStyle: { backgroundColor: C.ink },
      }}>
      {/* Расписание больше не отдельная вкладка: сетка стоит на главной */}
      <Tabs.Screen name="index" options={{
        title: 'Запись', headerShown: false,
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

const s = StyleSheet.create({
  tint: { backgroundColor: 'rgba(6,18,13,0.62)',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: BAR / 2 },
  // На вебе BlurView даёт лишний слой; backdrop-filter делает то же дешевле
  webGlass: { backgroundColor: 'rgba(6,18,13,0.35)', backdropFilter: 'blur(18px)' } as any,
});
