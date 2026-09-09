import {
  BadRequestException, Body, ConflictException, Controller, Delete, Get,
  NotFoundException, Param, Post, Query,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookingDto } from './dto';
import { ClubService } from '../club';
import { normalizePhone } from '../phone';
import { clubHour, clubToday, hourOf, isValidDate, weekdayOf } from '../time';

/** Код PostgreSQL для нарушения exclusion-ограничения: время уже занято. */
const EXCLUSION_VIOLATION = '23P01';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly db: PrismaService,
    private readonly club: ClubService,
  ) {}

  /** Записи одного человека — ищем по телефону, входа в приложении нет. */
  @Get()
  async list(@Query('phone') phone?: string) {
    const key = normalizePhone(phone);
    if (!key) throw new BadRequestException('Нужен номер телефона');
    const client = await this.db.clients.findUnique({ where: { phone: key } });
    if (!client) return [];

    // Сначала освобождаем просроченные заявки: иначе человек увидит
    // «ждёт подтверждения» у брони, которую клуб уже отпустил.
    await this.club.releaseExpired();

    const rows = await this.db.bookings.findMany({
      where: { client_id: client.id, status: { not: 'cancelled' } },
      orderBy: { starts_at: 'asc' },
    });
    const courts = new Map((await this.db.courts.findMany()).map(c => [c.id, c.name]));

    return rows.map(b => ({
      id: Number(b.id),
      courtId: b.court_id,
      courtName: courts.get(b.court_id) ?? b.court_id,
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      hour: hourOf(b.starts_at),
      hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
      price: b.price,
      status: b.status,
      holdUntil: b.hold_until,
    }));
  }

  @Post()
  async create(@Body() dto: CreateBookingDto) {
    if (!isValidDate(dto.date)) throw new BadRequestException('Неверная дата');
    const bookingPhone = normalizePhone(dto.phone);
    if (!bookingPhone) throw new BadRequestException('Номер телефона неполный');
    await this.club.releaseExpired();
    const pricing = await this.club.pricing();
    const set = pricing.settings;
    if (dto.hour < set.openHour || dto.hour + dto.hours > set.closeHour) {
      throw new BadRequestException(`Клуб работает с ${set.openHour}:00 до ${set.closeHour}:00`);
    }
    if (dto.hours > set.maxHours) {
      throw new BadRequestException(`Больше ${set.maxHours} часов подряд занять нельзя`);
    }

    const court = await this.db.courts.findUnique({ where: { id: dto.courtId } });
    if (!court || !court.is_active) throw new NotFoundException('Площадка не найдена');
    if (court.closed_until && court.closed_until > new Date()) {
      throw new ConflictException({ code: 'court_closed', message: court.closed_reason ?? 'Площадка закрыта' });
    }

    const startsAt = clubHour(dto.date, dto.hour);
    const endsAt = clubHour(dto.date, dto.hour + dto.hours);
    if (startsAt < new Date()) throw new BadRequestException('Это время уже прошло');

    // Цена складывается по часам: часы могут попадать под разные тарифы
    const price = pricing.span(court, weekdayOf(dto.date), dto.hour, dto.hours);

    // Срок удержания считаем от «сейчас», но не дальше начала самой игры:
    // держать место после того, как игра началась, бессмысленно.
    const holdUntil = new Date(Math.min(
      Date.now() + set.holdMinutes * 60_000, +startsAt));

    // Второй номер запоминаем, но не затираем прежний пустым значением
    const wa = dto.whatsapp ? normalizePhone(dto.whatsapp) : null;
    const client = await this.db.clients.upsert({
      where: { phone: bookingPhone },
      update: { name: dto.name, ...(wa ? { whatsapp: wa } : {}) },
      create: { phone: bookingPhone, name: dto.name, whatsapp: wa },
    });

    try {
      const b = await this.db.bookings.create({
        data: {
          court_id: court.id, client_id: client.id,
          starts_at: startsAt, ends_at: endsAt,
          price, comment: dto.comment, source: 'app',
          // Держим время ограниченный срок: оплата идёт через менеджера,
          // и до подтверждения место не должно висеть занятым бесконечно.
          hold_until: holdUntil,
        },
      });
      return {
        id: Number(b.id), courtId: court.id, courtName: court.name,
        startsAt: b.starts_at, endsAt: b.ends_at, price, status: b.status,
        holdUntil: b.hold_until, holdMinutes: set.holdMinutes,
      };
    } catch (e: any) {
      // База не дала создать пересекающуюся бронь — значит время увели,
      // пока человек заполнял заявку. Отвечаем честно и с заменой.
      if (e?.meta?.code === EXCLUSION_VIOLATION || String(e?.message).includes(EXCLUSION_VIOLATION)) {
        throw new ConflictException({
          code: 'slot_taken',
          message: 'Это время только что заняли',
          alternatives: await this.alternatives(dto.date, dto.hour, dto.hours, court.id, set.closeHour),
        });
      }
      throw e;
    }
  }

  /** Отмена. Строку не удаляем: менеджеру нужна история отмен по клиенту. */
  @Delete(':id')
  async cancel(@Param('id') id: string, @Query('phone') phone?: string) {
    const key = normalizePhone(phone);
    if (!key) throw new BadRequestException('Нужен номер телефона');
    const client = await this.db.clients.findUnique({ where: { phone: key } });
    const booking = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!booking || !client || booking.client_id !== client.id) {
      throw new NotFoundException('Запись не найдена');
    }
    await this.db.$transaction([
      this.db.bookings.update({ where: { id: booking.id }, data: {
        status: 'cancelled', status_at: new Date(), status_by: 'client',
      }}),
      this.db.clients.update({ where: { id: client.id }, data: { cancels: { increment: 1 } } }),
    ]);
    return { id: Number(booking.id), status: 'cancelled' };
  }

  /** Чем заменить занятое время: сначала другие площадки того же типа
   *  в тот же час, потом ближайшее время на той же площадке. */
  private async alternatives(date: string, hour: number, hours: number,
                             exceptId: string, closeHour: number) {
    const courts = await this.db.courts.findMany({ where: { is_active: true }, orderBy: { sort_order: 'asc' } });
    const from = courts.find(c => c.id === exceptId);
    const busy = await this.db.bookings.findMany({
      where: {
        status: { not: 'cancelled' },
        starts_at: { gte: clubHour(date, 0), lt: clubHour(date, 24) },
      },
      select: { court_id: true, starts_at: true, ends_at: true },
    });

    const taken = (courtId: string, h: number, n: number) =>
      busy.some(b => b.court_id === courtId &&
        clubHour(date, h) < b.ends_at && clubHour(date, h + n) > b.starts_at);

    const sameTime = courts
      .filter(c => c.id !== exceptId && c.is_football === from?.is_football && !taken(c.id, hour, hours))
      .slice(0, 3)
      .map(c => ({ courtId: c.id, courtName: c.name, hour, hours }));

    let later: { courtId: string; courtName: string; hour: number; hours: number } | null = null;
    for (let h = hour + 1; h + hours <= closeHour; h++) {
      if (!taken(exceptId, h, hours)) {
        later = { courtId: exceptId, courtName: from?.name ?? exceptId, hour: h, hours };
        break;
      }
    }
    return { sameTime, later };
  }
}
