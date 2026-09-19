/** Тренеры: расписание, деньги тренировки, начисление тренеру.
 *  Общие правила для приложения, админки и аналитики — считаются в одном месте. */
import { hoursOn } from '../club';
import { weekdayOf } from '../time';

export type CoachRow = {
  id: bigint; name: string; price: number; court_extra: boolean;
  pay_type: string; pay_value: number; week: unknown; is_active: boolean; in_app: boolean;
};

/** Часы работы тренера в этот день: своё расписание или часы клуба.
 *  week: {"1":[9,21], …}, день 1 — понедельник, 7 — воскресенье. */
export function coachHours(coach: { week: unknown }, set: any, date: string): { open: number; close: number } | null {
  const club = hoursOn(set, date);
  if (club.closed) return null;
  const w = coach.week as Record<string, [number, number] | null> | null;
  if (!w || typeof w !== 'object') return { open: club.open, close: club.close };
  const r = w[String(weekdayOf(date))];
  if (!Array.isArray(r)) return null;              // в этот день не работает
  const open = Math.max(club.open, Number(r[0])), close = Math.min(club.close, Number(r[1]));
  return open < close ? { open, close } : null;
}

/** Проверить и привести расписание из формы: только 1–7, часы 0–24, «с» < «до». */
export function cleanWeek(v: unknown): Record<string, [number, number]> | null {
  if (v == null) return null;
  if (typeof v !== 'object') return null;
  const out: Record<string, [number, number]> = {};
  for (const [k, r] of Object.entries(v as Record<string, unknown>)) {
    if (!/^[1-7]$/.test(k) || !Array.isArray(r)) continue;
    const a = Math.trunc(Number(r[0])), b = Math.trunc(Number(r[1]));
    if (a >= 0 && b <= 24 && a < b) out[k] = [a, b];
  }
  return out;
}

/** Части денег брони: корт и тренер. Скидка уменьшает сначала корт, потом тренера. */
export const courtPart = (b: { price: number; discount: number }) => Math.max(0, b.price - b.discount);
export const coachPart = (b: { price: number; discount: number; coach_price: number }) =>
  Math.max(0, b.coach_price - Math.max(0, b.discount - b.price));
export const bookingNet = (b: { price: number; discount: number; coach_price: number }) =>
  courtPart(b) + coachPart(b);

/** Начисление тренеру за индивидуальную тренировку. */
export function lessonPay(coach: { pay_type: string; pay_value: number },
                          lesson: { hours: number; revenue: number }): number {
  if (coach.pay_type === 'per_hour') return coach.pay_value * lesson.hours;
  if (coach.pay_type === 'per_lesson') return coach.pay_value;
  return Math.round(lesson.revenue * Math.min(100, coach.pay_value) / 100);  // percent
}
/** Начисление за групповую: процент от взносов, фикс за час или за тренировку. */
export const classPay = lessonPay;

export const PAY_WORD: Record<string, string> = {
  percent: '% от цены тренировки', per_hour: '₽ за час', per_lesson: '₽ за тренировку',
};
