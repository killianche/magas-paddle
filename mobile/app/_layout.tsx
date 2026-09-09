import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { View } from 'react-native';
import { C, DISP } from '../src/theme';

export default function RootLayout() {
  // Inter, лицензия OFL. Начертания собраны из переменного шрифта и урезаны
  // до латиницы с кириллицей — по 53 КБ вместо 876 КБ исходника.
  // В макете стоял Archivo Black, но кириллицы в нём нет вовсе.
  const [ready] = useFonts({
    'Inter-Black': require('../assets/fonts/Inter-Black.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
  });

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.ink }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.ink },
          headerTintColor: C.text,
          headerTitleStyle: { fontFamily: DISP, fontSize: 17 },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: C.ink },
          // Смахивание назад с любого места экрана, а не только от левого края
          fullScreenGestureEnabled: true,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="schedule" options={{ title: 'Выберите время' }} />
        <Stack.Screen name="court" options={{ title: 'Площадка' }} />
        <Stack.Screen name="account" options={{ title: 'Аккаунт' }} />
        <Stack.Screen name="prices" options={{ title: "Цены" }} />
        <Stack.Screen name="football" options={{ title: 'Футбольное поле' }} />
        <Stack.Screen name="tournament" options={{ title: 'Турнир' }} />
        <Stack.Screen name="book" options={{ title: 'Проверьте заявку', presentation: 'card' }} />
        <Stack.Screen name="sent" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
