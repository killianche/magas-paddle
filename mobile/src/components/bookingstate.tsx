// Состояние записи: одно название, один значок и один цвет на всё приложение.
//
// Раньше главная и «Мои записи» считали состояние каждая по-своему: снаружи
// просроченная заявка показывалась как «ждёт подтверждения», а внутри — как
// «время освободилось». Теперь состояние считается здесь, и расходиться нечему.
import { C, DISP_MED } from '../theme';
import { IconCheck, IconClock, IconCross } from './icons';
import { rub, type ApiBooking, type ApiTournament } from '../api';
import { plural, hh, hourOfIso, dayMonth, dateOfIso } from '../dates';

export type StateKey = 'pending' | 'confirmed' | 'played' | 'missed' | 'cancelled' | 'noshow';

export type BookingState = {
  key: StateKey;
  /** Крупно на карточке: «ЖДЁТ ПОДТВЕРЖДЕНИЯ». */
  label: string;
  /** В строку на главной: «ждёт подтверждения». */
  short: string;
  note: string;
  bg: string;
  fg: string;
  dim: boolean;
  warn: boolean;
  canCancel: boolean;
};

/** Сколько минут осталось держать заявку. null — удержания нет. */
export function holdLeft(b: { status: string; holdUntil?: string | null }): number | null {
  if (b.status !== 'pending' || !b.holdUntil) return null;
  return Math.max(0, Math.round((new Date(b.holdUntil).getTime() - Date.now()) / 60000));
}

/** Заявка и подтверждённая бронь — разные вещи, и разница должна читаться
 *  сразу: у каждого состояния своё название, свой цвет и свой значок. */
export function bookingState(b: ApiBooking): BookingState {
  const left = holdLeft(b);
  const past = new Date(b.endsAt).getTime() < Date.now();

  if (b.status === 'cancelled') return {
    key: 'cancelled', label: 'ОТМЕНЕНО', short: 'отменено',
    note: 'Запись отменена, время снова свободно.',
    bg: C.dangerSoft, fg: C.dangerText, dim: true, warn: false, canCancel: false,
  };
  if (b.status === 'expired') return {
    key: 'missed', label: 'БРОНЬ НЕ СОСТОЯЛАСЬ', short: 'бронь не состоялась',
    note: 'Заявку не подтвердили вовремя, и время вернулось в расписание. Выберите другое.',
    bg: C.dangerSoft, fg: C.dangerText, dim: true, warn: false, canCancel: false,
  };
  if (b.status === 'no_show') return {
    key: 'noshow', label: 'НЕ ПРИШЛИ', short: 'не пришли',
    note: 'Клуб отметил, что вы не пришли.',
    bg: C.dangerSoft, fg: C.dangerText, dim: true, warn: false, canCancel: false,
  };
  if (past) return {
    key: 'played', label: 'СЫГРАНО', short: 'сыграно',
    note: 'Спасибо за игру. Ждём снова.',
    bg: C.surface2, fg: C.dim, dim: true, warn: false, canCancel: false,
  };
  if (b.status === 'confirmed') return {
    key: 'confirmed', label: 'ЗАБРОНИРОВАНО', short: 'забронировано',
    note: 'Менеджер подтвердил запись. Время закреплено за вами — вас ждут в клубе.',
    bg: C.lime, fg: C.onLime, dim: false, warn: false, canCancel: true,
  };
  return {
    key: 'pending', label: 'ЖДЁТ ПОДТВЕРЖДЕНИЯ', short: 'ждёт подтверждения',
    note: left == null
      ? 'Менеджер подтвердит запись и свяжется с вами.'
      : left > 0
        ? `Менеджер подтвердит запись и свяжется с вами. Место держим ещё ${left} ${plural(left, 'минуту', 'минуты', 'минут')}.`
        : 'Срок удержания вышел — место могло освободиться. Свяжитесь с менеджером.',
    bg: C.warnSoft, fg: C.amber, dim: false, warn: left === 0, canCancel: true,
  };
}

/** Заявка на турнир. Подаётся в приложении и ждёт администратора до начала
 *  турнира; ответ приходит в уведомления. Слова свои, цвета и значки — те же,
 *  что у брони корта. */
export function entryState(t: ApiTournament): BookingState {
  const e = t.entry;
  const status = e?.status ?? (t.entered ? 'confirmed' : null);
  const start = new Date(t.startsAt);
  const ends = start.getTime() + (t.hours ?? 1) * 3600_000;
  const when = `${dayMonth(dateOfIso(t.startsAt))} к ${hh(hourOfIso(t.startsAt))}`;
  const fee = t.fee > 0 ? ` Взнос ${rub(t.fee)} — в клубе.` : '';

  if (status === 'cancelled' && e?.byClub) return {
    key: 'cancelled', label: 'ЗАЯВКА ОТКЛОНЕНА', short: 'заявка отклонена',
    note: 'Клуб отклонил заявку. Если это ошибка, напишите менеджеру.',
    bg: C.dangerSoft, fg: C.dangerText, dim: true, warn: false, canCancel: false,
  };
  if (status === 'cancelled') return {
    key: 'cancelled', label: 'ЗАПИСЬ ОТМЕНЕНА', short: 'запись отменена',
    note: 'Вы отменили запись. Пока идёт регистрация, можно записаться снова.',
    bg: C.dangerSoft, fg: C.dangerText, dim: true, warn: false, canCancel: false,
  };
  if (status === 'expired') return {
    key: 'missed', label: 'НЕ ПОДТВЕРЖДЕНО', short: 'не подтверждено',
    note: 'Клуб не подтвердил заявку до начала турнира.',
    bg: C.dangerSoft, fg: C.dangerText, dim: true, warn: false, canCancel: false,
  };
  if (ends < Date.now()) return {
    key: 'played', label: 'ТУРНИР ПРОШЁЛ', short: 'турнир прошёл',
    note: 'Спасибо за игру. Ждём на следующем турнире.',
    bg: C.surface2, fg: C.dim, dim: true, warn: false, canCancel: false,
  };
  if (status === 'confirmed') return {
    key: 'confirmed', label: 'ВЫ ЗАПИСАНЫ', short: 'вы записаны',
    note: `Администратор подтвердил участие. Приходите ${when}.${fee}`,
    bg: C.lime, fg: C.onLime, dim: false, warn: false, canCancel: true,
  };
  return {
    key: 'pending', label: 'ЖДЁТ ПОДТВЕРЖДЕНИЯ', short: 'ждёт подтверждения',
    note: 'Администратор проверит заявку. Когда подтвердит, придёт уведомление, '
      + 'а здесь появится «Вы записаны».',
    bg: C.warnSoft, fg: C.amber, dim: false, warn: false, canCancel: true,
  };
}

/** Запись, которая ещё впереди: её и показываем на главной. */
export const isUpcoming = (b: ApiBooking) => {
  const k = bookingState(b).key;
  return k === 'pending' || k === 'confirmed';
};

/** Значок состояния: часы — ждём, галочка — подтверждено, крестик — не вышло. */
export function StateIcon({ state, size = 14 }: { state: BookingState; size?: number }) {
  if (state.key === 'pending') return <IconClock size={size} color={state.fg} />;
  if (state.key === 'confirmed' || state.key === 'played')
    return <IconCheck size={size} color={state.fg} />;
  return <IconCross size={size} color={state.fg} />;
}

export const STATE_FONT = DISP_MED;
