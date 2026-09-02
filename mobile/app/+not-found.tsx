import { Stack } from 'expo-router';
import { NotFound } from '../src/components/state';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Страница не найдена' }} />
      <NotFound
        title="Такой страницы нет"
        note="Ссылка устарела или в ней ошибка. Расписание и запись — на главной."
      />
    </>
  );
}
