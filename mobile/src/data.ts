// ЗАГЛУШКИ. Реальные данные клуба ещё не получены — см. docs/OPEN-QUESTIONS.md.
// Заменяются на данные с бэкенда без изменения экранов.

export type Status = 'free' | 'soon' | 'busy' | 'past';
export type Court = { id: string; name: string; price: number; off?: boolean };
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
  { id: 'f1', name: 'Мини-футбол', price: 5000 },
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

export const TOURNAMENTS = [
  { id: 't1', name: 'Осенний кубок Магаса', date: '14 сентября', format: 'Americano',
    fee: 2500, taken: 14, total: 20, state: 'open' as const },
  { id: 't2', name: 'Ночной Mexicano', date: '21 сентября', format: 'Mexicano',
    fee: 2000, taken: 6, total: 16, state: 'open' as const },
  { id: 't3', name: 'Парный турнир Padel Magas', date: '5 октября', format: 'Группы и плей-офф',
    fee: 3000, taken: 0, total: 24, state: 'soon' as const },
];

export const fmt = (n: number) => n.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';
export const hh = (h: number) => String(h).padStart(2, '0') + ':00';
