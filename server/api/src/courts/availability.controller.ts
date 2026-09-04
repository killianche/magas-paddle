import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CLOSE_HOUR, EVENING_FROM, MAX_HOURS, OPEN_HOUR } from '../club';
import { clubHour, clubToday, hourOf, isValidDate } from '../time';

@Controller('availability')
export class AvailabilityController {
  constructor(private readonly db: PrismaService) {}

  /** Сетка «часы × площадки» на один день — то, из чего рисуется главный экран.
   *  Отдаём сразу и статус часа, и цену, и сколько часов подряд свободно:
   *  иначе приложению пришлось бы считать это самому и врать при расхождении. */
  @Get()
  async grid(@Query('date') date?: string) {
    const day = date || clubToday();
    if (!isValidDate(day)) {
      throw new BadRequestException('Дата должна быть в виде ГГГГ-ММ-ДД');
    }

    const [courts, bookings] = await Promise.all([
      this.db.courts.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' } }),
      this.db.bookings.findMany({
        where: {
          status: { not: 'cancelled' },
          starts_at: { gte: clubHour(day, 0), lt: clubHour(day, 24) },
        },
        select: { court_id: true, starts_at: true, ends_at: true },
      }),
    ]);

    // Час считается прошедшим, как только он начался: в 12:05 записаться
    // «с 12:00» уже нельзя, и сетка не должна это предлагать.
    const now = new Date();

    const rows = courts.map(c => {
      const busy = new Set<number>();
      for (const b of bookings) {
        if (b.court_id !== c.id) continue;
        for (let h = hourOf(b.starts_at); h < hourOf(b.ends_at) || (hourOf(b.ends_at) === 0 && h < 24); h++) {
          busy.add(h);
        }
      }
      const closed = c.closed_until != null && c.closed_until > new Date();

      const hours = [];
      for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
        const started = day === clubToday() && clubHour(day, h) <= now;
        const status = closed ? 'closed'
          : started ? 'past'
          : busy.has(h) ? 'busy'
          : 'free';
        hours.push({
          hour: h,
          status,
          price: h >= EVENING_FROM ? c.price_evening : c.price_day,
          // Сколько часов подряд можно взять начиная с этого
          maxRun: status !== 'free' ? 0 : runFrom(day, h, busy, now),
        });
      }
      return { courtId: c.id, name: c.name, isFootball: c.is_football, closed, hours };
    });

    return {
      date: day,
      openHour: OPEN_HOUR,
      closeHour: CLOSE_HOUR,
      eveningFrom: EVENING_FROM,
      courts: rows,
    };
  }
}

/** Сколько часов подряд свободно, начиная с указанного, но не больше предела. */
function runFrom(day: string, from: number, busy: Set<number>, now: Date): number {
  let n = 0;
  for (let h = from; h < CLOSE_HOUR && n < MAX_HOURS; h++) {
    if (busy.has(h) || clubHour(day, h) <= now) break;
    n++;
  }
  return n;
}
