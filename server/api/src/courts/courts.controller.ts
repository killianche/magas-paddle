import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MORNING_UNTIL } from '../club';

@Controller('courts')
export class CourtsController {
  constructor(private readonly db: PrismaService) {}

  /** Площадки, которые показываются в приложении.
   *  Выключенные (is_active = false) не отдаются вовсе — так просил клуб. */
  @Get()
  async list() {
    const courts = await this.db.courts.findMany({
      where: { is_active: true },
      orderBy: { sort_order: 'asc' },
    });
    return courts.map(c => ({
      id: c.id,
      name: c.name,
      isFootball: c.is_football,
      priceMorning: c.price_morning,
      priceStandard: c.price_standard,
      morningUntil: MORNING_UNTIL,
      closedUntil: c.closed_until,
      closedReason: c.closed_reason,
    }));
  }
}
