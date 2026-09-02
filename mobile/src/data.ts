// ЗАГЛУШКИ. Реальные данные клуба ещё не получены — см. docs/OPEN-QUESTIONS.md.
// Заменяются на данные с бэкенда без изменения экранов.

export type Status = 'free' | 'soon' | 'busy' | 'past';
export type Court = { id: string; name: string; price: number; off?: boolean;
  football?: boolean };   // мини-футбольное поле — не замена падел-корту
export type Slot = { hour: number; status: Status };

export const CLUB = {
  name: 'Padel Magas',
  city: 'Магас',
  phone: '+7 928 000-00-00',
  whatsapp: '79280000000',
  openHour: 9,   // ВОПРОС К ЗАКАЗЧИКУ: реальные часы работы
  closeHour: 24,
  cancelHours: 4,
  lateMinutes: 15,
};

export const COURTS: Court[] = [
  { id: 'c1', name: 'Корт 1', price: 4500 },
  { id: 'c2', name: 'Корт 2', price: 4500 },
  { id: 'c3', name: 'Корт 3', price: 4500 },
  { id: 'c4', name: 'Корт 4', price: 4500 },
  { id: 'c5', name: 'Корт 5', price: 4500 },
  { id: 'c6', name: 'Корт 6', price: 4500, off: true },
  { id: 'f1', name: 'Мини-футбол', price: 5000, football: true },
];

export const VISIBLE_COURTS = COURTS.filter(c => !c.off);

// Занятость на сегодня: id корта -> занятые часы
const BUSY: Record<string, number[]> = {
  c1: [9, 10, 13, 14, 15, 16, 17, 20],
  c2: [12, 13, 18, 19, 20],
  c3: [13, 14, 19, 20, 21],
  c4: [15, 16, 17, 21, 22, 23],
  c5: [16, 17, 22],
  f1: [12, 13, 17, 19, 20],
};

export function slotsFor(courtId: string, fromHour: number): Slot[] {
  const busy = BUSY[courtId] ?? [];
  const out: Slot[] = [];
  for (let h = CLUB.openHour; h < CLUB.closeHour; h++) {
    out.push({ hour: h, status: h < fromHour ? 'past' : busy.includes(h) ? 'busy' : 'free' });
  }
  return out;
}

export function nextFree(courtId: string, fromHour: number): number | null {
  const s = slotsFor(courtId, fromHour).find(x => x.status === 'free');
  return s ? s.hour : null;
}

export function priceAt(court: Court, hour: number): number {
  // ЗАГЛУШКА: вечерний тариф после 18:00. Реальные тарифы — вопрос к заказчику.
  return hour >= 18 ? court.price : Math.round(court.price / 1.5);
}


// Сколько часов подряд свободно, начиная с указанного часа.
// Нужно, чтобы не дать выбрать 2 часа, когда свободен только первый.
export function maxRun(courtId: string, fromHour: number): number {
  const slots = slotsFor(courtId, fromHour);
  let run = 0;
  for (let h = fromHour; h < CLUB.closeHour; h++) {
    const s = slots.find(x => x.hour === h);
    if (!s || s.status !== 'free') break;
    run++;
  }
  return run;
}

// Цена за отрезок: складываем по часам, потому что тариф зависит от времени суток.
export function priceRange(court: Court, fromHour: number, hours: number): number {
  let sum = 0;
  for (let h = fromHour; h < fromHour + hours; h++) sum += priceAt(court, h);
  return sum;
}

export function courtById(id: string): Court | undefined {
  return COURTS.find(c => c.id === id);
}


// Какие площадки свободны в конкретный час — основа концепции «Час».
export function freeCourtsAt(hour: number, fromHour: number): Court[] {
  return VISIBLE_COURTS.filter(c => {
    const sl = slotsFor(c.id, fromHour).find(x => x.hour === hour);
    return sl?.status === 'free';
  });
}

// Часы дня со счётчиком свободных площадок. Для ленты часов.
export type HourCell = { hour: number; free: number; past: boolean };
export function dayHours(fromHour: number): HourCell[] {
  const out: HourCell[] = [];
  for (let h = CLUB.openHour; h < CLUB.closeHour; h++) {
    out.push({ hour: h, free: freeCourtsAt(h, fromHour).length, past: h < fromHour });
  }
  return out;
}

// Первый час, где вообще что-то свободно
export function firstFreeHour(fromHour: number): number | null {
  const h = dayHours(fromHour).find(x => !x.past && x.free > 0);
  return h ? h.hour : null;
}

// Турниры. Заказчику нужен минимум: человек записывается, видит что записан и когда играть.
// Дальше всё происходит вживую. Когда турнир прошёл — менеджер меняет обложку и пишет итог.
export type TState = 'open' | 'soon' | 'done';
export type Tournament = {
  id: string; name: string; date: string; weekday: string; time: string;
  format: string; fee: number; taken: number; total: number;
  state: TState;
  cover: string;              // ключ обложки; менеджер меняет её из админки
  result?: string;            // заполняется после турнира
};

export const TOURNAMENTS: Tournament[] = [
  { id: 't1', name: 'Осенний кубок Магаса', date: '14 сентября', weekday: 'воскресенье',
    time: '10:00', format: 'Americano', fee: 2500, taken: 14, total: 20,
    state: 'open', cover: 't1' },
  { id: 't2', name: 'Ночной Mexicano', date: '21 сентября', weekday: 'воскресенье',
    time: '21:00', format: 'Mexicano', fee: 2000, taken: 6, total: 16,
    state: 'open', cover: 't2' },
  { id: 't3', name: 'Парный турнир Padel Magas', date: '5 октября', weekday: 'воскресенье',
    time: '11:00', format: 'Группы и плей-офф', fee: 3000, taken: 0, total: 24,
    state: 'soon', cover: 't3' },
  { id: 't0', name: 'Летний кубок Магаса', date: '24 августа', weekday: 'воскресенье',
    time: '10:00', format: 'Americano', fee: 2500, taken: 20, total: 20,
    state: 'done', cover: 't4',
    // ЗАГЛУШКА: текст и обложку итогов менеджер задаёт из админки
    result: 'Победили Ахмед Барханоев и Тимур Евлоев. Второе место — Магомед Аушев и Ислам Костоев.' },
];

export function tournamentById(id: string): Tournament | undefined {
  return TOURNAMENTS.find(t => t.id === id);
}

// ЗАГЛУШКА для показа сценария «время увели». На бэкенде это ответ 409 от API:
// бронь создаётся ограничением в PostgreSQL, кто успел — того и слот.
// В прототипе «уводится» ровно один слот: Корт 5 в 21:00.
export const TAKEN_TRAP = { courtId: 'c5', hour: 21 };
export function slotWasTaken(courtId: string, hour: number) {
  return courtId === TAKEN_TRAP.courtId && hour === TAKEN_TRAP.hour;
}

/** Другие площадки, свободные в тот же час на нужную длительность. */
export function alternativesAt(hour: number, hours: number, exceptId: string): Court[] {
  const from = courtById(exceptId);
  return VISIBLE_COURTS.filter(c =>
    c.id !== exceptId
    && !!c.football === !!from?.football      // падел меняем на падел, поле на поле
    && !slotWasTaken(c.id, hour)
    && maxRun(c.id, hour) >= hours);
}

/** Ближайшее время на той же площадке, куда помещается нужная длительность. */
export function nextFitting(courtId: string, afterHour: number, hours: number): number | null {
  for (let h = afterHour + 1; h < CLUB.closeHour; h++) {
    if (!slotWasTaken(courtId, h) && maxRun(courtId, h) >= hours) return h;
  }
  return null;
}

export const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';
export const hh = (h: number) => String(h).padStart(2, '0') + ':00';
