import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubService } from '../club';
import { colorOf } from './look';
import { clubHour, clubToday, hourOf, isValidDate, weekdayOf } from '../time';

@Controller('availability')
export class AvailabilityController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
  ) {}

  /** Сетка «часы × площадки» на один день — то, из чего рисуется главный экран.
   *  Отдаём сразу и статус часа, и цену, и сколько часов подряд свободно:
   *  иначе приложению пришлось бы считать это самому и врать при расхождении. */
  @Get()
  async grid(@Query('date') date?: string) {
    const day = date || clubToday();
    if (!isValidDate(day)) {
      throw new BadRequestException('Дата должна быть в виде ГГГГ-ММ-ДД');
    }

    // Заявки с вышедшим сроком не должны занимать время
    await this.club.releaseExpired();
    const pricing = await this.club.pricing();
    const set = pricing.settings;
    const dow = weekdayOf(day);
    const [courts, bookings] = await Promise.all([
      this.db.courts.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' } }),
      this.db.bookings.findMany({
        where: {
          status: { notIn: ['cancelled', 'expired'] },
          starts_at: { gte: clubHour(day, 0), lt: clubHour(day, 24) },
        },
        select: { court_id: true, starts_at: true, ends_at: true },
      }),
    ]);

    // Час считается прошедшим, как только он начался: в 12:05 записаться
    // «с 12:00» уже нельзя, и сетка не должна это предлагать.
    const now = new Date();

    // Главное фото каждого корта — первое по порядку, если клуб загружал.
    // Нужно карточкам на главной и превью в записи.
    const firstPhoto = new Map<string, string>();
    for (const ph of await this.db.court_photos.findMany({
      orderBy: [{ sort: 'asc' }, { id: 'asc' }] })) {
      if (!firstPhoto.has(ph.court_id)) firstPhoto.set(ph.court_id, ph.url);
    }

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
      for (let h = set.openHour; h < set.closeHour; h++) {
        const started = day === clubToday() && clubHour(day, h) <= now;
        const status = closed ? 'closed'
          : started ? 'past'
          : busy.has(h) ? 'busy'
          : 'free';
        hours.push({
          hour: h,
          status,
          price: pricing.hour(c, dow, h),
          // Сколько часов подряд можно взять начиная с этого
          maxRun: status !== 'free' ? 0 : runFrom(day, h, busy, now, set.closeHour, set.maxHours),
        });
      }
      return { courtId: c.id, name: c.name, isFootball: c.is_football, closed, hours,
        photo: firstPhoto.get(c.id) ?? null,
        // Цвет и особенности — для карточек кортов на главной
        color: colorOf(c.color), tags: c.tags };
    });

    return {
      date: day,
      openHour: set.openHour,
      closeHour: set.closeHour,
      morningUntil: set.morningUntil,
      maxHours: set.maxHours,
      courts: rows,
    };
  }
}

/** Сколько часов подряд свободно, начиная с указанного, но не больше предела. */
function runFrom(day: string, from: number, busy: Set<number>, now: Date,
                 closeHour: number, maxHours: number): number {
  let n = 0;
  for (let h = from; h < closeHour && n < maxHours; h++) {
    if (busy.has(h) || clubHour(day, h) <= now) break;
    n++;
  }
  return n;
}
