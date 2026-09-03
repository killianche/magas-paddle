import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { C } from '../src/theme';

export default function RootLayout() {
  // Oswald — узкий гротеск для плакатных заголовков. Лицензия OFL, кириллица полная.
  const [ready] = useFonts({
    'Oswald-Bold': require('../assets/fonts/Oswald-Bold.ttf'),
    'Oswald-Medium': require('../assets/fonts/Oswald-Medium.ttf'),
  });

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.ink }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.ink },
          headerTintColor: C.text,
          headerTitleStyle: { fontWeight: '600', fontSize: 18 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.ink },
          // Смахивание назад с любого места экрана, а не только от левого края
          fullScreenGestureEnabled: true,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="schedule" options={{ title: 'Выберите время' }} />
        <Stack.Screen name="court" options={{ title: 'Площадка' }} />
        <Stack.Screen name="club" options={{ title: 'Клуб' }} />
        <Stack.Screen name="tournament" options={{ title: 'Турнир' }} />
        <Stack.Screen name="book" options={{ title: 'Проверьте заявку', presentation: 'card' }} />
        <Stack.Screen name="sent" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
