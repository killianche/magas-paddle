import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubService } from '../club';

@Controller('courts')
export class CourtsController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
  ) {}

  /** Площадки, которые показываются в приложении.
   *  Выключенные (is_active = false) не отдаются вовсе — так просил клуб. */
  @Get()
  async list() {
    const set = await this.club.get();
    const courts = await this.db.courts.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
    });
    return courts.map(c => ({
      id: c.id,
      name: c.name,
      isFootball: c.is_football,
      description: c.description,
      priceMorning: c.price_morning,
      priceStandard: c.price_standard,
      morningUntil: set.morningUntil,
      closedUntil: c.closed_until,
      closedReason: c.closed_reason,
    }));
  }

}

/** Всё о ценах разом: обычные тарифы площадок и особые цены.
 *  Нужен прайс-листу в приложении: без правил он показывал бы одну цену,
 *  а человек в субботу видел бы в сетке другую. */
@Controller('prices')
export class PricesController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
  ) {}

  @Get()
  async prices() {
    const [courts, pricing] = await Promise.all([
      this.db.courts.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' } }),
      this.club.pricing(),
    ]);
    return {
      openHour: pricing.settings.openHour,
      closeHour: pricing.settings.closeHour,
      morningUntil: pricing.settings.morningUntil,
      cancelHours: pricing.settings.cancelHours,
      courts: courts.map(c => ({
        id: c.id, name: c.name, isFootball: c.is_football,
        priceMorning: c.price_morning, priceStandard: c.price_standard,
      })),
      rules: pricing.rules.map(r => ({
        id: r.id, courtId: r.courtId, days: r.days,
        fromHour: r.fromHour, toHour: r.toHour, price: r.price, note: r.note,
      })),
    };
  }
}
