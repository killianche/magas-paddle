// Запись на футбольное поле — той же страницей, что и корт: фотографии,
// описание, длительность, время, панель с кнопкой «Забронировать в WhatsApp».
// Любая правка страницы корта сразу доходит и сюда.
import { CourtPage } from '../src/components/courtpage';

import { useTheme } from '../src/theme';
export default function Football() {
  useTheme();
  return <CourtPage football />;
}
