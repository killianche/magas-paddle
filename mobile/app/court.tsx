// Экран корта: фотография, описание и время именно этого корта.
// Сюда ведут карточки кортов — на главной и на экране «Выбери корт».
import { useLocalSearchParams } from 'expo-router';
import { CourtPage } from '../src/components/courtpage';

import { useTheme } from '../src/theme';
export default function CourtScreen() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CourtPage courtId={String(id)} />;
}
