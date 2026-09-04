/** Клуб живёт по московскому времени: Магас — UTC+3, перевода часов нет. */
export const TZ_OFFSET = 3;

/** Начало часа конкретного дня в часовом поясе клуба. */
export function clubHour(date: string, hour: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - TZ_OFFSET, 0, 0));
}

/** Час дня по времени клуба из отметки времени. */
export function hourOf(dt: Date): number {
  return (dt.getUTCHours() + TZ_OFFSET) % 24;
}

/** Сегодняшняя дата по времени клуба в виде ГГГГ-ММ-ДД. */
export function clubToday(): string {
  const now = new Date(Date.now() + TZ_OFFSET * 3600_000);
  return now.toISOString().slice(0, 10);
}

/** Проверка формата даты: только ГГГГ-ММ-ДД и только настоящая дата. */
export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
