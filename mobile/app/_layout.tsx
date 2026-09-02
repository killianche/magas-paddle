import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { C } from '../src/theme';

export default function RootLayout() {
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
        <Stack.Screen name="court" options={{ title: 'Площадка' }} />
        <Stack.Screen name="tournament" options={{ title: 'Турнир' }} />
        <Stack.Screen name="book" options={{ title: 'Проверьте заявку', presentation: 'card' }} />
        <Stack.Screen name="sent" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
