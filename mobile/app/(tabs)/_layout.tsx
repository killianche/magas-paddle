import { Tabs } from 'expo-router';
import { C } from '../../src/theme';
import { IconHome, IconTrophy, IconRacket } from '../../src/components/icons';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: C.ink },
        headerTintColor: C.text,
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700', fontSize: 20 },
        tabBarStyle: {
          backgroundColor: C.ink2,
          borderTopColor: C.line,
          borderTopWidth: 0.5,
          height: 86,
          paddingTop: 10,
        },
        tabBarActiveTintColor: C.lime,
        tabBarInactiveTintColor: C.dim2,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 3 },
        sceneStyle: { backgroundColor: C.ink },
      }}>
      {/* Расписание больше не отдельная вкладка: сетка стоит на главной */}
      <Tabs.Screen name="index" options={{
        title: 'Запись', headerShown: false,
        tabBarIcon: ({ color, focused }) => <IconHome color={color as string} active={focused} /> }} />
      <Tabs.Screen name="tournaments" options={{
        title: 'Турниры',
        tabBarIcon: ({ color, focused }) => <IconTrophy color={color as string} active={focused} /> }} />
      <Tabs.Screen name="bookings" options={{
        title: 'Мои записи',
        tabBarIcon: ({ color, focused }) => <IconRacket color={color as string} active={focused} /> }} />
    </Tabs>
  );
}
