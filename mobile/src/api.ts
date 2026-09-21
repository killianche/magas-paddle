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

/** Кого позвать, когда сервер сказал «войдите»: profile.ts стирает
 *  просроченный вход, чтобы приложение не считало себя вошедшим. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn };

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const ctrl = new AbortController();
    // 25 секунд, а не 15: в сетях Магаса ответы иногда идут долго,
    // и на 15 секундах экран зря показывал «нет связи с клубом»
    const timer = setTimeout(() => ctrl.abort(), 25000);
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
    // Вход просрочен или закрыт — забываем его, иначе приложение считает
    // себя вошедшим и показывает карточку аккаунта вместо формы входа
    if (res.status === 401 && !path.startsWith('/clients/login')
        && !path.startsWith('/clients/register')) {
      onUnauthorized?.();
    }
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
  /** Клуб в этот день не работает (часы по дням задаются в админке). */
  dayOff?: boolean;
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
  /** ID аккаунта — его человек сообщает клубу вместо телефона. */
  id?: number;
  name: string; surname: string | null; phone: string;
  whatsapp: string | null; hasPassword: boolean;
};

export type Session = { token: string; profile: ClientCard };

export type ApiBooking = {
  id: number; courtId: string; courtName: string;
  /** Бронь отменил клуб, а не сам человек. */
  cancelledByClub?: boolean;
  startsAt: string; endsAt: string; hour: number; hours: number;
  price: number;
  /** Скидка клуба и что уже внесено — чтобы «к оплате» совпадало с админкой. */
  discount?: number; paid?: number;
  /** Отмена или неявка: внесённое осталось клубу (true) или ждёт возврата. */
  keptPrepay?: boolean;
  /** Сколько клуб вернул по этой брони. */
  refunded?: number;
  /** Строки счёта к брони: прокат ракетки, мячи. */
  extras?: { item: string; qty: number; amount: number }[];
  /** Тренировка: имя тренера и его часть цены. */
  coachName?: string | null; coachPrice?: number;
  status: 'pending' | 'confirmed' | 'cancelled' | 'no_show' | 'done' | 'expired';
  /** До какого времени клуб держит неподтверждённую заявку. */
  holdUntil?: string | null;
  /** Номер аккаунта клиента — приходит в ответ на создание брони. */
  clientId?: number;
};

export type ApiTournament = {
  id: number; name: string; startsAt: string; format: string;
  fee: number; seats: number; taken: number;
  state: 'soon' | 'open' | 'closed' | 'done' | 'cancelled';
  coverUrl: string | null; result: string | null; entered: boolean;
  /** Сколько часов идёт турнир. */
  hours?: number;
  /** Итоги: призовые места, фото с турнира. bannerOn — клуб включил баннер
   *  с итогами на главной. */
  results?: ApiPlace[]; photos?: string[]; bannerOn?: boolean;
  /** Своя заявка на турнир: ждёт подтверждения, подтверждена, отменена или
   *  клуб не подтвердил её до начала. null — не подавал. */
  entry?: { id: number; status: 'pending' | 'confirmed' | 'cancelled' | 'expired';
    holdUntil: string | null;
    /** Отменил клуб, а не сам человек — «заявка отклонена». */
    byClub?: boolean } | null;
  /** 'class' — групповая тренировка с тренером, а не турнир. */
  kind?: 'tournament' | 'class'; level?: string | null;
  coach?: { id: number; name: string; photoUrl: string | null } | null;
};

/** Тренер клуба — для экрана «Тренировки». Цены в копейках. */
export type ApiCoach = {
  id: number; name: string; photoUrl: string | null; bio: string | null;
  /** Цена индивидуальной тренировки за час. */
  price: number;
  /** Корт оплачивается отдельно по тарифу (true) или входит в цену. */
  courtExtra: boolean; color: string | null;
  /** Сколько у тренера открытых групповых тренировок. */
  classes: number;
};
/** Тренер, свободный в выбранное время: показываем при записи на корт. */
export type ApiFreeCoach = {
  id: number; name: string; surname: string | null; experience: string | null;
  photoUrl: string | null; bio: string | null; color: string | null;
  /** Цена тренера за час и за всю бронь, в копейках. */
  price: number; total: number;
  /** false — корт входит в цену тренировки, отдельно за него не берут. */
  courtExtra: boolean;
};

/** Свободный час у тренера: есть корт, тренер свободен. */
export type ApiSlot = { hour: number; courtId: string; price: number; coachPrice: number; courtPrice: number };

export type ApiPlace = { place: number; names: string; prize?: string };

/** Ответ на заявку на турнир. */
export type ApiEntry = {
  id: number; tournamentId: number; tournamentName: string; startsAt: string;
  fee: number; status: string; holdUntil: string | null;
  clientId: number;
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
    showTournaments: boolean; showFootball: boolean; coachesOn?: boolean; waTemplate: string | null;
    bookingNote?: string | null; heroUrl?: string | null; heroLightUrl?: string | null;
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

  /** Удалить свой аккаунт: требование Apple к приложениям с регистрацией. */
  deleteMe: (password?: string) =>
    call<{ ok: boolean }>('/clients/me/delete', { method: 'POST',
      body: JSON.stringify({ password }) }),

  updateMe: (c: { name?: string; surname?: string; whatsapp?: string;
                  password?: string; oldPassword?: string }) =>
    call<{ token?: string; profile: ClientCard }>('/clients/me', {
      method: 'POST', body: JSON.stringify(c) }),

  myBookings: (phone: string) =>
    call<ApiBooking[]>(`/bookings?phone=${encodeURIComponent(phone)}`),

  book: (b: { courtId: string; date: string; hour: number; hours: number;
              name: string; surname?: string; phone: string; whatsapp?: string;
              comment?: string; coachId?: number }) =>
    call<ApiBooking>('/bookings', { method: 'POST', body: JSON.stringify(b) }),

  cancel: (id: number, phone: string) =>
    call<{ id: number }>(`/bookings/${id}?phone=${encodeURIComponent(phone)}`, { method: 'DELETE' }),

  /** Турниры; kind='class' — групповые тренировки. */
  tournaments: (phone?: string, kind?: 'tournament' | 'class') => {
    const q = [phone ? `phone=${encodeURIComponent(phone)}` : '', kind === 'class' ? 'kind=class' : ''].filter(Boolean).join('&');
    return call<ApiTournament[]>(`/tournaments${q ? '?' + q : ''}`);
  },

  /** Кто из тренеров свободен в выбранные день и часы. */
  freeCoaches: (date: string, hour: number, hours: number, courtId: string) =>
    call<{ coaches: ApiFreeCoach[] }>(
      `/coaches/free?date=${date}&hour=${hour}&hours=${hours}&courtId=${encodeURIComponent(courtId)}`),
  enterTournament: (id: number, who: { name: string; surname?: string; phone: string }) =>
    call<ApiEntry>(`/tournaments/${id}/entries`,
      { method: 'POST', body: JSON.stringify(who) }),

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
