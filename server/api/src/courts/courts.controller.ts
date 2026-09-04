import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EVENING_FROM } from '../club';

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
      priceDay: c.price_day,
      priceEvening: c.price_evening,
      eveningFrom: EVENING_FROM,
      closedUntil: c.closed_until,
      closedReason: c.closed_reason,
    }));
  }
}
