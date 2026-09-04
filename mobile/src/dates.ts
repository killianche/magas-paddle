// Даты в виде, привычном человеку. Клуб живёт по московскому времени.
const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                'июля','августа','сентября','октября','ноября','декабря'];
const WEEK = ['воскресенье','понедельник','вторник','среда','четверг','пятница','суббота'];
const WEEK_SHORT = ['Вс','Пн','Вт','Ср','Чт','Пт','Сб'];

export const TZ_OFFSET = 3;

/** Сегодняшняя дата по времени клуба в виде ГГГГ-ММ-ДД. */
export function today(): string {
  return new Date(Date.now() + TZ_OFFSET * 3600_000).toISOString().slice(0, 10);
}

/** Текущий час по времени клуба. */
export function nowHour(): number {
  return new Date(Date.now() + TZ_OFFSET * 3600_000).getUTCHours();
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function parts(date: string) {
  const d = new Date(date + 'T00:00:00Z');
  return { day: d.getUTCDate(), month: d.getUTCMonth(), dow: d.getUTCDay() };
}

/** «2 сентября» */
export const dayMonth = (date: string) => {
  const p = parts(date); return `${p.day} ${MONTHS[p.month]}`;
};

/** «вторник» */
export const weekday = (date: string) => WEEK[parts(date).dow];

/** «Вт» — для ленты дней */
export const weekdayShort = (date: string) =>
  date === today() ? 'Сегодня' : WEEK_SHORT[parts(date).dow];

/** Число месяца для ленты дней */
export const dayNumber = (date: string) => String(parts(date).day);

/** «Сегодня, 2 сентября» */
export const longDate = (date: string) =>
  date === today() ? `Сегодня, ${dayMonth(date)}` : `${weekdayShort(date)}, ${dayMonth(date)}`;

export const hh = (h: number) => String(h).padStart(2, '0') + ':00';

/** Русские окончания: 1 час, 2 часа, 5 часов. */
export function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

/** Из отметки времени сервера — час по времени клуба. */
export function hourOfIso(iso: string): number {
  return new Date(new Date(iso).getTime() + TZ_OFFSET * 3600_000).getUTCHours();
}

/** Из отметки времени сервера — дата ГГГГ-ММ-ДД по времени клуба. */
export function dateOfIso(iso: string): string {
  return new Date(new Date(iso).getTime() + TZ_OFFSET * 3600_000).toISOString().slice(0, 10);
}
