import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { C, DISP, DISP_MED } from '../../src/theme';
import { useClub } from '../../src/club';
import { IconHome, IconTrophy, IconRacket } from '../../src/components/icons';

export default function TabsLayout() {
  const club = useClub();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.ink },
        headerTintColor: C.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontFamily: DISP, fontSize: 18 },
        // Нижняя панель по макету: почти чёрная, тонкая светлая линия сверху,
        // подписи мелкие прописные вразрядку, активная — белая.
        tabBarStyle: {
          backgroundColor: 'rgba(3,16,9,0.98)',
          borderTopColor: C.line,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 84,
          paddingTop: 9,
        },
        tabBarActiveTintColor: C.text,
        // Светлее, чем в макете: на #68766D подпись давала контраст 4.1 при норме 4.5
        tabBarInactiveTintColor: '#8D9A91',
        tabBarLabelStyle: {
          fontFamily: DISP_MED, fontSize: 11, letterSpacing: 0.4,
          textTransform: 'uppercase', marginTop: 4,
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
