// Экран корта: фотография, описание и время именно этого корта.
// Сюда ведут карточки кортов — на главной и на экране «Выбери корт».
import { useLocalSearchParams } from 'expo-router';
import { CourtPage } from '../src/components/courtpage';

export default function CourtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CourtPage courtId={String(id)} />;
}
