// Связь с сервером. Один слой на всё приложение: экраны не знают про сеть,
// они просят данные и получают либо результат, либо понятную ошибку.
import Constants from 'expo-constants';

const BASE = (Constants.expoConfig?.extra as any)?.apiUrl
  ?? 'https://padel.217-114-8-196.sslip.io/api';

/** Ошибка, которую не стыдно показать человеку. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Машинный код: по нему экран решает, что делать. Например slot_taken. */
    readonly code?: string,
    readonly payload?: any,
  ) { super(message) }
}

const NO_NETWORK = 'Нет связи с клубом. Проверьте интернет и попробуйте ещё раз.';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    clearTimeout(timer);
  } catch {
    throw new ApiError(NO_NETWORK, 0);
  }

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    // NestJS кладёт наш объект в message при выбросе ConflictException
    const inner = body?.message && typeof body.message === 'object' ? body.message : body;
    throw new ApiError(
      inner?.message ?? messageFor(res.status),
      res.status, inner?.code, inner,
    );
  }
  return body as T;
}

function safeJson(t: string) { try { return JSON.parse(t) } catch { return null } }

function messageFor(status: number) {
  if (status >= 500) return 'Сервер клуба не отвечает. Попробуйте позже.';
  if (status === 404) return 'Не найдено.';
  return 'Не получилось. Попробуйте ещё раз.';
}

/* ── Что отдаёт сервер ─────────────────────────────────────────────────── */

export type SlotStatus = 'free' | 'busy' | 'past' | 'closed';

export type ApiCourt = {
  id: string; name: string; isFootball: boolean;
  priceMorning: number; priceStandard: number; morningUntil: number;
  closedUntil: string | null; closedReason: string | null;
};

export type ApiHour = { hour: number; status: SlotStatus; price: number; maxRun: number };

export type ApiGrid = {
  date: string; openHour: number; closeHour: number; morningUntil: number;
  courts: { courtId: string; name: string; isFootball: boolean; closed: boolean; hours: ApiHour[] }[];
};

export type ApiBooking = {
  id: number; courtId: string; courtName: string;
  startsAt: string; endsAt: string; hour: number; hours: number;
  price: number; status: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'done';
};

export type ApiTournament = {
  id: number; name: string; startsAt: string; format: string;
  fee: number; seats: number; taken: number;
  state: 'soon' | 'open' | 'done';
  coverUrl: string | null; result: string | null; entered: boolean;
};

export type Alternatives = {
  sameTime: { courtId: string; courtName: string; hour: number; hours: number }[];
  later: { courtId: string; courtName: string; hour: number; hours: number } | null;
};

/* ── Запросы ───────────────────────────────────────────────────────────── */

export const api = {
  courts: () => call<ApiCourt[]>('/courts'),

  grid: (date: string) => call<ApiGrid>(`/availability?date=${encodeURIComponent(date)}`),

  myBookings: (phone: string) =>
    call<ApiBooking[]>(`/bookings?phone=${encodeURIComponent(phone)}`),

  book: (b: { courtId: string; date: string; hour: number; hours: number;
              name: string; phone: string; comment?: string }) =>
    call<ApiBooking>('/bookings', { method: 'POST', body: JSON.stringify(b) }),

  cancel: (id: number, phone: string) =>
    call<{ id: number }>(`/bookings/${id}?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' }),

  tournaments: (phone?: string) =>
    call<ApiTournament[]>(`/tournaments${phone ? `?phone=${encodeURIComponent(phone)}` : ''}`),

  enterTournament: (id: number, name: string, phone: string) =>
    call<{ entered: boolean; left: number }>(`/tournaments/${id}/entries`,
      { method: 'POST', body: JSON.stringify({ name, phone }) }),

  leaveTournament: (id: number, phone: string) =>
    call<{ entered: boolean }>(`/tournaments/${id}/entries?phone=${encodeURIComponent(phone)}`,
      { method: 'DELETE' }),
};

/** Цены с сервера приходят в копейках. */
export const rub = (kopecks: number) =>
  (kopecks / 100).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';

/** На сколько процентов льготная цена ниже основной. Считаем в целых числах:
    выражение (1 - low/full) * 100 для 2000 и 2500 даёт 19.999… и «−19%».
    Округляем вниз — никогда не обещаем скидку больше настоящей. */
export const discountPercent = (low: number, full: number) =>
  full > 0 && low < full ? Math.floor(((full - low) * 100) / full) : 0;
