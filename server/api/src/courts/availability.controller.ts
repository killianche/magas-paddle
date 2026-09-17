import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubService, hoursOn } from '../club';
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
    // У каждого дня недели свои часы; в выходной клуба часов нет вовсе
    const dh = hoursOn(set, day);
    const open = dh.closed ? 0 : dh.open;
    const close = dh.closed ? 0 : dh.close;
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
      // Закрытие корта действует до своей даты: «до завтра» не должно
      // закрывать корт на всю неделю вперёд
      const closedUntil = c.closed_until;

      const hours = [];
      for (let h = open; h < close; h++) {
        const started = day === clubToday() && clubHour(day, h) <= now;
        const closed = closedUntil != null && closedUntil > clubHour(day, h);
        const status = closed ? 'closed'
          : started ? 'past'
          : busy.has(h) ? 'busy'
          : 'free';
        hours.push({
          hour: h,
          status,
          price: pricing.hour(c, dow, h),
          // Сколько часов подряд можно взять начиная с этого
          maxRun: status !== 'free' ? 0 : runFrom(day, h, busy, now, close, set.maxHours),
        });
      }
      // Корт «закрыт» на этот день, если закрытие покрывает весь день
      const closed = closedUntil != null && closedUntil >= clubHour(day, close);
      return { courtId: c.id, name: c.name, isFootball: c.is_football, closed, hours,
        photo: firstPhoto.get(c.id) ?? null,
        // Цвет и особенности — для карточек кортов на главной
        color: colorOf(c.color), tags: c.tags };
    });

    return {
      date: day,
      openHour: open,
      closeHour: close,
      /** Клуб в этот день не работает. */
      dayOff: dh.closed,
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
