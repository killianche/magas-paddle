import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useLayoutEffect, useState } from 'react';
import { useFonts } from 'expo-font';
import { loadClub } from '../src/club';
import { Appearance, View, useColorScheme } from 'react-native';
import { C, DISP, applyTheme, useTheme, type Mode } from '../src/theme';
import { loadThemePref, useThemePref, type ThemePref } from '../src/themepref';

const modeOf = (pref: ThemePref, system: string | null | undefined): Mode =>
  pref === 'system' ? (system === 'light' ? 'light' : 'dark') : pref;

export default function RootLayout() {
  // Контакты клуба: сохранённые показываем сразу, свежие подтягиваем фоном
  useEffect(() => { loadClub() }, []);

  // Тема: выбор человека («как в телефоне» — по настройке iPhone).
  // Сохранённый выбор читаем до первой отрисовки, чтобы не мигнуть тёмной.
  const pref = useThemePref();
  const system = useColorScheme();
  const mode = modeOf(pref, system);
  const [themeReady, setThemeReady] = useState(false);
  useEffect(() => {
    loadThemePref()
      .then(p => applyTheme(modeOf(p, Appearance.getColorScheme())))
      .finally(() => setThemeReady(true));
  }, []);
  useLayoutEffect(() => { if (themeReady) applyTheme(mode) }, [mode, themeReady]);
  useTheme();

  // Inter, лицензия OFL. Начертания собраны из переменного шрифта и урезаны
  // до латиницы с кириллицей — по 53 КБ вместо 876 КБ исходника.
  // В макете стоял Archivo Black, но кириллицы в нём нет вовсе.
  const [ready] = useFonts({
    'Inter-Black': require('../assets/fonts/Inter-Black.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
  });

  if (!ready || !themeReady) return <View style={{ flex: 1, backgroundColor: C.ink }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style={mode === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: C.ink },
          headerTintColor: C.text,
          headerTitleStyle: { fontFamily: DISP, fontSize: 17 },
          headerShadowVisible: false,
          // У кнопки «назад» — только стрелка, без подписи.
          //
          // iOS подставляет туда заголовок предыдущего экрана, а у группы
          // вкладок заголовка нет, и во время смахивания на секунду
          // выглядывало служебное «(tabs)». Заодно так спокойнее: подпись
          // разной длины дёргала шапку при каждом переходе.
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: C.ink },
          // Смахивание назад с любого места экрана, а не только от левого края
          fullScreenGestureEnabled: true,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: 'Magas Padel' }} />
        <Stack.Screen name="schedule" options={{ title: 'Выберите время' }} />
        <Stack.Screen name="courts" options={{ title: 'Бронирование' }} />
        <Stack.Screen name="court" options={{ title: 'Корт' }} />
        <Stack.Screen name="account" options={{ title: 'Аккаунт' }} />
        <Stack.Screen name="notifications" options={{ title: 'Уведомления' }} />
        <Stack.Screen name="prices" options={{ title: "Цены" }} />
        <Stack.Screen name="football" options={{ title: 'Футбольное поле' }} />
        <Stack.Screen name="tournament" options={{ title: 'Турнир' }} />
        <Stack.Screen name="book" options={{ title: 'Проверьте заявку', presentation: 'card' }} />
        <Stack.Screen name="sent" options={{ headerShown: false, gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
