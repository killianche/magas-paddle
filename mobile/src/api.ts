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

/** Полный адрес файла с сайта клуба: сервер отдаёт пути вида /uploads/…,
 *  а картинке в приложении нужен адрес целиком. */
export const mediaUrl = (path: string) => BASE.replace(/\/api\/?$/, '') + path;

/** Токен входа. Держим в памяти, чтобы не читать хранилище на каждый запрос;
 *  на устройство его кладёт profile.ts. */
let token: string | null = null;
export const setToken = (t: string | null) => { token = t };
export const getToken = () => token;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
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

/** Цвет покрытия, выбранный клубом в админке: «Синий» и оттенок для метки. */
export type CourtColor = { key: string; name: string; hex: string };

export type ApiCourt = {
  id: string; name: string; isFootball: boolean; description: string | null;
  /** Цвет покрытия и особенности («Ультраширокий»). Пусто — клуб не указал. */
  color?: CourtColor | null; tags?: string[];
  priceMorning: number; priceStandard: number; morningUntil: number;
  closedUntil: string | null; closedReason: string | null;
  /** Снимки, загруженные клубом: пути вида /uploads/… Пусто — временные фото. */
  photos?: string[];
};

export type ApiPriceRule = {
  id: number; courtId: string | null; days: number[] | null;
  fromHour: number; toHour: number; price: number; note: string | null;
};

/** Всё о ценах: обычные тарифы и особые цены на дни и часы. */
export type ApiPrices = {
  openHour: number; closeHour: number; morningUntil: number; cancelHours: number;
  courts: { id: string; name: string; isFootball: boolean;
            priceMorning: number; priceStandard: number }[];
  rules: ApiPriceRule[];
};

export type ApiHour = { hour: number; status: SlotStatus; price: number; maxRun: number };

export type ApiGrid = {
  date: string; openHour: number; closeHour: number; morningUntil: number; maxHours: number;
  courts: { courtId: string; name: string; isFootball: boolean; closed: boolean;
    /** Главное фото корта, загруженное клубом; null — временное. */
    photo?: string | null; color?: CourtColor | null; tags?: string[];
    hours: ApiHour[] }[];
};

export type ApiNote = {
  id: number; kind: string; title: string; body: string;
  createdAt: string; forEveryone: boolean; read: boolean;
};

export type ClientCard = {
  name: string; surname: string | null; phone: string;
  whatsapp: string | null; hasPassword: boolean;
};

export type Session = { token: string; profile: ClientCard };

export type ApiBooking = {
  id: number; courtId: string; courtName: string;
  startsAt: string; endsAt: string; hour: number; hours: number;
  price: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'done' | 'expired';
  /** До какого времени клуб держит неподтверждённую заявку. */
  holdUntil?: string | null;
  /** Номер аккаунта клиента — приходит в ответ на создание брони. */
  clientId?: number;
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
  prices: () => call<ApiPrices>('/prices'),

  grid: (date: string) => call<ApiGrid>(`/availability?date=${encodeURIComponent(date)}`),

  /** Ящик уведомлений человека. */
  notifications: (phone: string) =>
    call<{ items: ApiNote[]; unread: number }>(
      `/notifications?phone=${encodeURIComponent(phone)}`),

  readNotifications: (phone: string) =>
    call<{ ok: boolean }>(`/notifications/read?phone=${encodeURIComponent(phone)}`,
      { method: 'POST' }),

  /** Контакты и режим клуба. Меняются менеджером из админки. */
  club: () => call<{
    openHour: number; closeHour: number; cancelHours: number; holdMinutes: number;
    phone: string | null; whatsapp: string | null; address: string | null;
    mapUrl: string | null; instagram: string | null;
    prepayPercent: number; lateMinutes: number; rentalsText: string | null;
    showTournaments: boolean; showFootball: boolean; waTemplate: string | null;
    bookingNote?: string | null; heroUrl?: string | null;
  }>('/club'),

  /** Знает ли клуб этот номер и стоит ли на нём пароль. */
  checkPhone: (phone: string) =>
    call<{ known: boolean; hasPassword: boolean; profile: ClientCard | null }>(
      `/clients/check?phone=${encodeURIComponent(phone)}`),

  register: (c: { name: string; surname?: string; phone: string;
                  whatsapp?: string; password: string }) =>
    call<Session>('/clients/register', { method: 'POST', body: JSON.stringify(c) }),

  login: (phone: string, password: string) =>
    call<Session>('/clients/login', { method: 'POST',
      body: JSON.stringify({ phone, password }) }),

  logout: () => call<{ ok: boolean }>('/clients/logout', { method: 'POST' }),

  me: () => call<ClientCard>('/clients/me'),

  updateMe: (c: { name?: string; surname?: string; whatsapp?: string;
                  password?: string; oldPassword?: string }) =>
    call<{ token?: string; profile: ClientCard }>('/clients/me', {
      method: 'POST', body: JSON.stringify(c) }),

  myBookings: (phone: string) =>
    call<ApiBooking[]>(`/bookings?phone=${encodeURIComponent(phone)}`),

  book: (b: { courtId: string; date: string; hour: number; hours: number;
              name: string; surname?: string; phone: string; whatsapp?: string;
              comment?: string }) =>
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
