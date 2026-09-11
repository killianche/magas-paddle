// Сетка на ближайший день, в который ещё можно записаться.
//
// Поздно вечером сегодняшние часы уже прошли, и главная писала бы про все
// корты «сегодня занят» — это неправда: время не занято, а закончилось.
// В таком случае показываем завтра и честно подписываем «завтра».
import { api, type ApiGrid } from './api';
import { addDays, today } from './dates';

/** Сегодня всё прошло: у каждой работающей площадки не осталось ни часа. */
export function dayIsOver(g: ApiGrid): boolean {
  const open = g.courts.filter(c => !c.closed);
  return open.length > 0 && open.every(c => c.hours.every(h => h.status === 'past'));
}

export async function upcomingGrid(): Promise<{ grid: ApiGrid; tomorrow: boolean }> {
  const g = await api.grid(today());
  if (!dayIsOver(g)) return { grid: g, tomorrow: false };
  return { grid: await api.grid(addDays(today(), 1)), tomorrow: true };
}
