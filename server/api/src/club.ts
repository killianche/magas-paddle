/** Настройки клуба.
 *
 *  Раньше это были константы прямо в коде, и поменять часы работы или границу
 *  утреннего тарифа мог только программист. Теперь они лежат в базе, менеджер
 *  правит их из админки, а здесь — только чтение с коротким кэшем: настройки
 *  спрашивают на каждый запрос расписания, ходить за ними в базу каждый раз ни к чему.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';

export type ClubSettings = {
  openHour: number;
  closeHour: number;
  /** До этого часа действует утренний тариф, дальше — основной. */
  morningUntil: number;
  /** Предельная длительность одной брони, часов. */
  maxHours: number;
  /** За сколько часов отмена бесплатна. */
  cancelHours: number;
  /** Сколько минут держим неоплаченную заявку, пока её не подтвердят. */
  holdMinutes: number;

  /** Контакты клуба. Меняются менеджером из админки: путь подтверждения брони
   *  держится на них, и ради смены номера не должно требоваться новой сборки
   *  приложения. null — клуб ещё не заполнил, приложение честно это показывает. */
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  mapUrl: string | null;
  instagram: string | null;

  /** Доля предоплаты, проценты. Бронь подтверждают после неё. */
  prepayPercent: number;
  /** Сколько минут держим корт за опоздавшим. */
  lateMinutes: number;
  /** Прокат и раздевалка — свободный текст клуба. */
  rentalsText: string | null;
  /** Разделы, которые клуб может выключить, пока они не нужны. */
  showTournaments: boolean;
  showFootball: boolean;
};

/** Значения на случай, если строки настроек в базе почему-то нет.
 *  Совпадают с умолчаниями в sql/004_settings.sql. */
export const FALLBACK: ClubSettings = {
  openHour: 9, closeHour: 24, morningUntil: 13, maxHours: 3, cancelHours: 4,
  holdMinutes: 60,
  phone: null, whatsapp: null, address: null, mapUrl: null, instagram: null,
  prepayPercent: 50, lateMinutes: 15, rentalsText: null,
  showTournaments: true, showFootball: true,
};

/** Правило особой цены. Пустой days — любой день недели. */
export type PriceRule = {
  id: number;
  courtId: string | null;
  days: number[] | null;
  fromHour: number;
  toHour: number;
  price: number;
  note: string | null;
  sortOrder: number;
};

/** Площадка в том виде, в каком её знает расчёт цены. */
type PricedCourt = { id: string; price_morning: number; price_standard: number };

const CACHE_MS = 15_000;

@Injectable()
export class ClubService {
  private cache: ClubSettings | null = null;
  private readAt = 0;

  constructor(private readonly db: PrismaService) {}

  async get(): Promise<ClubSettings> {
    if (this.cache && Date.now() - this.readAt < CACHE_MS) return this.cache;
    const row = await this.db.settings.findUnique({ where: { id: 1 } });
    this.cache = row ? {
      openHour: row.open_hour,
      closeHour: row.close_hour,
      morningUntil: row.morning_until,
      maxHours: row.max_hours,
      cancelHours: row.cancel_hours,
      holdMinutes: row.hold_minutes,
      phone: row.phone ?? null,
      whatsapp: row.whatsapp ?? null,
      address: row.address ?? null,
      mapUrl: row.map_url ?? null,
      instagram: row.instagram ?? null,
      prepayPercent: row.prepay_percent,
      lateMinutes: row.late_minutes,
      rentalsText: row.rentals_text ?? null,
      showTournaments: row.show_tournaments,
      showFootball: row.show_football,
    } : FALLBACK;
    this.readAt = Date.now();
    return this.cache;
  }

  /** Освободить время у заявок, которые не подтвердили вовремя.
   *
   *  Оплата идёт через менеджера, поэтому заявка какое-то время висит
   *  неоплаченной и держит корт. Раньше держала вечно: человек мог записаться
   *  и пропасть. Теперь просроченная заявка перестаёт занимать время —
   *  и в расписании, и в запрете на пересечение на уровне базы.
   *
   *  Зовём перед выдачей расписания и перед созданием брони: отдельного
   *  планировщика для этого заводить не нужно, а задержки не будет. */
  private sweptAt = 0;

  async releaseExpired(): Promise<number> {
    // Раньше это была запись в базу на каждый показ расписания. Заявки живут
    // десятками минут, поэтому чаще раза в 20 секунд смотреть незачем.
    if (Date.now() - this.sweptAt < 20_000) return 0;
    this.sweptAt = Date.now();
    const r = await this.db.bookings.updateMany({
      where: { status: 'pending', hold_until: { lt: new Date() } },
      data: { status: 'expired', status_at: new Date(), status_by: 'срок вышел' },
    });
    return r.count;
  }

  /** Позвать после изменения настроек, чтобы не ждать истечения кэша. */
  forget() { this.cache = null; this.rulesCache = null }

  private rulesCache: PriceRule[] | null = null;
  private rulesAt = 0;

  /** Особые цены, уже отсортированные по важности: сначала правило про
   *  конкретную площадку, потом про конкретные дни, потом по порядку. */
  async rules(): Promise<PriceRule[]> {
    if (this.rulesCache && Date.now() - this.rulesAt < CACHE_MS) return this.rulesCache;
    const rows = await this.db.price_rules.findMany({ orderBy: [{ sort_order: 'asc' }, { id: 'asc' }] });
    const list: PriceRule[] = rows.map(r => ({
      id: Number(r.id),
      courtId: r.court_id,
      days: r.days && r.days.length ? r.days : null,
      fromHour: r.from_hour,
      toHour: r.to_hour,
      price: r.price,
      note: r.note,
      sortOrder: r.sort_order,
    }));
    // Чем правило конкретнее, тем оно важнее: «корт 3 в субботу» должно
    // побеждать «все корты по выходным», в каком бы порядке их ни завели.
    const weight = (r: PriceRule) => (r.courtId ? 2 : 0) + (r.days ? 1 : 0);
    list.sort((a, b) => weight(b) - weight(a) || a.sortOrder - b.sortOrder || a.id - b.id);
    this.rulesCache = list;
    this.rulesAt = Date.now();
    return list;
  }

  /** Всё, что нужно для расчёта цены, одним запросом. */
  async pricing(): Promise<Pricing> {
    const [set, rules] = await Promise.all([this.get(), this.rules()]);
    return new Pricing(set, rules);
  }
}


/** Считает цену часа. Собирается один раз на запрос, дальше работает без базы:
 *  сетка спрашивает цену для каждого часа каждой площадки. */
export class Pricing {
  constructor(readonly settings: ClubSettings, readonly rules: PriceRule[]) {}

  /** Цена одного часа. Первое подошедшее правило побеждает; если ни одно
   *  не подошло — обычная цена площадки. */
  hour(court: PricedCourt, weekday: number, hour: number): number {
    for (const r of this.rules) {
      if (r.courtId && r.courtId !== court.id) continue;
      if (r.days && !r.days.includes(weekday)) continue;
      if (hour < r.fromHour || hour >= r.toHour) continue;
      return r.price;
    }
    return hour < this.settings.morningUntil ? court.price_morning : court.price_standard;
  }

  /** Сумма за несколько часов подряд: часы могут попадать под разные тарифы. */
  span(court: PricedCourt, weekday: number, from: number, hours: number): number {
    let sum = 0;
    for (let h = from; h < from + hours; h++) sum += this.hour(court, weekday, h);
    return sum;
  }
}
