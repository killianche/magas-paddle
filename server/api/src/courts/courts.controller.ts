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
      priceMorning: c.price_morning,
      priceStandard: c.price_standard,
      morningUntil: set.morningUntil,
      closedUntil: c.closed_until,
      closedReason: c.closed_reason,
    }));
  }
}
