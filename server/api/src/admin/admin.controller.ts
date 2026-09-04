import {
  BadRequestException, Body, Controller, Get, NotFoundException,
  Param, Post, Query, UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { AdminGuard } from './admin.guard';
import { clubHour, clubToday, hourOf, isValidDate } from '../time';
import { CLOSE_HOUR, OPEN_HOUR } from '../club';

class StatusDto {
  @IsIn(['confirmed', 'cancelled', 'no_show', 'done'])
  status: 'confirmed' | 'cancelled' | 'no_show' | 'done';
}

class CloseCourtDto {
  @IsOptional() @IsString() @MaxLength(120) reason?: string;
  /** ISO-дата, до которой площадка закрыта. Пусто — открыть снова. */
  @IsOptional() @IsString() until?: string;
}

@UseGuards(AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly db: PrismaService) {}

  /** День менеджера: все заявки и брони на дату, по времени. */
  @Get('day')
  async day(@Query('date') date?: string) {
    const d = date || clubToday();
    if (!isValidDate(d)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');

    const rows = await this.db.bookings.findMany({
      where: { starts_at: { gte: clubHour(d, 0), lt: clubHour(d, 24) } },
      orderBy: [{ starts_at: 'asc' }, { court_id: 'asc' }],
    });
    const [courts, clients] = await Promise.all([
      this.db.courts.findMany({ orderBy: { sort_order: 'asc' } }),
      this.db.clients.findMany({ where: { id: { in: rows.map(r => r.client_id!).filter(Boolean) } } }),
    ]);
    const byId = new Map(clients.map(c => [String(c.id), c]));

    return {
      date: d,
      openHour: OPEN_HOUR,
      closeHour: CLOSE_HOUR,
      courts: courts.map(c => ({
        id: c.id, name: c.name, isActive: c.is_active,
        closedUntil: c.closed_until, closedReason: c.closed_reason,
      })),
      bookings: rows.map(b => {
        const cl = b.client_id ? byId.get(String(b.client_id)) : null;
        return {
          id: Number(b.id), courtId: b.court_id,
          hour: hourOf(b.starts_at),
          hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
          price: b.price, status: b.status, source: b.source,
          comment: b.comment, createdAt: b.created_at,
          client: cl ? {
            id: Number(cl.id), name: cl.name, phone: cl.phone,
            cancels: cl.cancels, noShows: cl.no_shows, note: cl.note,
          } : null,
        };
      }),
    };
  }

  /** Подтвердить, отменить или отметить, что не пришёл. */
  @Post('bookings/:id/status')
  async setStatus(@Param('id') id: string, @Body() dto: StatusDto) {
    const b = await this.db.bookings.findUnique({ where: { id: BigInt(id) } });
    if (!b) throw new NotFoundException('Запись не найдена');

    const ops: any[] = [
      this.db.bookings.update({ where: { id: b.id }, data: { status: dto.status } }),
    ];
    // История поведения клиента: менеджер должен видеть, кто часто пропадает
    if (b.client_id && b.status !== dto.status) {
      if (dto.status === 'no_show') {
        ops.push(this.db.clients.update({
          where: { id: b.client_id }, data: { no_shows: { increment: 1 } } }));
      } else if (dto.status === 'cancelled') {
        ops.push(this.db.clients.update({
          where: { id: b.client_id }, data: { cancels: { increment: 1 } } }));
      }
    }
    await this.db.$transaction(ops);
    return { id: Number(b.id), status: dto.status };
  }

  /** Занять время вручную: пришли без приложения, позвонили, турнир. */
  @Post('bookings')
  async createManual(@Body() body: {
    courtId: string; date: string; hour: number; hours: number;
    name?: string; phone?: string; comment?: string;
  }) {
    if (!isValidDate(body.date)) throw new BadRequestException('Дата в виде ГГГГ-ММ-ДД');
    const court = await this.db.courts.findUnique({ where: { id: body.courtId } });
    if (!court) throw new NotFoundException('Площадка не найдена');

    let clientId: bigint | null = null;
    if (body.phone) {
      const c = await this.db.clients.upsert({
        where: { phone: body.phone },
        update: body.name ? { name: body.name } : {},
        create: { phone: body.phone, name: body.name ?? 'Без имени' },
      });
      clientId = c.id;
    }

    let price = 0;
    for (let h = body.hour; h < body.hour + body.hours; h++) {
      price += h >= 18 ? court.price_evening : court.price_day;
    }

    try {
      const b = await this.db.bookings.create({ data: {
        court_id: court.id, client_id: clientId,
        starts_at: clubHour(body.date, body.hour),
        ends_at: clubHour(body.date, body.hour + body.hours),
        price, status: 'confirmed', source: 'admin', comment: body.comment,
      }});
      return { id: Number(b.id) };
    } catch (e: any) {
      if (String(e?.message).includes('23P01')) {
        throw new BadRequestException('Это время уже занято');
      }
      throw e;
    }
  }

  /** Закрыть площадку на ремонт или открыть обратно. */
  @Post('courts/:id/close')
  async closeCourt(@Param('id') id: string, @Body() dto: CloseCourtDto) {
    const court = await this.db.courts.findUnique({ where: { id } });
    if (!court) throw new NotFoundException('Площадка не найдена');
    const until = dto.until ? new Date(dto.until) : null;
    if (dto.until && Number.isNaN(+until!)) throw new BadRequestException('Неверная дата');
    await this.db.courts.update({
      where: { id },
      data: { closed_until: until, closed_reason: until ? (dto.reason ?? 'Закрыт') : null },
    });
    return { id, closedUntil: until, closedReason: until ? (dto.reason ?? 'Закрыт') : null };
  }

  /** Карточка клиента: вся история, включая отмены и неявки. */
  @Get('clients/:phone')
  async client(@Param('phone') phone: string) {
    const c = await this.db.clients.findUnique({ where: { phone } });
    if (!c) throw new NotFoundException('Клиент не найден');
    const rows = await this.db.bookings.findMany({
      where: { client_id: c.id }, orderBy: { starts_at: 'desc' }, take: 50,
    });
    const courts = new Map((await this.db.courts.findMany()).map(x => [x.id, x.name]));
    return {
      id: Number(c.id), name: c.name, phone: c.phone,
      cancels: c.cancels, noShows: c.no_shows, note: c.note,
      since: c.created_at,
      history: rows.map(b => ({
        id: Number(b.id), courtName: courts.get(b.court_id) ?? b.court_id,
        startsAt: b.starts_at, hours: Math.round((+b.ends_at - +b.starts_at) / 3600_000),
        price: b.price, status: b.status,
      })),
    };
  }
}
