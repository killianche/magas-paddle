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
};

/** Значения на случай, если строки настроек в базе почему-то нет.
 *  Совпадают с умолчаниями в sql/004_settings.sql. */
export const FALLBACK: ClubSettings = {
  openHour: 9, closeHour: 24, morningUntil: 13, maxHours: 3, cancelHours: 4,
};

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
    } : FALLBACK;
    this.readAt = Date.now();
    return this.cache;
  }

  /** Позвать после изменения настроек, чтобы не ждать истечения кэша. */
  forget() { this.cache = null }
}
