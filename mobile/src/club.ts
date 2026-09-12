// Контакты клуба.
//
// Номера, адрес и ссылки менеджер задаёт в админке — на них держится
// подтверждение брони, и ради смены номера не должно требоваться новой сборки
// приложения. Здесь только то, что от сервера не зависит, и хранение
// присланного: последний ответ сохраняется на устройстве, чтобы экран контактов
// открывался сразу, а не мигал пустотой.
//
// Чего клуб ещё не заполнил — остаётся null. Экраны показывают такие пункты
// незаполненными и ничего не выдумывают: правило «не додумывать» в CLAUDE.md.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { api } from './api';

const KEY = 'magas.club.v1';

export type ClubInfoData = {
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  mapUrl: string | null;
  instagram: string | null;
  openHour: number;
  closeHour: number;
  /** Часы по дням недели, с понедельника. Старый сервер не присылает. */
  week?: DayHours[] | null;
  cancelHours: number;
  /** Доля предоплаты, проценты: после неё бронь подтверждают. */
  prepayPercent: number;
  /** Сколько минут держат корт за опоздавшим. */
  lateMinutes: number;
  /** Прокат и раздевалка — свободный текст клуба. */
  rentalsText: string | null;
  /** Разделы, которые клуб может выключить. */
  showTournaments: boolean;
  showFootball: boolean;
  /** Текст сообщения в WhatsApp при записи; null — текст по умолчанию. */
  waTemplate: string | null;
  /** Что входит в бронь; null — текст по умолчанию (BOOKING_NOTE). */
  bookingNote: string | null;
  /** Фото первого экрана, загруженное клубом; null — встроенное. */
  heroUrl: string | null;
  /** Своё фото для светлой темы; null — встроенное светлое. */
  heroLightUrl: string | null;
};

/** Часы одного дня недели. closed — клуб не работает. */
export type DayHours = { open: number; close: number; closed: boolean };

const SHORT_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const two = (h: number) => String(h).padStart(2, '0') + ':00';

/** Неделя с понедельника; без данных — все дни по общим часам. */
export function weekOf(c: ClubInfoData): DayHours[] {
  if (Array.isArray(c.week) && c.week.length === 7) return c.week;
  return SHORT_DAYS.map(() => ({ open: c.openHour, close: c.closeHour, closed: false }));
}

/** Все дни работают одинаково. */
export function sameEveryDay(c: ClubInfoData): boolean {
  const w = weekOf(c);
  return w.every(d => !d.closed && d.open === w[0].open && d.close === w[0].close);
}

/** Часы на дату ГГГГ-ММ-ДД. */
export function hoursOnDate(c: ClubInfoData, date: string): DayHours {
  const d = new Date(date + 'T00:00:00Z').getUTCDay();
  return weekOf(c)[d === 0 ? 6 : d - 1];
}

/** Одинаковые соседние дни — одной строкой: «Пн–Пт · 09:00 – 24:00». */
export function weekLines(c: ClubInfoData): { days: string; hours: string }[] {
  const w = weekOf(c);
  const key = (d: DayHours) => d.closed ? 'off' : `${d.open}-${d.close}`;
  const out: { days: string; hours: string }[] = [];
  for (let i = 0; i < 7;) {
    let j = i;
    while (j + 1 < 7 && key(w[j + 1]) === key(w[i])) j++;
    const days = i === j ? SHORT_DAYS[i]
      : j === i + 1 ? `${SHORT_DAYS[i]}, ${SHORT_DAYS[j]}` : `${SHORT_DAYS[i]}–${SHORT_DAYS[j]}`;
    out.push({ days, hours: w[i].closed ? 'не работаем' : `${two(w[i].open)} – ${two(w[i].close)}` });
    i = j + 1;
  }
  return out;
}

/** Слова заказчика: в бронь входит только корт, ракетки и мячи — отдельно.
 *  Менеджер может переписать строку в админке. */
export const BOOKING_NOTE = 'Входит только корт. Ракетки и мячи — отдельно.';

/** Пока сервер не ответил. Ничего выдуманного: только часы по умолчанию,
 *  которые всё равно приходят с первым же ответом. */
const EMPTY: ClubInfoData = {
  phone: null, whatsapp: null, address: null, mapUrl: null, instagram: null,
  openHour: 9, closeHour: 24, cancelHours: 4,
  prepayPercent: 50, lateMinutes: 15, rentalsText: null,
  showTournaments: true, showFootball: true, waTemplate: null, bookingNote: null, heroUrl: null, heroLightUrl: null,
};

let cache: ClubInfoData = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

/** Неизменное: имя, город, точка на карте и документ о данных.
 *  Точку прислал заказчик, она в коде намеренно — карта не должна зависеть
 *  от того, заполнил ли менеджер поле. */
export const CLUB_STATIC = {
  name: 'Magas Padel',
  city: 'Магас',
  region: 'Республика Ингушетия',
  point: { lat: 43.184968, lon: 44.816118 },
  privacyUrl: 'https://padel.217-114-8-196.sslip.io/privacy.html',
} as const;

/** Контакты одним объектом: постоянное плюс присланное клубом. */
export const CLUB = {
  ...CLUB_STATIC,
  get phone() { return cache.phone },
  get whatsapp() { return cache.whatsapp },
  get address() { return cache.address },
  get mapUrl() { return cache.mapUrl },
  get instagram() { return cache.instagram },
  get openHour() { return cache.openHour },
  get closeHour() { return cache.closeHour },
  get cancelHours() { return cache.cancelHours },
  get prepayPercent() { return cache.prepayPercent },
  get lateMinutes() { return cache.lateMinutes },
  get rentalsText() { return cache.rentalsText },
  get showTournaments() { return cache.showTournaments },
  get showFootball() { return cache.showFootball },
  get waTemplate() { return cache.waTemplate },
};

function publish(next: ClubInfoData) {
  cache = next;
  listeners.forEach(l => l());
}

/** Читаем сохранённое и идём за свежим. Зовётся один раз при запуске. */
export async function loadClub(): Promise<void> {
  if (!loaded) {
    loaded = true;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) publish({ ...EMPTY, ...JSON.parse(raw) });
    } catch {}
  }
  try {
    const fresh = await api.club();
    publish({ ...EMPTY, ...fresh });
    AsyncStorage.setItem(KEY, JSON.stringify(fresh)).catch(() => {});
  } catch {}
}

/** Перерисовать экран, когда контакты приедут. */
export function useClub(): ClubInfoData {
  const [, tick] = useState(0);
  useEffect(() => {
    const l = () => tick(n => n + 1);
    listeners.add(l);
    loadClub();
    return () => { listeners.delete(l) };
  }, []);
  return cache;
}

/** Ссылка на WhatsApp по номеру. null, пока номер не задан в админке. */
export function whatsappUrl(): string | null {
  return cache.whatsapp ? `https://wa.me/${cache.whatsapp.replace(/\D/g, '')}` : null;
}

/** Координаты человеку — на случай, если карты не открылись. */
export const pointText =
  `${CLUB_STATIC.point.lat.toFixed(5)}, ${CLUB_STATIC.point.lon.toFixed(5)}`;
