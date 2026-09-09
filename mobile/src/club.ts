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
};

/** Пока сервер не ответил. Ничего выдуманного: только часы по умолчанию,
 *  которые всё равно приходят с первым же ответом. */
const EMPTY: ClubInfoData = {
  phone: null, whatsapp: null, address: null, mapUrl: null, instagram: null,
  openHour: 9, closeHour: 24, cancelHours: 4,
  prepayPercent: 50, lateMinutes: 15, rentalsText: null,
  showTournaments: true, showFootball: true,
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
